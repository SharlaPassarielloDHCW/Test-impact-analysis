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
var seed = Path.GetFullPath(seedArgument);
var target = Path.GetFullPath(targetArgument);
var harness = Option("--agent") ?? "pi";
if (harness.Contains(Path.DirectorySeparatorChar)) harness = Path.GetFullPath(harness);
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
var prompt = $"""
    Work in the current target directory. Read the seed at {JsonSerializer.Serialize(seed)}.
    Keep the plan at {JsonSerializer.Serialize(plan)}.
    If there is no plan, write a few tasks from the seed and do no product work this pass.
    Otherwise, do only the first unfinished task, implement it, and mark it done in the plan.
    If nothing remains, record the final plan state.
    Do not commit: the factory commits the target's work and plan after this pass.
    End with a single line of JSON containing the boolean field "complete": true only when
    no tasks remain, false otherwise. Include a "task" field when you performed a task.
    """;

do
{
    (int Code, string Output) answer;
    try { answer = await Run(target, harness, "--print", "--no-session", "--", prompt); }
    catch (Win32Exception)
    {
        Console.Error.WriteLine("could not run the agent");
        return 1;
    }
    if (answer.Code != 0)
    {
        Console.Error.WriteLine("could not run the agent successfully");
        return 1;
    }
    JsonElement? result = null;
    foreach (var line in answer.Output.Split('\n').Reverse())
    {
        try { using var json = JsonDocument.Parse(line); result = json.RootElement.Clone(); break; }
        catch (JsonException) { }
    }
    if (result is not { ValueKind: JsonValueKind.Object } value ||
        !value.TryGetProperty("complete", out var complete) ||
        complete.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
    {
        Console.Error.WriteLine("could not read the agent's result");
        return 1;
    }
    if ((await Run(root, "git", "add", "--", pathspec)).Code != 0) return 1;
    var changes = await Run(root, "git", "status", "--porcelain", "--", pathspec);
    if (changes.Code != 0) return 1;
    if (changes.Output.Length > 0 &&
        (await Run(root, "git", "commit", "--quiet", "--only", "-m", "Factory pass", "--", pathspec)).Code != 0)
        return 1;
    Console.WriteLine(value.GetRawText());
    if (complete.GetBoolean()) break;
} while (args.Contains("--all"));
Console.WriteLine("factory stopped");
return 0;
