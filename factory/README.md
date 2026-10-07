# C# factory

Requires .NET 10 and Git. The default agent is `pi`.
Run from the repository root:

```sh
bin/factory --seed tetris/spec.md --target tetris/tetris-001
bin/factory --seed tetris/spec.md --target tetris/tetris-001 --all
```

One pass asks the agent to create a plan or complete one task. `--all` repeats
until the agent returns `{"complete": true}`. The factory commits only the
selected target, including its `.factory/plan.md`. It never reads the plan.
This iteration trusts the agent; it does not validate the generated software.

Choose another executable with `--agent <name-or-path>`. It must accept the
Pi-style arguments `--print --no-session -- <prompt>` and emit a final JSON
line with a boolean `complete` field. Use a wrapper for other CLI interfaces.

Run the acceptance tests from this folder:

```sh
$HOME/.dotnet/dotnet test
```

Use `dotnet` directly if it is on PATH. Tests also require Python 3 for the
small agent double in `Steps/Doubles/agent.py`. Each example copies the built
factory into a temporary Git repository and cleans it up afterward. The
double records arguments and working directories, and writes the example's
plan and task files. All double configuration stays outside the factory.

The default suite excludes `@real-agent` examples. Those examples remain
manual exercises for this iteration; their real-game assertions are not bound
to automated steps. Once Pi is authenticated, try the two commands above,
then `npm --prefix tetris/tetris-001 start`. For the alternate-seed exercise,
use a separate seed requesting an 8-column board and `npm run play`, with a
fresh target. Inspect the generated plan against its seed and play the result.
