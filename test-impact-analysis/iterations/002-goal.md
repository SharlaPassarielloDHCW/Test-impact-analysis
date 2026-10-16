# Iteration 002 — Select affected Task Desk test cases

Given the iteration 001 code impact map, discover individual `node:test` cases
from `impact-demo/functional-tests/` at the head commit. Use `impact-demo` as
the default source subtree. Recommend cases with confirmed
calls to changed or impacted production functions, and cases whose relationship
to changed code is uncertain. Show the call path or uncertainty reason. Explain
each excluded case. Publish the selection in the existing HTML and JSON reports.
Include each case's ID and description from
`impact-demo/functional-tests/test-cases.json` when available.

This iteration only recommends cases. Running cases and reporting outcomes is
iteration 003. The implementation is contained in `test-impact-analysis/`;
`impact-demo/` is the website and functional-test fixture being analyzed.
