# Test impact analysis — Task Desk target

Maps changed JavaScript functions to their direct and transitive production
callers, then recommends individual `node:test` cases that call those functions.
Test execution belongs to iteration 003.

Install and verify:

```sh
npm ci --prefix test-impact-analysis
npm test --prefix test-impact-analysis
```

From this repository root or `test-impact-analysis/`:

```sh
node test-impact-analysis/bin/test-impact-analysis.js \
  --base <base-commit> --head <head-commit> \
  --report test-impact-analysis/reports/test-selection.html
```

When starting inside `test-impact-analysis/`, use `node bin/test-impact-analysis.js`.
Source and report paths are relative to the containing Git repository root.
The source defaults to `impact-demo`, the Task Desk website and its 50 functional
tests. Use `--source <path>` to analyze a different target. The HTML and matching `.json` report
are written outside the source subtree. Files are read from Git commits;
uncommitted source edits are ignored. The analyzer never runs the target's tests.
Choose base and head commits that bracket a change under `impact-demo/site/src/`.
The initial Task Desk baseline is `b7f4679`; comparing it with a commit that
only changes test metadata will show all 50 tests but no production impact.
To reproduce the current local reports, use `--base 402dbc4 --head HEAD`:
that comparison includes the first addition of the website code. For later,
focused changes, compare the commit before the website edit with the commit
containing it. Reports in `reports/` are generated locally and ignored by Git.
The `iterations/` goal files retain the earlier Tetris exercise as history;
they do not set the CLI's current target.

## Reading the report

- Changed functions are added, modified, or removed top-level named declarations.
- Confirmed paths run from caller to changed function, with module-qualified
  identities and structured `callPath` entries in JSON. Each reachable caller
  gets one path per changed function; cycles terminate.
- Uncertain areas include changed module-level statements, parse failures,
  removed functions, dynamic imports, and calls the analyzer cannot resolve.
- No production changes produces an explicit empty result, even if ignored
  files changed. Both outputs use deterministic ordering.
- `testCases` lists each discovered `.test.js` or `.spec.js` case at the head
  commit. For Task Desk, each case also carries its stable ID and description
  from `impact-demo/functional-tests/test-cases.json`. `linked` cases have a direct call to a changed or impacted function;
  their `links` contain the production call path. `uncertain` cases have an
  unresolved test call or a relevant code uncertainty. Both are recommended.
  `excluded` cases show why no link was found. `recommended` is a Boolean for
  consumers of the JSON report.
- The HTML test selection table spells out **Selected — linked**, **Selected —
  uncertain**, or **Not selected** for every case, with its file, line, and
  reason. The summary counts selected and not selected cases.
- `testDiscoveryIssues` lists files that could not be parsed. Review these
  before relying on the selection. A test file with no discoverable cases
  cannot be safely classified.

Named ES module imports and exports (including aliases), function declarations,
and direct calls are supported. Arrow functions, callbacks, methods, re-exports,
package imports, and shadowed bindings are not resolved into confirmed edges.
Unresolved calls across the source subtree are reported conservatively when
production files change; these warnings do not prove that the call is affected.
This is a static approximation, not proof that all runtime impacts are known.
Case discovery supports named `node:test` calls with string titles and named
relative imports. Dynamic or computed calls inside a case are marked uncertain.
Tests that reach production through nested helpers, callbacks, or dynamic
imports may need manual review. The report is a recommendation, not a record of
executed tests.

Test directories (including `functional-tests`), `node_modules`, build/dist/coverage/generated directories,
`.test.js`, `.spec.js`, `.min.js`, and `.bundle.js` files are ignored. Other
repository-specific generated files may need additional exclusion rules.

Acceptance checks create temporary Git repositories and cover code impact,
case selection, uncertainty, exclusions, invalid inputs, and committed content.
