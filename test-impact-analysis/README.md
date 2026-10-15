# Test impact analysis — iteration 001

Maps changed JavaScript functions to their direct and transitive production
callers. This iteration analyzes code impact; it does not select or run tests.

Install and verify:

```sh
npm ci --prefix test-impact-analysis
npm test --prefix test-impact-analysis
```

From this repository root or `test-impact-analysis/`:

```sh
node test-impact-analysis/bin/test-impact-analysis.js \
  --base <base-commit> --head <head-commit> \
  --source tetris/tetris-002 \
  --report test-impact-analysis/reports/code-impact.html
```

When starting inside `test-impact-analysis/`, use `node bin/test-impact-analysis.js`.
Source and report paths are relative to the containing Git repository root.
The source defaults to `tetris/tetris-002`. The HTML and matching `.json` report
are written outside the source subtree. Files are read from Git commits;
uncommitted source edits are ignored. The analyzer never runs the target's tests.

## Reading the report

- Changed functions are added, modified, or removed top-level named declarations.
- Confirmed paths run from caller to changed function, with module-qualified
  identities and structured `callPath` entries in JSON. Each reachable caller
  gets one path per changed function; cycles terminate.
- Uncertain areas include changed module-level statements, parse failures,
  removed functions, dynamic imports, and calls the analyzer cannot resolve.
- No production changes produces an explicit empty result, even if ignored
  files changed. Both outputs use deterministic ordering.

Named ES module imports and exports (including aliases), function declarations,
and direct calls are supported. Arrow functions, callbacks, methods, re-exports,
package imports, and shadowed bindings are not resolved into confirmed edges.
Unresolved calls across the source subtree are reported conservatively when
production files change; these warnings do not prove that the call is affected.
This is a static approximation, not proof that all runtime impacts are known.

Test directories, `node_modules`, build/dist/coverage/generated directories,
`.test.js`, `.spec.js`, `.min.js`, and `.bundle.js` files are ignored. Other
repository-specific generated files may need additional exclusion rules.

Acceptance checks create temporary Git repositories and cover direct,
transitive, cross-module, uncertain, removed, cyclic, empty, invalid-input,
output-failure, and committed-content scenarios.
