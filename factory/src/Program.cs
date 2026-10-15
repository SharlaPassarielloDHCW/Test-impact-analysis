using System.ComponentModel;
using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;

string? Option(string name) { var i = Array.IndexOf(args, name); return i >= 0 && i + 1 < args.Length ? args[i + 1] : null; }
async Task<(int Code, string Output)> RunProcess(string directory, string command, string[] arguments, CancellationToken cancellation = default)
{
    var start = new ProcessStartInfo(command) { WorkingDirectory = directory, UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
    foreach (var argument in arguments) start.ArgumentList.Add(argument);
    using var process = Process.Start(start)!;
    var stdout = process.StandardOutput.ReadToEndAsync(); var stderr = process.StandardError.ReadToEndAsync();
    try { await process.WaitForExitAsync(cancellation); }
    catch (OperationCanceledException) { if (!process.HasExited) process.Kill(true); throw; }
    var error = await stderr;
    if (process.ExitCode != 0) Console.Error.Write(error);
    return (process.ExitCode, await stdout);
}
async Task<(int Code, string Output)> Run(string directory, string command, params string[] arguments) =>
    await RunProcess(directory, command, arguments, CancellationToken.None);
var factory = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
while (Path.GetFileName(factory) != "factory") factory = Directory.GetParent(factory)!.FullName;
var runName = Option("--run");
if (string.IsNullOrWhiteSpace(runName) || runName != Path.GetFileName(runName) || runName is "." or "..")
{ Console.Error.WriteLine("a run is required: provide --run <name>"); return 1; }
var runFolder = Path.Combine(factory, "runs", runName);
var settingsFile = Path.Combine(runFolder, "run.json");
var seedArgument = Option("--seed");
var targetArgument = Option("--target");
var lineArgument = Option("--line");
string seed, target, lineName;
if (File.Exists(settingsFile))
{
    using var settings = JsonDocument.Parse(File.ReadAllText(settingsFile));
    var saved = settings.RootElement;
    seed = saved.GetProperty("seed").GetString()!;
    target = saved.GetProperty("target").GetString()!;
    lineName = saved.GetProperty("line").GetString()!;
    if (targetArgument != null && Path.GetFullPath(targetArgument) != target)
    { Console.Error.WriteLine($"the \"{runName}\" run already has a target"); return 1; }
    if (seedArgument != null && Path.GetFullPath(seedArgument) != seed)
    { Console.Error.WriteLine($"the \"{runName}\" run already has a seed"); return 1; }
    if (lineArgument != null && lineArgument != lineName)
    { Console.Error.WriteLine($"the \"{runName}\" run already has a line"); return 1; }
}
else
{
    if (targetArgument == null) { Console.Error.WriteLine("a target is required: provide --target <folder>"); return 1; }
    if (lineArgument == null) { Console.Error.WriteLine("a line is required: provide --line <name>"); return 1; }
    if (seedArgument == null) { Console.Error.WriteLine("no seed: provide --seed <file>"); return 1; }
    seed = Path.GetFullPath(seedArgument);
    target = Path.GetFullPath(targetArgument);
    lineName = lineArgument;
}
if (!File.Exists(seed)) { Console.Error.WriteLine("no seed"); return 1; }
if (!int.TryParse(Option("--attempts") ?? "3", out var attempts) || attempts < 1)
{ Console.Error.WriteLine("--attempts must be a positive integer"); return 1; }
var linePath = Path.Combine(target, ".assembly-lines", lineName + ".dot");
var edges = new List<Edge>();
var machines = new Dictionary<string, (string Harness, string Lens, string? Model, string? Prompt)>();
var fanOuts = new Dictionary<string, (string[] Branches, string Join)>();
try
{
    var line = File.ReadAllText(linePath);
    foreach (Match match in Regex.Matches(line, @"(?m)^[ \t]*(\w+)[ \t]*->[ \t]*(\w+)[ \t]*(?:\[label\s*=\s*""([^""]+)""\])?"))
        edges.Add(new(match.Groups[1].Value, match.Groups[2].Value, match.Groups[3].Success ? match.Groups[3].Value : null));
    foreach (var node in edges.SelectMany(e => new[] { e.From, e.To }).Distinct().Except(new[] { "start", "finish" }))
    {
        var file = Path.Combine(target, ".assembly-lines", ".machines", node, "config.json");
        if (!File.Exists(file)) throw new InvalidOperationException($"no machine called \"{node}\"");
        using var document = JsonDocument.Parse(File.ReadAllText(file));
        var root = document.RootElement;
        machines[node] = (root.TryGetProperty("harness", out var h) ? h.GetString() ?? "pi" : "pi",
            root.TryGetProperty("lens", out var l) ? l.GetString() ?? "testability" : "testability",
            root.TryGetProperty("model", out var m) ? m.GetString() : null,
            root.TryGetProperty("prompt", out var p) ? p.GetString() : null);
    }
    foreach (var node in machines.Keys.Reverse())
    {
        var seen = new HashSet<string>(); var pending = new Stack<string>(); pending.Push(node);
        while (pending.Count > 0) { var next = pending.Pop(); if (seen.Add(next)) foreach (var edge in edges.Where(e => e.From == next)) pending.Push(edge.To); }
        if (!seen.Contains("finish")) throw new InvalidOperationException($"finish cannot be reached from {node}");
    }
    if (!edges.Any(e => e.From == "start") || edges.Any(e => e.To == "finish" && e.From != "planner"))
        throw new InvalidOperationException("invalid assembly line");
    foreach (var group in edges.GroupBy(e => e.From).Where(g => g.Count() > 1 && g.All(e => e.Label == null)))
    {
        var branches = group.Select(e => e.To).ToArray();
        var exits = branches.Select(branch => edges.Where(e => e.From == branch).ToArray()).ToArray();
        if (branches.Distinct().Count() != branches.Length || exits.Any(e => e.Length != 1 || e[0].Label != null) ||
            exits.Select(e => e[0].To).Distinct().Count() != 1)
            throw new InvalidOperationException($"the branches from {group.Key} do not meet");
        fanOuts[group.Key] = (branches, exits[0][0].To);
    }
}
catch (Exception error) when (error is IOException or JsonException or InvalidOperationException)
{ Console.Error.WriteLine(error.Message); return 1; }
if (args.Contains("--check-line")) { Console.WriteLine("assembly line accepted"); return 0; }
var joinMachines = fanOuts.Values.Select(fanOut => fanOut.Join).ToHashSet();
Directory.CreateDirectory(runFolder);
if (!File.Exists(settingsFile)) File.WriteAllText(settingsFile, JsonSerializer.Serialize(new { seed, target, line = lineName }));
Directory.CreateDirectory(target);
var repository = await Run(target, "git", "rev-parse", "--show-toplevel");
if (repository.Code != 0)
{
    if ((await Run(target, "git", "init", "--quiet")).Code != 0) return 1;
    await Run(target, "git", "-c", "user.name=Factory", "-c", "user.email=factory@local", "commit", "--quiet", "--allow-empty", "-m", "Initialize target");
    repository = await Run(target, "git", "rev-parse", "--show-toplevel");
}
var rootPath = repository.Output.Trim();
var pathspec = ":(literal)" + Path.GetRelativePath(rootPath, target);
var plan = Path.Combine(runFolder, "plan.md");
var excludeState = ":(exclude,literal)" + Path.GetRelativePath(rootPath, Path.Combine(target, ".assembly-lines"));
var context = $"Read the seed at {JsonSerializer.Serialize(seed)} and the plan at {JsonSerializer.Serialize(plan)}. Work only in the current target. Do not commit; the factory handles Git.";
async Task<string> Git(params string[] arguments) { var result = await Run(rootPath, "git", arguments); if (result.Code != 0) throw new InvalidOperationException("Git operation failed"); return result.Output; }
async Task Commit()
{
    await Git("add", "--", pathspec, excludeState);
    if ((await Git("status", "--porcelain", "--", pathspec, excludeState)).Length > 0)
        await Git("commit", "--quiet", "--only", "-m", "Factory pass", "--", pathspec, excludeState);
}
async Task<string> WorkChanges()
{
    var changes = await Git("diff", "HEAD", "--", pathspec, excludeState);
    var files = await Git("ls-files", "--others", "--exclude-standard", "-z", "--", pathspec, excludeState);
    foreach (var file in files.Split('\0', StringSplitOptions.RemoveEmptyEntries))
    { var diff = await Run(rootPath, "git", "diff", "--no-index", "--", "/dev/null", file); if (diff.Code > 1) throw new InvalidOperationException("could not collect task changes"); changes += diff.Output; }
    return changes;
}
async Task<JsonElement> Call(string role, string prompt, CancellationToken cancellation = default)
{
    var harness = machines[role].Harness;
    if (harness.Contains(Path.DirectorySeparatorChar)) harness = Path.GetFullPath(harness);
    (int Code, string Output) answer;
    var arguments = new List<string> { "--print", "--no-session" };
    if (machines[role].Model is { } model) { arguments.Add("--model"); arguments.Add(model); }
    arguments.AddRange(["--", $"Role: {role}\n{prompt}"]);
    try { answer = await RunProcess(target, harness, arguments.ToArray(), cancellation); }
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
    string? joinedResults = null;
    while (current != "finish")
    {
        var fields = Fields(current);
        var request = fields.Length == 0 ? "" : $"End with one line of JSON with boolean field(s) {string.Join(", ", fields.Select(f => "\"" + f + "\""))}.";
        JsonElement result;
        if (current == "planner")
        {
            var recordCommittedTask = awaitingCommit;
            if (recordCommittedTask) { await Commit(); awaitingCommit = false; }
            var previousPlan = recordCommittedTask && File.Exists(plan) ? File.ReadAllText(plan) : "";
            var instruction = recordCommittedTask
                ? "Record the committed task: update the plan now to mark exactly the first unfinished task done. Preserve every other task and its findings and subtasks. Do not report completion until this update is written to disk."
                : "If the plan is missing, create a few tasks from the seed without doing product work. Otherwise inspect it; if task statuses are unclear, clarify them in the plan without changing the tasks.";
            instruction += " Make each task's done or unfinished state explicit in the plan. Report complete: true only if every task is marked done; otherwise report complete: false.";
            result = await Call(current, $"{context}\n{instruction}\nChange only the plan, never product code. {request}");
            if (recordCommittedTask && File.ReadAllText(plan) == previousPlan)
                throw new InvalidOperationException("planner did not update the plan after committed work");
            if (!hadPlan) hadPlan = true;
            attempt = 0; findings = "[]";
        }
        else if (current == "doer")
        {
            attempt++;
            result = await Call(current, $"{context}\nImplement only the first unfinished task. Do not mark that task done; the planner will do that after the work is committed.\nValidator findings from the last attempt: {findings}\nRecord each finding as a subtask of the current task, fix it, and mark the subtask done when resolved. Findings must not become new top-level tasks. End with one line of JSON describing the task you worked on. {request}");
            var doerEdges = edges.Where(e => e.From == "doer").ToArray();
            if (doerEdges.Length == 1 && doerEdges[0].To == "planner") { await Commit(); awaitingCommit = true; }
        }
        else if (current == "validator")
        {
            var lens = Option("--lens") ?? machines[current].Lens;
            var guidance = lens.Equals("testability", StringComparison.OrdinalIgnoreCase) ? "Look for logic testable independently of terminal I/O, time and randomness." : "";
            var changes = await WorkChanges();
            result = await Call(current, $"{context}\nReview only the current task's product changes below, through this lens: {lens}. {guidance}\nReport findings only: change neither plan nor product files, and do not commit. {request} Include array \"findings\".\nCurrent task changes:\n{changes}");
            if (!result.TryGetProperty("findings", out var reported) || reported.ValueKind != JsonValueKind.Array) throw new InvalidOperationException("could not read the validator's result");
            findings = reported.GetRawText();
        }
        else if (joinedResults != null)
        {
            result = await Call(current, $"The only input is the results from the branches: {joinedResults}\nDecide whether the current task is satisfied. {request} Include array \"findings\".");
            if (result.TryGetProperty("findings", out var reported) && reported.ValueKind == JsonValueKind.Array)
                findings = reported.GetRawText();
            joinedResults = null;
        }
        else result = await Call(current, $"{context}\n{request}");
        Console.WriteLine($"{current}: {result.GetRawText()}");
        if (fanOuts.TryGetValue(current, out var fanOut))
        {
            using var cancellation = new CancellationTokenSource();
            var changes = await WorkChanges();
            var calls = fanOut.Branches.Select(async branch =>
            {
                var job = machines[branch].Prompt ?? "Act on the current task's product changes and report your result. Do not commit.";
                var branchPrompt = $"{context}\n{job} Use this lens: {Option("--lens") ?? machines[branch].Lens}. End with one line of JSON containing your result and findings.\nCurrent task changes:\n{changes}";
                try { return (branch, result: await Call(branch, branchPrompt, cancellation.Token)); }
                catch { cancellation.Cancel(); throw; }
            }).ToArray();
            var reports = await Task.WhenAll(calls);
            joinedResults = JsonSerializer.Serialize(reports.ToDictionary(report => report.branch, report => report.result));
            current = fanOut.Join;
            continue;
        }
        var next = Route(current, result).To;
        if ((current == "validator" || joinMachines.Contains(current)) && next == "doer" && attempt >= attempts)
            throw new InvalidOperationException($"task hit its limit of {attempts} attempts; work left uncommitted");
        if ((current == "validator" || joinMachines.Contains(current)) && next == "planner") { await Commit(); awaitingCommit = true; findings = "[]"; }
        current = next;
    }
    await Commit(); Console.WriteLine("factory stopped"); return 0;
}
catch (InvalidOperationException error) { Console.Error.WriteLine(error.Message); return 1; }

record Edge(string From, string To, string? Label);
