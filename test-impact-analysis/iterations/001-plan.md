# Plan: test-impact-analysis iteration 001 — code impact

Historical completion record from the initial Tetris exercise. The current
iteration goals and analyzer default now use Task Desk in `impact-demo/`.

## Current state

Iteration 001 is implemented. The CLI reads committed JavaScript with Acorn,
identifies changed named functions, follows direct and transitive callers,
and writes matching HTML and JSON reports. Unsupported calls and changes are
reported as uncertain. Test mapping and test execution remain later iterations.

Verification: `npm test --prefix test-impact-analysis` passes 67 tests, including
acceptance checks in temporary Git repositories. See `../README.md` for usage
and supported syntax. Changes are ready for review and are not committed.

## Tasks

- [x] **Finish the CLI contract**
  - Accept base and head commits, source subtree, and HTML report path.
  - Resolve paths against the containing Git repository and validate inputs.
  - Fail clearly without writing a success report when inputs or output are invalid.
  - [x] Export `escapeHtml` and add targeted unit tests for HTML metacharacter escaping.
  - [x] Extract JSON report path derivation into a named helper with isolated edge-case tests.
  - [x] Strengthen `runWorkflow` success test to parse and assert JSON shape, and verify HTML escaping with malicious inputs.

- [x] **Locate changed production functions**
  - Compare the two commits within the source subtree.
  - Identify added, modified, and removed named JavaScript functions.
  - Record unresolved changes at module level as uncertain.

- [x] **Map direct and transitive callers**
  - Parse the named ES module imports, exports, functions, and direct calls used by Tetris.
  - Resolve cross-module calls and follow callers of changed functions.
  - Record a concrete call path for each impacted function and uncertainty for unresolved calls.

- [x] **Write the code-impact outputs**
  - Generate a self-contained HTML report of changes, impacts, paths, and uncertainty.
  - Write the matching JSON map beside it with stable ordering.
  - Show an explicit empty result when nothing in the source subtree changed.

- [x] **Verify the first slice**
  - Check direct, transitive, cross-module, uncertain, empty-change, and invalid-input examples.
  - Run acceptance checks in a temporary Git repository independent of this repository's history.

## Verification notes

- Sample report: `reports/code-impact.html` and matching JSON, comparing Tetris
  commits `522dc8a` and `b392f0f` (generated reports are ignored by Git).
- The separate `factory/` project is at `003 WIP`. Its required `dotnet test`
  check currently reports 3 passing and 41 failing scenarios, with missing
  step definitions. No factory source or specification was changed here.
