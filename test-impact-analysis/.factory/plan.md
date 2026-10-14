# Plan: test-impact-analysis iteration 001 — code impact

## Current state

`package.json` and a CLI scaffold exist. The CLI still writes a placeholder Markdown report, so iteration 001 is unfinished. The tasks below follow the narrowed seed in `iterations/001-goal.md`. Test mapping and test execution are reserved for later iterations.

## Tasks

- [ ] **Finish the CLI contract**
  - Accept base and head commits, source subtree, and HTML report path.
  - Resolve paths against the containing Git repository and validate inputs.
  - Fail clearly without writing a success report when inputs or output are invalid.
  - [x] Export `escapeHtml` and add targeted unit tests for HTML metacharacter escaping.
  - [x] Extract JSON report path derivation into a named helper with isolated edge-case tests.
  - [x] Strengthen `runWorkflow` success test to parse and assert JSON shape, and verify HTML escaping with malicious inputs.

- [ ] **Locate changed production functions**
  - Compare the two commits within the source subtree.
  - Identify added, modified, and removed named JavaScript functions.
  - Record unresolved changes at module level as uncertain.

- [ ] **Map direct and transitive callers**
  - Parse the named ES module imports, exports, functions, and direct calls used by Tetris.
  - Resolve cross-module calls and follow callers of changed functions.
  - Record a concrete call path for each impacted function and uncertainty for unresolved calls.

- [ ] **Write the code-impact outputs**
  - Generate a self-contained HTML report of changes, impacts, paths, and uncertainty.
  - Write the matching JSON map beside it with stable ordering.
  - Show an explicit empty result when nothing in the source subtree changed.

- [ ] **Verify the first slice**
  - Check direct, transitive, cross-module, uncertain, empty-change, and invalid-input examples.
  - Run acceptance checks in a temporary Git repository independent of this repository's history.
