# Plan: test-impact-analysis iteration 002 — Task Desk test selection

## Current state

Iteration 002 is implemented. The analyzer reads committed changes in
`impact-demo/` by default, discovers individual `node:test` cases in
`impact-demo/functional-tests/`, and writes selection decisions to the HTML
and JSON reports. It recommends linked and uncertain cases and explains
excluded cases. It does not execute the selected cases; that belongs to
iteration 003.

This is the capstone progress record. The C# factory stores its own run plans
under `factory/runs/<run-name>/plan.md`. Its existing `tetris` run remains a
separate practice run; a capstone run targets `test-impact-analysis/` and uses
an iteration goal as its seed.

## Tasks

- [x] **Discover test cases from the head commit**
  - Find named `node:test` cases in the source subtree and retain their file,
    title, and location.
  - Report discovery issues for cases that cannot be classified safely.

- [x] **Connect cases to code impact**
  - Follow supported named imports and direct calls from each case to changed
    or impacted production functions.
  - Preserve the production call path for each confirmed link.

- [x] **Decide and explain selection**
  - Recommend confirmed linked cases and cases with uncertain relationships.
  - Explain why every other discovered case is excluded.

- [x] **Publish the selection**
  - Include every case's decision, reason, and links in HTML and JSON reports.
  - Attach Task Desk case IDs and descriptions from `test-cases.json`.

- [x] **Verify the iteration**
  - Cover discovery, direct and transitive links, uncertainty, exclusions,
    metadata, and committed-content behavior in analyzer tests.
  - Verify the 50 Task Desk functional cases and their metadata catalog.

## Verification

- `npm test --prefix test-impact-analysis`: 71 passed.
- `npm test --prefix impact-demo`: 50 passed.
- `bin/factory --run test-impact-analysis-002 --target test-impact-analysis --line careful --seed test-impact-analysis/iterations/002-goal.md --check-line`: assembly line accepted.

The earlier iteration 001 plan is preserved at `../iterations/001-plan.md`.
