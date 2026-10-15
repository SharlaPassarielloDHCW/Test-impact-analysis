# Task Desk: test impact fixture

`site/` is a static, browser-local task dashboard. It has task creation, editing,
completion, deletion, search, status and priority filters, sorting, statistics,
theme switching, JSON import/export, and local storage persistence. No server
logic or account is required.

`functional-tests/` contains **50 named `node:test` cases**. They load the real
HTML into jsdom, dispatch user events, and check the resulting page and saved
state. The tests do not require a browser or external service.
Selected cases also call named task functions directly so the static analyzer has
clear links to individual behaviors alongside the UI checks.
`functional-tests/test-cases.json` gives every case a stable ID, title, and
one-sentence description for future reports. Match cases by `file` and `title`;
`npm test` checks that the catalog and test names stay in sync.

From this folder:

```sh
npm ci
npm test
python3 -m http.server 4173 --directory site
```

Open `http://localhost:4173/` to use the site. Serve it over HTTP so the browser
loads its ES module script.

## Use with test impact analysis

The analyzer reads Git commits, so commit a baseline of this fixture, make a
change under `impact-demo/site/src/`, and commit that change. From the repository
root, run:

```sh
node test-impact-analysis/bin/test-impact-analysis.js \
  --base <baseline-commit> --head <changed-commit> \
  --source impact-demo \
  --report test-impact-analysis/reports/impact-demo.html
```

The HTML report and companion JSON report list the 50 cases and recommend those
the analyzer can connect to changed functions. The current analyzer is static:
callbacks and DOM event wiring may be classified as uncertain or excluded even
when a browser test exercises the changed behavior. Run `npm test --prefix
impact-demo` to execute all 50 cases. Case selection does not run tests.
