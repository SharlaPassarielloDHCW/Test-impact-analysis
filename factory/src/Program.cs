using System.ComponentModel;
using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;

string? Option(string name) { var i = Array.IndexOf(args, name); return i >= 0 && i + 1 < args.Length ? args[i + 1] : null; }
async Task<(int Code, string Output)> Run(string directory, string command, params string[] arguments)
{
    var start = new ProcessStartInfo(command) { WorkingDirectory = directory, UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
    foreach (var argument in arguments) start.ArgumentList.Add(argument);
    using var process = Process.Start(start)!;
    var stdout = process.StandardOutput.ReadToEndAsync(); var stderr = process.StandardError.ReadToEndAsync();
    await process.WaitForExitAsync(); var error = await stderr;
    if (process.ExitCode != 0) Console.Error.Write(error);
    return (process.ExitCode, await stdout);
}
var home = AppContext.BaseDirectory;
var edges = new List<Edge>();
var machines = new Dictionary<string, (string Harness, string Lens)>();
try
{
    var line = File.ReadAllText(Path.Combine(home, "assembly-line", "line.dot"));
    foreach (Match match in Regex.Matches(line, @"(?m)^[ \t]*(\w+)[ \t]*->[ \t]*(\w+)[ \t]*(?:\[label\s*=\s*""([^""]+)""\])?"))
        edges.Add(new(match.Groups[1].Value, match.Groups[2].Value, match.Groups[3].Success ? match.Groups[3].Value : null));
    foreach (var node in edges.SelectMany(e => new[] { e.From, e.To }).Distinct().Except(new[] { "start", "finish" }))
    {
        var file = Path.Combine(home, "machines", node + ".json");
        if (!File.Exists(file)) throw new InvalidOperationException($"no machine called \"{node}\"");
        using var document = JsonDocument.Parse(File.ReadAllText(file));
        var root = document.RootElement;
        machines[node] = (root.TryGetProperty("harness", out var h) ? h.GetString() ?? "pi" : "pi",
            root.TryGetProperty("lens", out var l) ? l.GetString() ?? "testability" : "testability");
    }
    foreach (var node in machines.Keys.Reverse())
    {
        var seen = new HashSet<string>(); var pending = new Stack<string>(); pending.Push(node);
        while (pending.Count > 0) { var next = pending.Pop(); if (seen.Add(next)) foreach (var edge in edges.Where(e => e.From == next)) pending.Push(edge.To); }
        if (!seen.Contains("finish")) throw new InvalidOperationException($"finish cannot be reached from {node}");
    }
    if (!edges.Any(e => e.From == "start") || edges.Any(e => e.To == "finish" && e.From != "planner"))
        throw new InvalidOperationException("invalid assembly line");
}
catch (Exception error) when (error is IOException or JsonException or InvalidOperationException)
{ Console.Error.WriteLine(error.Message); return 1; }
if (args.Contains("--check-line")) { Console.WriteLine("assembly line accepted"); return 0; }
var seedArgument = Option("--seed");
if (seedArgument == null || !File.Exists(seedArgument)) { Console.Error.WriteLine("no seed: provide --seed <file>"); return 1; }
var targetArgument = Option("--target");
if (targetArgument == null) { Console.Error.WriteLine("a target is required: provide --target <folder>"); return 1; }
if (!int.TryParse(Option("--attempts") ?? "3", out var attempts) || attempts < 1)
{ Console.Error.WriteLine("--attempts must be a positive integer"); return 1; }
var seed = Path.GetFullPath(seedArgument); var target = Path.GetFullPath(targetArgument);
Directory.CreateDirectory(target);
var repository = await Run(target, "git", "rev-parse", "--show-toplevel");
if (repository.Code != 0) { if ((await Run(target, "git", "init", "--quiet")).Code != 0) return 1; repository = await Run(target, "git", "rev-parse", "--show-toplevel"); }
var rootPath = repository.Output.Trim();
var pathspec = ":(literal)" + Path.GetRelativePath(rootPath, target);
var plan = Path.Combine(target, ".factory", "plan.md");
var excludeState = ":(exclude,literal)" + Path.GetRelativePath(rootPath, Path.Combine(target, ".factory"));
var context = $"Read the seed at {JsonSerializer.Serialize(seed)} and the plan at {JsonSerializer.Serialize(plan)}. Work only in the current target. Do not commit; the factory handles Git.";
async Task<string> Git(params string[] arguments) { var result = await Run(rootPath, "git", arguments); if (result.Code != 0) throw new InvalidOperationException("Git operation failed"); return result.Output; }
async Task Commit()
{
    await Git("add", "--", pathspec);
    if ((await Git("status", "--porcelain", "--", pathspec)).Length > 0)
        await Git("commit", "--quiet", "--only", "-m", "Factory pass", "--", pathspec);
}
async Task<string> WorkChanges()
{
    var changes = await Git("diff", "HEAD", "--", pathspec, excludeState);
    var files = await Git("ls-files", "--others", "--exclude-standard", "-z", "--", pathspec, excludeState);
    foreach (var file in files.Split('\0', StringSplitOptions.RemoveEmptyEntries))
    { var diff = await Run(rootPath, "git", "diff", "--no-index", "--", "/dev/null", file); if (diff.Code > 1) throw new InvalidOperationException("could not collect task changes"); changes += diff.Output; }
    return changes;
}
async Task<JsonElement> Call(string role, string prompt)
{
    var harness = machines[role].Harness;
    if (harness.Contains(Path.DirectorySeparatorChar)) harness = Path.GetFullPath(harness);
    (int Code, string Output) answer;
    try { answer = await Run(target, harness, "--print", "--no-session", "--", $"Role: {role}\n{prompt}"); }
    catch (Win32Exception) { throw new InvalidOperationException($"could not run the {role}"); }
    if (answer.Code != 0) throw new InvalidOperationException($"could not run the {role} successfully");
    foreach (var line in answer.Output.Split('\n').Reverse())
    {
        try { using var json = JsonDocument.Parse(line); if (json.RootElement.ValueKind == JsonValueKind.Object) return json.RootElement.Clone(); break; }
        catch (JsonException) { }
    }
    throw new InvalidOperationException($"could not read the {role}'s result");
}
string[] Fields(string role) => edges.Where(e => e.From == role && e.Label != null)
    .Select(e => e.Label!.StartsWith("not ") ? e.Label[4..] : e.Label).Distinct().ToArray();
Edge Route(string role, JsonElement result)
{
    foreach (var edge in edges.Where(e => e.From == role))
    {
        if (edge.Label == null) return edge;
        var field = edge.Label.StartsWith("not ") ? edge.Label[4..] : edge.Label;
        if (!result.TryGetProperty(field, out var value) || value.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            throw new InvalidOperationException($"result of {role} has no field \"{field}\"");
        if (value.GetBoolean() != edge.Label.StartsWith("not ")) return edge;
    }
    throw new InvalidOperationException($"no route from {role}");
}
try
{
    var current = edges.Single(e => e.From == "start").To;
    var findings = "[]"; var attempt = 0; var awaitingCommit = false; var hadPlan = File.Exists(plan);
    while (current != "finish")
    {
        var fields = Fields(current);
        var request = fields.Length == 0 ? "" : $"End with one line of JSON with boolean field(s) {string.Join(", ", fields.Select(f => "\"" + f + "\""))}.";
        JsonElement result;
        if (current == "planner")
        {
            if (awaitingCommit) { await Commit(); awaitingCommit = false; }
            var instruction = attempt > 0 && findings == "[]"
                ? "Record the committed task: mark the first unfinished task done now that its work has been validated and committed. Preserve its recorded findings and subtasks. Report whether any tasks remain."
                : "If the plan is missing, create a few tasks from the seed without doing product work. Otherwise inspect it without changing it and report whether it is complete.";
            result = await Call(current, $"{context}\n{instruction}\nChange only the plan, never product code. {request}");
            if (!hadPlan) { await Commit(); hadPlan = true; }
            attempt = 0; findings = "[]";
        }
        else if (current == "doer")
        {
            attempt++;
            result = await Call(current, $"{context}\nImplement only the first unfinished task. Do not mark that task done; the planner will do that after the work is committed.\nValidator findings from the last attempt: {findings}\nRecord each finding as a subtask of the current task, fix it, and mark the subtask done when resolved. Findings must not become new top-level tasks. End with one line of JSON describing the task you worked on. {request}");
            if (!machines.ContainsKey("validator")) { await Commit(); awaitingCommit = true; }
        }
        else if (current == "validator")
        {
            var lens = Option("--lens") ?? machines[current].Lens;
            var guidance = lens.Equals("testability", StringComparison.OrdinalIgnoreCase) ? "Look for logic testable independently of terminal I/O, time and randomness." : "";
            var changes = await WorkChanges();
            result = await Call(current, $"Review only the current task's product changes below, through this lens: {lens}. {guidance}\nReport findings only: change neither plan nor product files, and do not commit. {request} Include array \"findings\".\nCurrent task changes:\n{changes}");
            if (!result.TryGetProperty("findings", out var reported) || reported.ValueKind != JsonValueKind.Array) throw new InvalidOperationException("could not read the validator's result");
            findings = reported.GetRawText();
        }
        else result = await Call(current, $"{context}\n{request}");
        var next = Route(current, result).To;
        if (current == "validator" && next == "doer" && attempt >= attempts)
            throw new InvalidOperationException($"task hit its limit of {attempts} attempts; work left uncommitted");
        if (current == "validator" && next == "planner") { await Commit(); awaitingCommit = true; findings = "[]"; }
        current = next;
    }
    await Commit(); Console.WriteLine("factory stopped"); return 0;
}
catch (InvalidOperationException error) { Console.Error.WriteLine(error.Message); return 1; }

record Edge(string From, string To, string? Label);
