# Iteration 001 — Recommend Tetris regression tests for a code change

## Goal

Given two Git commits, recommend the individual regression test cases affected by changes to `tetris/tetris-002`. Write a Markdown report a test engineer can review before deciding what to run. This is the first proof of concept for the outcome in `docs/vision.md`: reduce a long regression run by identifying tests relevant to a code change.

The tool recommends tests; it does not execute them. It must not claim that an excluded test is safe to skip when its impact cannot be determined.

## Demonstration setup

`tetris/tetris-002` is the practice application used to demonstrate the capstone. Its `tests/regression.test.js` contains named cases for movement, rotation, line clearing and scoring, and rendering. The cases import production functions directly. This suite is the input fixture; the factory builds the impact-analysis implementation in `test-impact-analysis` and does not need to change Tetris.

For a demonstration against this repository, make a baseline commit containing the test suite, then a separate commit containing a focused Tetris change. Both commits belong to the repository that contains `tetris/tetris-002`; the tool analyzes only that subtree. These demonstration commits are separate from the factory run, whose target is `test-impact-analysis`.

The same command must also work on a small temporary Git repository with equivalent JavaScript modules and tests, so acceptance checks do not depend on a particular commit history in this workspace.

Feed this document to the factory from the repository root with:

```sh
bin/factory --seed test-impact-analysis/iterations/001-goal.md --target test-impact-analysis
```

## User workflow

Provide a command-line entry point under `test-impact-analysis` that accepts:

- a base commit and a head commit;
- the relative path of the application subtree to analyze, defaulting to `tetris/tetris-002` for the demonstration;
- a destination for the Markdown report under `test-impact-analysis`.

Run it from the repository root or from `test-impact-analysis`. Paths and commit IDs resolve against the containing Git repository. The head commit supplies the test inventory. The command reads Git history and source files; it does not modify Tetris or run tests.

For example, the completed tool should support an invocation equivalent to:

```sh
test-impact-analysis/bin/test-impact-analysis \
  --base <baseline-commit> \
  --head <change-commit> \
  --source tetris/tetris-002 \
  --report test-impact-analysis/reports/tetris-impact.md
```

The exact executable name may change if the chosen implementation language needs another entry point, but the inputs and behavior above must remain available from one documented command.

## Selection rule

Treat each named `node:test` case as one selectable test, even when several cases share a file. Infer relationships from JavaScript source at the head commit, without a manually maintained impact map. The first slice needs to handle the forms used by the demonstration tests: ES module named imports and exports, named functions, and direct calls to named functions within production functions or test cases. Resolve calls through named imports across modules.

Identify production functions changed between the base and head commits. A test is **selected** when its case body directly calls a changed function, or calls a function that directly or transitively calls a changed function. Include a changed or newly added test case in the recommendation regardless of its production-code links. A changed production function's callers are followed in reverse until all reachable test cases are found. Show the call path that justifies each selection.

A test is **uncertain** when the tool can see a possible link to a changed module but cannot resolve whether that test reaches the changed code. Examples include a computed property call, dynamic import, or changed code outside a resolvable named function. Include uncertain cases in the recommendation. Limit this fallback to tests with an apparent link to the affected module. If no module boundary can be established, include the whole discovered suite as uncertain rather than silently excluding it.

A test is **excluded** only when its supported call and import relationships can be resolved and there is no path to any changed function, no relevant unresolved link, and the test itself did not change. A removed test cannot be recommended at the head commit; list it separately as removed if the diff includes one.

## Markdown report

Show the base and head commits, analyzed subtree, changed production files and functions, and counts of selected, uncertain, excluded, and removed cases. For each named test case at the head commit, show its file, test name, status, and a concrete reason. For selected cases, include the call path or the fact that the test changed. For uncertain cases, name the unresolved construct and affected module. For excluded cases, state why the known call paths do not reach the changed code. Put selected and uncertain cases together in a clearly labeled **recommended to run** section. Sort entries consistently so repeated analysis of the same commits produces the same report.

If a commit cannot be resolved, the subtree is missing, or no recognizable tests are found, exit with a clear error instead of producing a misleading recommendation.

## Acceptance examples

1. **Direct impact:** A commit changes `clearLines` in `game.js`. A case that calls `clearLines` is selected. A rendering-only case with a fully resolved, unrelated call path is excluded.
2. **Indirect impact:** A commit changes `collides`. A case that calls `movePiece` is selected because `movePiece` calls `collides`; the report shows `test case → movePiece → collides`.
3. **Cross-module impact:** A commit changes `getShape` in `pieces.js`. A case that calls `renderGameState` is selected through its call to `getShape`.
4. **Case-level precision:** Two cases live in one test file. If only one reaches a changed function, select that case and exclude the other when its path is fully resolved.
5. **Unresolved impact:** A case uses a computed call into an affected module and the target cannot be resolved. Mark that case uncertain and include it in the recommendation. Do not mark unrelated modules' resolved cases uncertain merely because this case is dynamic.
6. **Changed test:** A newly added or modified test case is selected even when no production function changed.
7. **No relevant code change:** When the commits change only files outside the analyzed subtree, the report shows no recommended cases and explains the empty result.

## Boundaries for this iteration

The tool produces a recommendation, not a guarantee that unselected tests are unaffected. It does not run tests, optimize execution time, infer business workflows, analyze other languages, or maintain a test-to-feature map. Later iterations can add those capabilities and use the Tetris results to measure whether they improve selection.
