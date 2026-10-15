# C# factory

Requires .NET 10, Git, and `pi` for real builds. From the repository root, start a named run with a seed, target and one of that target's assembly lines:

```sh
bin/factory --run tetris --target tetris/tetris-003 --line careful --seed tetris/spec.md
```

Resume it with `bin/factory --run tetris`. The first invocation saves its settings in `factory/runs/tetris/run.json` and its plan in `factory/runs/tetris/plan.md`. Run state is ignored by Git. The existing Tetris run has already been migrated and its plan is complete; use a new run name and target to build again.

The target owns its Graphviz lines in `.assembly-lines/`, such as `careful.dot`, `quick.dot` and `three-brains.dot`, and machine configurations in `.assembly-lines/.machines/<name>/config.json`. `quick` routes the doer straight to the planner; `careful` uses the validator. `three-brains` starts three reviewers together, then passes their JSON results to a synthesiser. A reviewer failure stops the run before synthesis or commit. Check the line without calling an agent:

```sh
bin/factory --run tetris-brains --target tetris/tetris-003 --line three-brains --seed tetris/spec.md --check-line
```

Each machine configuration can select a `harness` (default `pi`), an optional Pi `model`, and a `prompt` for branch work. The sample reviewers use Anthropic, Google and OpenAI models through OpenRouter; choose models available to your Pi installation and authenticate their provider before a real run. A reviewer's `lens` defaults to testability, and `--lens` can override it for an invocation. Harnesses accept Pi-style arguments `--print --no-session [--model <model>] -- <prompt>` and end with a JSON result. The factory commits each accepted task's product work in the target, excluding `.assembly-lines/`; review failures leave attempted work uncommitted. `--attempts 3` limits attempts per task.

Run the acceptance suite from `factory/`:

```sh
$HOME/.dotnet/dotnet test
```

The default suite excludes `@real-agent` examples. Run those explicitly with `dotnet test --settings real-agent.runsettings` after authenticating Pi. The test suite requires Python 3 for `Steps/Doubles/agent.py`.
