# Iteration 001 — Map the impact of Tetris code changes

## Goal

Given two Git commits, identify the JavaScript functions changed in `tetris/tetris-002` and the production functions that may be affected because they call those functions, directly or through other functions. Produce a human-readable HTML report and a matching JSON impact map. This is the first stage of the test-impact-analysis vision; linking tests and executing them belong to later iterations.

Tetris is the practice application used to prove the capstone. The impact-analysis tool is built in `test-impact-analysis` and reads Tetris without changing it.

## Command and inputs

Provide one command-line entry point under `test-impact-analysis` with `--base <commit>`, `--head <commit>`, `--source <path>`, and `--report <html-path>`. Use `tetris/tetris-002` as the default source. Resolve commits and source paths against the containing Git repository, whether the command starts at the repository root or in `test-impact-analysis`.

For example:

```sh
test-impact-analysis/bin/test-impact-analysis.js \
  --base <baseline-commit> \
  --head <change-commit> \
  --source tetris/tetris-002 \
  --report test-impact-analysis/reports/code-impact.html
```

The command reads the files at the supplied commits. It must not modify Tetris or run its tests. Report a clear error for an invalid commit, missing source subtree, or unwritable output path. Do not write a success report after an error.

## Code-impact map

Analyze production `.js` modules in the source subtree. Ignore `node_modules`, test files, and generated files. The first iteration must understand the forms used by Tetris: ES module named imports and exports, named function declarations, and direct calls to named functions. Resolve imported calls across modules.

Compare base and head to identify added, modified, or removed functions. Start with each changed function and follow **callers in reverse**: if `movePiece` calls a changed `collides`, `movePiece` is impacted; if another function calls `movePiece`, it is impacted too. Record at least one concrete call path from each impacted function to the change. Keep functions identified by module path and name, so equal names in different files do not collide.

When a change or call cannot be resolved safely, record an **uncertain impact** for the apparent module and explain why. Examples include a changed statement outside a named function, a computed call, a dynamic import, or a deleted function whose callers cannot be resolved at the head commit. Do not present an uncertain area as unaffected. A change outside the source subtree creates no impact entries.

## Outputs

Write a self-contained HTML report at `--report` showing the compared commits, changed files and functions, impacted functions with call paths, uncertain areas with reasons, and counts. Make the distinction between confirmed call paths and uncertain impacts visible. Escape source-derived text before placing it in HTML. The report must say when there are no relevant changes.

Write the same impact map as JSON beside the HTML report, using the same filename stem and a `.json` extension. Include the base and head commits, source subtree, changed functions, impacted functions with paths, and uncertain areas. Use stable ordering in both files so repeated analysis of the same commits produces the same result.

## Acceptance examples

1. A change inside `clearLines` identifies `clearLines` as changed and shows `settlePiece` as impacted through `settlePiece → clearLines`.
2. A change inside `collides` shows `movePiece` as impacted, and follows further callers transitively.
3. A change inside `getShape` in `pieces.js` shows `renderGameState` in `display.js` as impacted through the cross-module call.
4. A dynamic call or a change outside a resolvable function appears as uncertain in both outputs, with its module and reason.
5. A commit changing only files outside the source subtree produces reports with no changed or impacted production functions.
6. Invalid commits or a missing source subtree fail clearly without writing a success report.

Use a small temporary Git repository for automated acceptance checks, so checks do not depend on a particular Tetris commit history. A demonstration against this repository can use a baseline commit and a later focused Tetris change.

## Later iterations

Iteration 002 will connect individual Tetris test cases to this impact map and recommend selected plus uncertain cases. Iteration 003 will execute the recommended cases and report what ran, why, and with what outcome. Neither behavior is part of iteration 001.
