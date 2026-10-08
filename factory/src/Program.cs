using System.ComponentModel;
using System.Diagnostics;
using System.Text.Json;

string? Option(string name)
{
    var index = Array.IndexOf(args, name);
    return index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
}

async Task<(int Code, string Output)> Run(string directory, string command, params string[] arguments)
{
    var start = new ProcessStartInfo(command)
    {
        WorkingDirectory = directory, UseShellExecute = false,
        RedirectStandardOutput = true, RedirectStandardError = true
    };
    foreach (var argument in arguments) start.ArgumentList.Add(argument);
    using var process = Process.Start(start)!;
    var stdout = process.StandardOutput.ReadToEndAsync();
    var stderr = process.StandardError.ReadToEndAsync();
    await process.WaitForExitAsync();
    var error = await stderr;
    if (process.ExitCode != 0) Console.Error.Write(error);
    return (process.ExitCode, await stdout);
}

var seedArgument = Option("--seed");
if (seedArgument == null || !File.Exists(seedArgument))
{
    Console.Error.WriteLine("no seed: provide --seed <file>");
    return 1;
}
var targetArgument = Option("--target");
if (targetArgument == null)
{
    Console.Error.WriteLine("a target is required: provide --target <folder>");
    return 1;
}
if (!int.TryParse(Option("--attempts") ?? "3", out var attempts) || attempts < 1)
{
    Console.Error.WriteLine("--attempts must be a positive integer");
    return 1;
}
var lens = Option("--lens") ?? "testability";
var lensGuidance = lens.Equals("testability", StringComparison.OrdinalIgnoreCase)
    ? "Look for logic that can be tested independently of terminal I/O, time, randomness, and other external effects."
    : "";
var seed = Path.GetFullPath(seedArgument);
var target = Path.GetFullPath(targetArgument);
Directory.CreateDirectory(target);
var repository = await Run(target, "git", "rev-parse", "--show-toplevel");
if (repository.Code != 0)
{
    if ((await Run(target, "git", "init", "--quiet")).Code != 0) return 1;
    repository = await Run(target, "git", "rev-parse", "--show-toplevel");
}
var root = repository.Output.Trim();
var pathspec = ":(literal)" + Path.GetRelativePath(root, target);
var plan = Path.Combine(target, ".factory", "plan.md");
var excludeState = ":(exclude,literal)" + Path.GetRelativePath(root, Path.Combine(target, ".factory"));
var context = $"Read the seed at {JsonSerializer.Serialize(seed)} and the plan at {JsonSerializer.Serialize(plan)}. Work only in the current target. Do not commit; the factory handles Git.";

async Task<string> Git(params string[] arguments)
{
    var result = await Run(root, "git", arguments);
    if (result.Code != 0) throw new InvalidOperationException("Git operation failed");
    return result.Output;
}

async Task Commit()
{
    await Git("add", "--", pathspec);
    if ((await Git("status", "--porcelain", "--", pathspec)).Length > 0)
        await Git("commit", "--quiet", "--only", "-m", "Factory pass", "--", pathspec);
}

async Task<JsonElement> Call(string role, string prompt)
{
    var harness = Option("--" + role) ?? Option("--agent") ?? "pi";
    if (harness.Contains(Path.DirectorySeparatorChar)) harness = Path.GetFullPath(harness);
    (int Code, string Output) answer;
    try { answer = await Run(target, harness, "--print", "--no-session", "--", $"Role: {role}\n{prompt}"); }
    catch (Win32Exception) { throw new InvalidOperationException($"could not run the {role}"); }
    if (answer.Code != 0) throw new InvalidOperationException($"could not run the {role} successfully");
    foreach (var line in answer.Output.Split('\n').Reverse())
    {
        JsonDocument json;
        try { json = JsonDocument.Parse(line); }
        catch (JsonException) { continue; }
        using (json)
        {
            // The last JSON line is the result, even if its fields are invalid.
            if (json.RootElement.ValueKind != JsonValueKind.Object) break;
            return json.RootElement.Clone();
        }
    }
    throw new InvalidOperationException($"could not read the {role}'s result");
}

bool Boolean(JsonElement result, string field, string role)
{
    if (result.TryGetProperty(field, out var value) && value.ValueKind is JsonValueKind.True or JsonValueKind.False)
        return value.GetBoolean();
    throw new InvalidOperationException($"could not read the {role}'s result");
}

async Task<bool> Plan(string instruction)
{
    var result = await Call("planner", $"{context}\n{instruction}\nChange only the plan, never product code. End with one line of JSON with boolean field \"complete\": true only when no tasks remain.");
    var complete = Boolean(result, "complete", "planner");
    Console.WriteLine(result.GetRawText());
    return complete;
}

async Task<string> WorkChanges()
{
    // Include new product files without staging failed work or reading the plan.
    var changes = await Git("diff", "HEAD", "--", pathspec, excludeState);
    var newFiles = await Git("ls-files", "--others", "--exclude-standard", "-z", "--", pathspec, excludeState);
    foreach (var file in newFiles.Split('\0', StringSplitOptions.RemoveEmptyEntries))
    {
        var diff = await Run(root, "git", "diff", "--no-index", "--", "/dev/null", file);
        if (diff.Code > 1) throw new InvalidOperationException("could not collect the task's changes");
        changes += diff.Output;
    }
    return changes;
}

try
{
    var hadPlan = File.Exists(plan);
    var complete = await Plan("If the plan is missing, create a few tasks from the seed without doing product work. Otherwise inspect it without changing it and report whether it is complete.");
    if (!hadPlan || complete)
    {
        await Commit();
        if (complete || !args.Contains("--all")) { Console.WriteLine("factory stopped"); return 0; }
    }
    do
    {
        var findings = "[]";
        var satisfied = false;
        for (var attempt = 1; attempt <= attempts; attempt++)
        {
            await Call("doer", $"""
                {context}
                Implement only the first unfinished task. Do not mark that task done; the planner will do that after the work is committed.
                Validator findings from the last attempt: {findings}
                Record each finding as a subtask of the current task, fix it, and mark the subtask done when resolved.
                Findings must not become new top-level tasks. End with one line of JSON describing the task you worked on.
                """);
            var changes = await WorkChanges();
            var verdict = await Call("validator", $"""
                Review only the current task's product changes below, through this lens: {lens}.
                {lensGuidance}
                Do not recheck earlier completed tasks. Report findings only: change neither the plan nor product files, and do not commit.
                End with one line of JSON with boolean "satisfied" and array "findings" describing any required fixes.
                Current task changes:
                {changes}
                """);
            satisfied = Boolean(verdict, "satisfied", "validator");
            if (!verdict.TryGetProperty("findings", out var reported) || reported.ValueKind != JsonValueKind.Array)
                throw new InvalidOperationException("could not read the validator's result");
            findings = reported.GetRawText();
            Console.WriteLine(verdict.GetRawText());
            if (satisfied) break;
        }
        if (!satisfied) throw new InvalidOperationException($"pass hit its limit of {attempts} attempts; work left uncommitted");
        await Commit();
        complete = await Plan("Record the committed task: mark the first unfinished task done now that its work has been validated and committed. Preserve its recorded findings and subtasks. Report whether any tasks remain.");
        await Commit();
        if (complete) break;
    } while (args.Contains("--all"));
    Console.WriteLine("factory stopped");
    return 0;
}
catch (InvalidOperationException error)
{
    Console.Error.WriteLine(error.Message);
    return 1;
}
