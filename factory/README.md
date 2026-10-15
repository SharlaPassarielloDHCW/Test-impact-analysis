# C# factory

Requires .NET 10, Git, and `pi` for real builds. Run from the repository root:

```sh
bin/factory --seed tetris/spec.md --target tetris/tetris-003
npm --prefix tetris/tetris-003 start
```

The factory reads `src/assembly-line/line.dot` (copied beside the built CLI) before it does any work. Its Graphviz edges route machine results: `complete` goes to finish, `not complete` goes to the doer, and the validator's `satisfied` result decides whether to retry or return to the planner. Change the line to route the doer directly to the planner to run without validation. `bin/factory --check-line` checks the graph and configured machines without calling an agent.

Each machine has a JSON configuration in `src/machines/`, named after the machine. Its `harness` field selects an executable, with `pi` as the default. The validator's `lens` field selects what it checks; the default is **testability**, meaning game logic should be testable independently of terminal I/O, time, randomness, and other external effects. The `--lens` option can override it for a run. Harnesses accept Pi-style arguments `--print --no-session -- <prompt>`; use a wrapper for other CLI interfaces. Each machine's last JSON line is its result. The factory asks for the fields named by its outgoing edges, and asks the validator for `findings` as well.

A fresh target starts with a new `.factory/plan.md`. Running again resumes that target's plan. The factory commits each accepted task and the final plan, while preserving unrelated staged and unstaged changes. `--attempts 3` limits work and validation attempts for a task (three is the default). Failed validation leaves the attempted work uncommitted.

Run the acceptance suite from this folder:

```sh
$HOME/.dotnet/dotnet test
```

Use `dotnet` directly if it is on PATH. Tests require Python 3 for the small machine double in `Steps/Doubles/agent.py`. The default suite excludes `@real-agent` examples; run those explicitly with `dotnet test --settings real-agent.runsettings` after authenticating Pi. Inspect the recorded findings in `tetris/tetris-003/.factory/plan.md` and compare the game with earlier generations. Use a fresh target when trying a different seed or lens.
