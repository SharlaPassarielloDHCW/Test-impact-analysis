# Iteration 002 — Select affected Tetris test cases

Given the iteration 001 code impact map, discover individual `node:test` cases
from the head commit under the source subtree. Recommend cases with confirmed
calls to changed or impacted production functions, and cases whose relationship
to changed code is uncertain. Show the call path or uncertainty reason. Explain
each excluded case. Publish the selection in the existing HTML and JSON reports.

This iteration only recommends cases. Running cases and reporting outcomes is
iteration 003. Tetris remains the separate practice target; the implementation
is contained in `test-impact-analysis/`.
