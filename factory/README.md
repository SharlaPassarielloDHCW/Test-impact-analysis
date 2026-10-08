# C# factory

Requires .NET 10 and Git. Each machine runs `pi` by default.
Run from the repository root:

```sh
bin/factory --seed tetris/spec.md --target tetris/tetris-002
bin/factory --seed tetris/spec.md --target tetris/tetris-002 --all
npm --prefix tetris/tetris-002 start
```

With no plan, the first pass asks the planner to create one and commits it.
Otherwise, the planner checks for remaining work, the doer implements the
next task, and the validator reviews that task's product changes. Findings
go back to the doer, which records and resolves them as subtasks. Accepted
work is committed before the planner marks its task done. The updated plan
is committed too. `--all` repeats until the planner returns `complete: true`.
The factory never reads the plan, and commits only the selected target.

Our chosen validator lens is **testability**: can game logic be tested
independently of terminal I/O, time, randomness, and other external effects?
This is the default. Change it for a run with `--lens "usability"` or another
focus. The validator reports findings; it is instructed not to edit files.
Its judgment is still an agent's judgment, not a guarantee of correctness.

`--attempts 3` limits do/validate attempts per task (three is the default).
If validation never passes, the factory exits unsuccessfully and leaves the
work and findings uncommitted, with the main task unfinished. Invalid machine
results also stop the run without committing that attempt's work.

Choose a harness for all roles with `--agent <name-or-path>`, or override
individual roles with `--planner`, `--doer`, and `--validator`. Each accepts
Pi-style arguments `--print --no-session -- <prompt>`; use a wrapper for other
CLI interfaces. The last JSON line is the result: the planner returns boolean
`complete`, the validator returns boolean `satisfied` and array `findings`,
and the doer returns an object describing its work. Each call is stateless.

Run the acceptance tests from this folder:

```sh
$HOME/.dotnet/dotnet test
```

Use `dotnet` directly if it is on PATH. Tests also require Python 3 for the
small machine double in `Steps/Doubles/agent.py`. Each example copies the
built factory into a temporary Git repository and cleans it up afterward.
The doubles record arguments and working directories, and keep their state
outside the factory. The planner double checks that work was committed before
marking it done. Tests cover retries, findings, malformed results, isolated
targets, and preservation of unrelated staged and unstaged changes.

The default suite excludes `@real-agent` examples. These remain manual
exercises; their real-game assertions are not bound to automated steps.
Once Pi is authenticated, use the commands above, inspect the recorded
findings in `tetris/tetris-002/.factory/plan.md`, and compare the game with
`tetris/tetris-001`. Keep the first generation for comparison. Use a new
target when trying a different seed or validation lens.
