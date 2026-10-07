using System.Diagnostics;
using System.Text.Json;
using NUnit.Framework;
using Reqnroll;

namespace Factory.Tests;

[Binding]
public sealed class FactorySteps
{
    string workspace = "", repo = "", target = "", seed = "", harness = "";
    string output = "";
    int exitCode;
    readonly Dictionary<string, object> behavior = new();
    string Log => Path.Combine(workspace, "calls.jsonl");
    string Plan => Path.Combine(target, ".factory", "plan.md");
    static string SourceRoot
    {
        get
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (!File.Exists(Path.Combine(dir!.FullName, "Factory.Tests.csproj"))) dir = dir.Parent;
            return dir.FullName;
        }
    }
    static (int Code, string Output) Run(string cwd, string command, IEnumerable<string> args,
        Dictionary<string, string>? environment = null)
    {
        var start = new ProcessStartInfo(command) { WorkingDirectory = cwd, RedirectStandardOutput = true,
            RedirectStandardError = true, UseShellExecute = false };
        foreach (var arg in args) start.ArgumentList.Add(arg);
        if (environment != null) foreach (var pair in environment) start.Environment[pair.Key] = pair.Value;
        using var process = Process.Start(start)!;
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        if (!process.WaitForExit(30000)) { process.Kill(true); process.WaitForExit(); Assert.Fail("Factory did not stop within 30 seconds."); }
        return (process.ExitCode, stdout.GetAwaiter().GetResult() + stderr.GetAwaiter().GetResult());
    }
    string Git(params string[] args)
    {
        var result = Run(repo, "git", args);
        Assert.That(result.Code, Is.Zero, result.Output);
        return result.Output.TrimEnd();
    }
    [Given("a copy of the factory")]
    public void CopyFactory()
    {
        workspace = Path.Combine(Path.GetTempPath(), "factory-test-" + Guid.NewGuid());
        repo = Path.Combine(workspace, "repo");
        Directory.CreateDirectory(Path.Combine(repo, "factory"));
        foreach (var file in Directory.GetFiles(Path.Combine(SourceRoot, "src/bin/Debug/net10.0")))
            File.Copy(file, Path.Combine(repo, "factory", Path.GetFileName(file)));
        Git("init", "-q"); Git("config", "user.name", "Factory Test"); Git("config", "user.email", "factory@example.test");
        Git("add", "."); Git("commit", "-qm", "Initial factory");
        Directory.CreateDirectory(Path.Combine(workspace, "agents"));
        foreach (var name in new[] { "pi", "chosen-agent" })
        {
            var path = Path.Combine(workspace, "agents", name);
            File.Copy(Path.Combine(SourceRoot, "Steps/Doubles/agent.py"), path);
            if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        }
        harness = Path.Combine(workspace, "agents/chosen-agent");
    }
    [Given("a new target")]
    public void NewTarget() { target = Path.Combine(repo, "output"); Directory.CreateDirectory(target); }
    [Given("a seed describing a game of Tetris")]
    public void Seed() { seed = Path.Combine(repo, "seed.md"); File.WriteAllText(seed, "Build terminal Tetris."); }
    [Given("the agent plans the tasks alpha and beta, and does one task a pass")]
    public void DefaultAgent() { }
    [Given("no harness is chosen")]
    public void DefaultHarness() => harness = "";
    [When("the factory runs one pass")]
    public void OnePass() => Invoke(false);
    void Invoke(bool all)
    {
        beforeHead = Git("rev-parse", "HEAD");
        File.WriteAllText(Path.Combine(workspace, "behavior.json"), JsonSerializer.Serialize(behavior));
        var args = new List<string> { Path.Combine(repo, "factory/Factory.dll") };
        if (seed != "") args.AddRange(["--seed", Path.GetRelativePath(repo, seed)]);
        if (target != "") args.AddRange(["--target", absoluteTarget ? target : Path.GetRelativePath(repo, target)]);
        if (harness != "") args.AddRange(["--agent", harness]);
        if (all) args.Add("--all");
        var dotnet = Environment.GetEnvironmentVariable("DOTNET_HOST_PATH") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".dotnet/dotnet");
        (exitCode, output) = Run(repo, dotnet, args, new()
        {
            ["PATH"] = Path.Combine(workspace, "agents") + ":" + Environment.GetEnvironmentVariable("PATH"),
            ["FACTORY_TEST_WORKSPACE"] = workspace,
            ["GIT_AUTHOR_NAME"] = "Factory Test", ["GIT_AUTHOR_EMAIL"] = "factory@example.test",
            ["GIT_COMMITTER_NAME"] = "Factory Test", ["GIT_COMMITTER_EMAIL"] = "factory@example.test"
        });
    }
    string[] Calls => File.Exists(Log) ? File.ReadAllLines(Log) : [];
    [Then("pi has been called")]
    public void PiCalled() => Assert.That(Calls.Any(line => JsonDocument.Parse(line).RootElement.GetProperty("agent").GetString() == "pi"), Is.True, output);
    [Then("the chosen agent has been called")]
    public void ChosenCalled() => Assert.That(Calls.Any(line => JsonDocument.Parse(line).RootElement.GetProperty("agent").GetString() == "chosen-agent"), Is.True, output);
    [Then("pi has not been called")]
    public void PiNotCalled() => Assert.That(Calls.Any(line => JsonDocument.Parse(line).RootElement.GetProperty("agent").GetString() == "pi"), Is.False);
    [Given("the agent cannot be run")]
    public void MissingAgent() => harness = Path.Combine(workspace, "missing-agent");
    [Given("no plan")]
    public void NoPlan() { if (File.Exists(Plan)) File.Delete(Plan); }
    [Then("there is no plan")]
    public void NoPlanResult() => Assert.That(File.Exists(Plan), Is.False);
    [Then("it reports that it could not run the agent")]
    public void AgentError() { Assert.That(exitCode, Is.Not.Zero); Assert.That(output, Does.Contain("could not run the agent")); }
    string beforeHead = "";
    [Then("there are no new commits")]
    public void NoCommits() => Assert.That(Git("rev-parse", "HEAD"), Is.EqualTo(beforeHead));
    [Then("the plan has the tasks {string} and {string}, and no others")]
    public void TwoTasks(string first, string second) => Assert.That(Tasks(), Is.EqualTo(new[] { first, second }));
    string[] Tasks() => File.ReadAllLines(Plan).Where(l => l.StartsWith("- [")).Select(l => l[6..]).ToArray();
    void SetPlan(int done)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Plan)!);
        File.WriteAllLines(Plan, new[] { "alpha", "beta", "gamma" }.Select((t, i) => $"- [{(i < done ? "x" : " ")}] {t}"));
        Git("add", "--", Path.GetRelativePath(repo, Plan));
        Git("commit", "-qm", "Existing plan", "--", Path.GetRelativePath(repo, Plan));
    }
    [Given("a plan with three tasks, none of them done")]
    public void ThreeTasks() => SetPlan(0);
    [Given("a plan whose first task is done")]
    public void FirstDone() => SetPlan(1);
    [Given("a plan in which every task is done")]
    public void AllDone()
    {
        SetPlan(3);
        File.AppendAllText(Plan, "\nAll work recorded.\n");
        Git("add", "--", Path.GetRelativePath(repo, Plan));
        Git("commit", "-qm", "Completed plan", "--", Path.GetRelativePath(repo, Plan));
    }
    [Given("the agent writes a file called SENTINEL")]
    public void Sentinel() => behavior["file"] = "SENTINEL";
    string[] NewCommits => Git("rev-list", "--reverse", beforeHead + "..HEAD").Split('\n', StringSplitOptions.RemoveEmptyEntries);
    string[] ProductFiles(string commit) => Git("diff-tree", "--no-commit-id", "--name-only", "-r", commit, "--", Path.GetRelativePath(repo, target))
        .Split('\n', StringSplitOptions.RemoveEmptyEntries).Where(p => !p.Contains("/.factory/")).ToArray();
    string[] WorkCommits => NewCommits.Where(c => ProductFiles(c).Length > 0).ToArray();
    [Then("there is one new work commit")]
    public void OneCommit() { Assert.That(exitCode, Is.Zero, output); Assert.That(WorkCommits, Has.Length.EqualTo(1)); }
    [Then("its only product file is SENTINEL")]
    public void OnlySentinel() => Assert.That(ProductFiles(WorkCommits.Single()).Select(Path.GetFileName), Is.EqualTo(new[] { "SENTINEL" }));
    [Then("the agent was pointed at the plan and at the seed")]
    public void PathsGiven()
    {
        Assert.That(Calls, Is.Not.Empty);
        foreach (var call in Calls)
        {
            var data = JsonDocument.Parse(call).RootElement;
            var prompt = string.Join(" ", data.GetProperty("args").EnumerateArray().Select(a => a.GetString()));
            Assert.That(prompt, Does.Contain(Plan).And.Contain(seed));
            Assert.That(data.GetProperty("cwd").GetString(), Is.EqualTo(target));
        }
    }
    [Then("the agent was asked for a result with the field {string}")]
    public void ResultRequested(string field)
    {
        Assert.That(Calls, Is.Not.Empty);
        var prompt = string.Join(" ", JsonDocument.Parse(Calls[0]).RootElement.GetProperty("args").EnumerateArray().Select(a => a.GetString()));
        Assert.That(prompt, Does.Contain(field).And.Contain("JSON"));
    }
    [Given("the agent says {string} before its result")]
    public void Talk(string text) => behavior["talk"] = text;
    [When("the factory runs to completion")]
    public void ToCompletion() => Invoke(true);
    [Then("the agent has been called once")]
    public void CalledOnce() => Assert.That(Calls, Has.Length.EqualTo(1));
    [Then("the factory has stopped")]
    public void Stopped() => Assert.That(exitCode, Is.EqualTo(behavior.ContainsKey("prose_result") ? 1 : 0), output);
    [Then("the plan shows the first task as done")]
    public void FirstTaskDone() => Assert.That(File.ReadAllLines(Plan)[0], Is.EqualTo("- [x] alpha"));
    [Then("the plan shows the other two as not done")]
    public void OtherTasksNotDone() => Assert.That(File.ReadAllLines(Plan).Skip(1).Take(2), Is.EqualTo(new[] { "- [ ] beta", "- [ ] gamma" }));
    [Then("it contains the work for the first task")]
    public void FirstWork() => Assert.That(Git("show", WorkCommits.Single() + ":" + Path.GetRelativePath(repo, Path.Combine(target, "alpha.txt"))), Is.EqualTo("work for alpha"));
    [Then("it contains the work for the second task")]
    public void SecondWork() => Assert.That(Git("show", WorkCommits.Single() + ":" + Path.GetRelativePath(repo, Path.Combine(target, "beta.txt"))), Is.EqualTo("work for beta"));
    [Then("the plan shows every task as done")]
    public void EveryTaskDone() { Assert.That(Tasks(), Is.Not.Empty); Assert.That(File.ReadAllText(Plan), Does.Not.Contain("- [ ]")); }
    [Then("there are three new work commits")]
    public void ThreeCommits() => Assert.That(WorkCommits, Has.Length.EqualTo(3));
    [Given("the agent answers in prose, with no result")]
    public void ProseResult() => behavior["prose_result"] = true;
    [Then("it reports that it could not read the agent's result")]
    public void ResultError() { Assert.That(exitCode, Is.Not.Zero); Assert.That(output, Does.Contain("could not read the agent's result")); }
    [Given("no seed is chosen")]
    public void NoSeed() => seed = "";
    [Given("the seed has been deleted")]
    public void DeleteSeed() => File.Delete(seed);
    [Then("it reports that there is no seed")]
    public void SeedError() { Assert.That(exitCode, Is.Not.Zero); Assert.That(output, Does.Contain("no seed")); }
    [Then("no agent has been called")]
    public void NoAgent() => Assert.That(Calls, Is.Empty);
    [Then("there is a plan")]
    public void HasPlan() => Assert.That(File.Exists(Plan), Is.True, output);
    [Then("the plan shows every task as not done")]
    public void NoneDone() { Assert.That(Tasks(), Is.Not.Empty); Assert.That(File.ReadAllText(Plan), Does.Not.Contain("- [x]")); }
    [Then("there are no new work commits")]
    public void NoWorkCommits() => Assert.That(WorkCommits, Is.Empty);
    [Then("the committed plan matches the plan on disk")]
    public void CommittedPlan() => Assert.That(Git("show", "HEAD:" + Path.GetRelativePath(repo, Plan)), Is.EqualTo(File.ReadAllText(Plan).TrimEnd()));
    [Then("the target has no uncommitted changes")]
    public void CleanTarget() => Assert.That(Git("status", "--porcelain", "--", Path.GetRelativePath(repo, target)), Is.Empty);
    [Then("the plan still has those three tasks")]
    public void SameTasks() => Assert.That(Tasks(), Is.EqualTo(new[] { "alpha", "beta", "gamma" }));
    [Then(@"^the plan is \.factory/plan\.md in the target$")]
    public void PlanInTarget() => HasPlan();
    [Then("there is no plan in the factory's folder")]
    public void NoFactoryPlan() => Assert.That(Directory.GetFiles(Path.Combine(repo, "factory"), "plan.md", SearchOption.AllDirectories), Is.Empty);
    [Then("the plan shows the first two tasks as done")]
    public void TwoDone() => Assert.That(File.ReadAllLines(Plan).Take(2), Is.EqualTo(new[] { "- [x] alpha", "- [x] beta" }));
    [Given("the agent keeps its plan in prose")]
    public void ProsePlan() => behavior["prose_plan"] = true;
    [Then("the work for alpha and beta has been committed")]
    public void BothCommitted()
    {
        foreach (var task in new[] { "alpha", "beta" })
            Assert.That(Git("show", "HEAD:" + Path.GetRelativePath(repo, Path.Combine(target, task + ".txt"))), Is.EqualTo("work for " + task));
    }
    string unrelatedBefore = "";
    string UnrelatedState() => Git("status", "--porcelain", "--", "factory", "unrelated.txt", "seed.md") +
        Git("diff", "--", "factory", "unrelated.txt") + Git("diff", "--cached", "--", "factory", "unrelated.txt") +
        string.Join("\n", Directory.GetFiles(Path.Combine(repo, "factory")).Order().Select(p => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(p))))) +
        File.ReadAllText(Path.Combine(repo, "unrelated.txt"));
    [Given("the factory has staged and unstaged changes")]
    public void DirtyFactory()
    {
        var factoryFile = Path.Combine(repo, "factory/student.txt");
        var unrelated = Path.Combine(repo, "unrelated.txt");
        File.WriteAllText(factoryFile, "original factory"); File.WriteAllText(unrelated, "original unrelated");
        Git("add", "factory/student.txt", "unrelated.txt"); Git("commit", "-qm", "Student files");
        File.WriteAllText(factoryFile, "staged factory"); File.WriteAllText(unrelated, "staged unrelated");
        Git("add", "factory/student.txt", "unrelated.txt");
        File.AppendAllText(factoryFile, " plus unstaged factory"); File.AppendAllText(unrelated, " plus unstaged unrelated");
        unrelatedBefore = UnrelatedState();
    }
    [Then("the factory's own files and unrelated uncommitted changes are as they were")]
    public void UnrelatedUnchanged() => Assert.That(UnrelatedState(), Is.EqualTo(unrelatedBefore));
    [Given("no target is chosen")]
    public void NoTarget() => target = "";
    [Then("it reports that a target is required")]
    public void TargetError() { Assert.That(exitCode, Is.Not.Zero); Assert.That(output, Does.Contain("target is required")); }
    [Given("the target folder does not exist")]
    public void RemoveTarget() => Directory.Delete(target, true);
    [Then("the target uses the containing repository")]
    public void ContainingRepo()
    {
        Assert.That(exitCode, Is.Zero, output);
        Assert.That(Run(target, "git", ["rev-parse", "--show-toplevel"]).Output.Trim(), Is.EqualTo(repo));
        Assert.That(Directory.Exists(Path.Combine(target, ".git")), Is.False);
        CommittedPlan(); CleanTarget();
    }
    [Given("the target is outside any Git repository")]
    public void OutsideRepo() => target = Path.Combine(workspace, "standalone");
    [Then("the target is a Git repository")]
    public void StandaloneRepo()
    {
        Assert.That(exitCode, Is.Zero, output);
        Assert.That(Run(target, "git", ["rev-parse", "--show-toplevel"]).Output.Trim(), Is.EqualTo(target));
        Assert.That(Directory.Exists(Path.Combine(target, ".git")), Is.True);
        Assert.That(Run(target, "git", ["status", "--porcelain"]).Output, Is.Empty);
        Assert.That(Run(target, "git", ["show", "HEAD:.factory/plan.md"]).Output, Is.EqualTo(File.ReadAllText(Plan)));
    }
    readonly Dictionary<string, string> snapshots = new();
    string TargetSnapshot(string directory) => string.Join("\n", Directory.GetFiles(directory, "*", SearchOption.AllDirectories).Order()
        .Select(p => Path.GetRelativePath(directory, p) + ":" + Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(p))))) +
        Git("log", "--format=%H", "--", Path.GetRelativePath(repo, directory));
    [When("the factory builds the target {string} to completion")]
    public void BuildTarget(string name)
    {
        target = Path.Combine(repo, name);
        Invoke(true);
        Assert.That(exitCode, Is.Zero, output);
        snapshots.TryAdd(target, TargetSnapshot(target));
    }
    bool absoluteTarget;
    [When("the factory builds the same target using its absolute path")]
    public void AbsoluteTarget() { absoluteTarget = true; Invoke(true); Assert.That(exitCode, Is.Zero, output); }
    [Then("the target {string} is unchanged")]
    public void UnchangedTarget(string name)
    {
        var directory = Path.Combine(repo, name);
        Assert.That(TargetSnapshot(directory), Is.EqualTo(snapshots[directory]));
    }
    [Then("the targets {string} and {string} each have their own completed plan and committed work")]
    public void BothTargets(string first, string second)
    {
        foreach (var name in new[] { first, second })
        {
            var directory = Path.Combine(repo, name);
            var plan = Path.Combine(directory, ".factory/plan.md");
            Assert.That(File.ReadAllText(plan), Does.Contain("- [x] alpha").And.Contain("- [x] beta").And.Not.Contain("- [ ]"));
            foreach (var file in new[] { ".factory/plan.md", "alpha.txt", "beta.txt" })
                Assert.That(Git("show", "HEAD:" + name + "/" + file), Is.EqualTo(File.ReadAllText(Path.Combine(directory, file)).TrimEnd()));
            Assert.That(Git("status", "--porcelain", "--", name), Is.Empty);
        }
    }
    [AfterScenario]
    public void Cleanup() { if (Directory.Exists(workspace)) Directory.Delete(workspace, true); }
}
