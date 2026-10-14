# Plan: test-impact-analysis iteration 001

## Tasks

1. **Set up CLI entry point**
   - Parse `--base`, `--head`, `--source`, `--report` flags.
   - Resolve commits and paths against the containing Git repository.
   - Validate inputs and exit with a clear error when commits or the subtree are missing.

2. **Discover test inventory at head commit**
   - Collect named `node:test` cases from the analyzed subtree.
   - Record each case’s file path and test name.

3. **Build static call graph**
   - Parse ES modules in the subtree at the head commit.
   - Extract named imports/exports, named functions, and direct calls.
   - Resolve cross-module calls through named imports.
   - Note unresolved constructs (computed calls, dynamic imports, etc.) for later uncertainty classification.

4. **Detect changed production functions**
   - Diff the subtree between base and head commits.
   - Identify changed or newly added named production functions.
   - Identify changed or newly added test cases.
   - List removed test cases.

5. **Trace impact from tests to changed code**
   - Follow the call graph forward from each test case.
   - Select cases that reach a changed production function (directly or transitively).
   - Show the concrete call path for each selection.
   - Select changed/new test cases even when no production function changed.
   - Mark cases with unresolved links to affected modules as uncertain.
   - Exclude resolved cases with no path to changed code.

6. **Generate Markdown report**
   - Include commits, subtree, changed files/functions, and counts.
   - List every head-commit case with file, name, status, and reason.
   - Group selected and uncertain cases under **recommended to run**.
   - List removed cases separately.
   - Sort entries consistently for reproducible output.

7. **Acceptance checks**
   - Demonstrate direct impact, indirect impact, cross-module impact, case-level precision, unresolved impact, changed-test selection, and no-relevant-change empty result.
   - Ensure the same command works on a temporary Git repository with equivalent JS modules and tests.
