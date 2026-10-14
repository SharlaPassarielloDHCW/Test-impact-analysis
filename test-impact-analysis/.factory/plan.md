# Plan: test-impact-analysis iteration 001

## Tasks

All seven tasks are unfinished. `package.json` exists, but task 1 is incomplete because the CLI entry point has not been created.

- [ ] **Set up CLI entry point**
   - Parse `--base`, `--head`, `--source`, `--report` flags.
   - Resolve commits and paths against the containing Git repository.
   - Validate inputs and exit with a clear error when commits or the subtree are missing.
   - [x] Subtask: `validateCommit` and `validatePathAtCommit` must throw instead of calling `process.exit(1)`
   - [x] Subtask: `execGit` must abstract `child_process.execSync` behind an injectable interface
   - [x] Subtask: Extract `runWorkflow` with dependency injection so `main()` is not the only exported surface
   - [x] Subtask: `findGitRoot` must accept an `exists` predicate instead of directly calling `fs.existsSync`

- [ ] **Discover test inventory at head commit**
   - Collect named `node:test` cases from the analyzed subtree.
   - Record each case’s file path and test name.

- [ ] **Build static call graph**
   - Parse ES modules in the subtree at the head commit.
   - Extract named imports/exports, named functions, and direct calls.
   - Resolve cross-module calls through named imports.
   - Note unresolved constructs (computed calls, dynamic imports, etc.) for later uncertainty classification.

- [ ] **Detect changed production functions**
   - Diff the subtree between base and head commits.
   - Identify changed or newly added named production functions.
   - Identify changed or newly added test cases.
   - List removed test cases.

- [ ] **Trace impact from tests to changed code**
   - Follow the call graph forward from each test case.
   - Select cases that reach a changed production function (directly or transitively).
   - Show the concrete call path for each selection.
   - Select changed/new test cases even when no production function changed.
   - Mark cases with unresolved links to affected modules as uncertain.
   - Exclude resolved cases with no path to changed code.

- [ ] **Generate Markdown report**
   - Include commits, subtree, changed files/functions, and counts.
   - List every head-commit case with file, name, status, and reason.
   - Group selected and uncertain cases under **recommended to run**.
   - List removed cases separately.
   - Sort entries consistently for reproducible output.

- [ ] **Acceptance checks**
   - Demonstrate direct impact, indirect impact, cross-module impact, case-level precision, unresolved impact, changed-test selection, and no-relevant-change empty result.
   - Ensure the same command works on a temporary Git repository with equivalent JS modules and tests.
