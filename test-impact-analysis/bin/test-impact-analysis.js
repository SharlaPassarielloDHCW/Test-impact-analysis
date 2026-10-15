#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, lstat, realpath, mkdtemp, rename, rm } from 'node:fs/promises';
import { dirname, resolve, join, isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { quote, parseModule, functionRanges, compareModules, mapCallers } from '../src/analysis.js';
import { discoverTestCases, selectTests } from '../src/selection.js';

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function deriveJsonReportPath(htmlPath) {
  return htmlPath.replace(/\.html?$/i, '') + '.json';
}

export function generateHtmlReport({ baseCommit, headCommit, sourcePath, changedFunctions = [], impactedFunctions = [], uncertainAreas = [], changedFiles = [], testCases = [], testDiscoveryIssues = [] }) {
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml('Code Impact Report')}</title>
<style>
body { font-family: sans-serif; margin: 2rem; }
h1 { border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; }
h2 { margin-top: 1.5rem; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ccc; padding: 0.65rem; text-align: left; vertical-align: top; }
th { background: #f3f4f6; }
tbody tr:nth-child(even) { background: #fafafa; }
.decision { font-weight: 700; white-space: nowrap; }
.linked { color: #166534; }
.excluded { color: #374151; }
code { overflow-wrap: anywhere; }
.changed { color: #0066cc; }
.removed { color: #cc0000; }
.added { color: #009900; }
.uncertain { color: #cc6600; }
ul { line-height: 1.6; }
</style>
</head>
<body>
<h1>${escapeHtml('Code Impact Report')}</h1>
<p><strong>${escapeHtml('Base commit:')}</strong> ${' '}${escapeHtml(baseCommit)}</p>
<p><strong>${escapeHtml('Head commit:')}</strong> ${' '}${escapeHtml(headCommit)}</p>
<p><strong>${escapeHtml('Source subtree:')}</strong> ${' '}${escapeHtml(sourcePath)}</p>`;

  html += `<p>${changedFiles.length} changed files · ${changedFunctions.length} changed functions · ${impactedFunctions.length} confirmed call paths · ${uncertainAreas.length} uncertain areas</p>`;
  if (changedFiles.length) html += `<h2>Changed Files</h2><ul>${changedFiles.map(file => `<li>${escapeHtml(file)}</li>`).join('')}</ul>`;
  const hasResults = changedFiles.length > 0 || changedFunctions.length > 0 || impactedFunctions.length > 0 || uncertainAreas.length > 0;
  if (!hasResults) {
    html += `\n<p>${escapeHtml('No relevant changes detected in the source subtree.')}</p>`;
  } else {
    if (changedFunctions.length > 0) {
      html += `\n<h2>${escapeHtml('Changed Functions')}</h2>\n<ul>`;
      for (const fn of changedFunctions) {
        const cls = fn.changeType === 'removed' ? 'removed' : fn.changeType === 'added' ? 'added' : 'changed';
        html += `\n<li class="${cls}">${escapeHtml(`${fn.module} — ${fn.name}`)} (${escapeHtml(fn.changeType)})</li>`;
      }
      html += `\n</ul>`;
    }
    if (uncertainAreas.length > 0) {
      html += `\n<h2>${escapeHtml('Uncertain Areas')}</h2>\n<ul>`;
      for (const u of uncertainAreas) {
        html += `\n<li class="uncertain">${escapeHtml(`${u.module}: ${u.reason}`)}</li>`;
      }
      html += `\n</ul>`;
    }
    if (impactedFunctions.length > 0) {
      html += `\n<h2>${escapeHtml('Impacted Functions')}</h2>\n<ul>`;
      for (const fn of impactedFunctions) {
        html += `\n<li>${escapeHtml(`${fn.module} — ${fn.name}`)}: ${escapeHtml(fn.path || '')}</li>`;
      }
      html += `\n</ul>`;
    }
  }

  const counts = Object.fromEntries(['linked', 'uncertain', 'excluded'].map(status => [status, testCases.filter(item => item.status === status).length]));
  html += `\n<h2>Test selection</h2><p>${counts.linked + counts.uncertain} selected (${counts.linked} linked, ${counts.uncertain} uncertain); ${counts.excluded} not selected. Cases are from the head commit. No tests were run.</p>`;
  if (!testCases.length) html += '<p>No test cases were discovered in the source subtree.</p>';
  else {
    html += '<table><thead><tr><th scope="col">Decision</th><th scope="col">Test case</th><th scope="col">Why</th></tr></thead><tbody>';
    for (const item of testCases) {
      const decision = item.status === 'linked' ? 'Selected — linked'
        : item.status === 'uncertain' ? 'Selected — uncertain' : 'Not selected';
      const links = item.links.map(link => `Calls ${link.function.module}#${link.function.name}; impact path: ${link.callPath.map(fn => `${fn.module}#${fn.name}`).join(' → ')}`);
      const explanations = [...links, ...item.reasons];
      html += `<tr><td class="decision ${item.status}">${escapeHtml(decision)}</td>`;
      html += `<td>${escapeHtml(item.name)}<br><code>${escapeHtml(`${item.file}:${item.line}`)}</code></td>`;
      html += `<td><ul>${explanations.map(reason => `<li>${escapeHtml(reason)}</li>`).join('')}</ul></td></tr>`;
    }
    html += '</tbody></table>';
  }
  if (testDiscoveryIssues.length) {
    html += `<h3>Test discovery issues</h3><p>These files could not be classified; review them before using this selection.</p><ul>${testDiscoveryIssues.map(issue => `<li>${escapeHtml(`${issue.file}: ${issue.reason}`)}</li>`).join('')}</ul>`;
  }

  html += `\n</body>\n</html>`;
  return html;
}

export function generateJsonReport({ baseCommit, headCommit, sourcePath, reportPath, changedFunctions = [], impactedFunctions = [], uncertainAreas = [], changedFiles = [], testCases = [], testDiscoveryIssues = [] }) {
  return JSON.stringify({
    baseCommit,
    headCommit,
    sourcePath,
    reportPath,
    changedFiles,
    changedFunctions,
    impactedFunctions,
    uncertainAreas,
    testCases,
    testDiscoveryIssues,
  }, null, 2);
}

export function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      base: { type: 'string', short: 'b' },
      head: { type: 'string', short: 'h' },
      source: { type: 'string', short: 's' },
      report: { type: 'string', short: 'r' },
    },
    allowPositionals: false,
  });

  return {
    baseCommit: values.base,
    headCommit: values.head,
    sourcePath: values.source ?? 'tetris/tetris-002',
    reportPath: values.report,
  };
}

export function findGitRoot(startPath, exists = (p) => existsSync(p)) {
  let current = resolve(startPath);
  while (true) {
    const gitDir = join(current, '.git');
    if (exists(gitDir)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function createExecGit(execSyncImpl) {
  return function execGit(cwd, args, { allowError = false, raw = false } = {}) {
    try {
      const output = execSyncImpl(`git ${args}`, {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return raw ? output : output.trim();
    } catch (err) {
      if (allowError) return null;
      throw err;
    }
  };
}

export function validateCommit(cwd, commit, execGit) {
  if (commit.startsWith('-')) throw new ValidationError(`invalid commit '${commit}'`);
  const result = execGit(cwd, `cat-file -t ${quote(commit)}`, { allowError: true });
  if (!result) {
    throw new ValidationError(`commit '${commit}' cannot be resolved in ${cwd}`);
  }
  if (result !== 'commit') {
    throw new ValidationError(`'${commit}' is not a commit object (found ${result})`);
  }
}

export function validatePathAtCommit(cwd, commit, sourcePath, execGit) {
  const result = execGit(cwd, `ls-tree ${quote(commit)} -- ${quote(sourcePath)}`, { allowError: true });
  if (!result || !result.startsWith('040000 tree')) {
    throw new ValidationError(`source path '${sourcePath}' does not exist at commit ${commit}`);
  }
}

export function validateCliArgs({ baseCommit, headCommit, reportPath }) {
  if (!baseCommit) {
    throw new ValidationError('--base is required');
  }
  if (!headCommit) {
    throw new ValidationError('--head is required');
  }
  if (!reportPath) {
    throw new ValidationError('--report is required');
  }
}

export function isProductionJsFile(filePath) {
  if (!filePath.endsWith('.js')) return false;
  const parts = filePath.split(/[/\\]/);
  if (parts.some(p => ['node_modules', 'dist', 'build', 'coverage', 'generated'].includes(p))) return false;
  if (parts.some(p => p.includes('.test.') || p.includes('.spec.'))) return false;
  if (parts.some(p => p === 'tests' || p === 'test' || p === '__tests__' || p === '__mocks__')) return false;
  if (parts.some(p => p.endsWith('.min.js') || p.endsWith('.bundle.js') || p.endsWith('.d.ts'))) return false;
  return true;
}

export function getChangedProductionFiles(cwd, baseCommit, headCommit, sourcePath, execGit) {
  const output = execGit(cwd, `diff --no-renames --name-only -z ${quote(baseCommit)} ${quote(headCommit)} -- ${quote(sourcePath)}`, { raw: true });
  if (!output) return [];
  return output.split('\0').filter(Boolean).filter(isProductionJsFile).sort();
}

export function getFileContentAtCommit(cwd, commit, filePath, execGit) {
  return execGit(cwd, `show ${quote(`${commit}:${filePath}`)}`, { allowError: true, raw: true });
}

export function parseFunctionRanges(sourceCode) {
  return functionRanges(sourceCode);
}

export function getDiffLineRanges(cwd, baseCommit, headCommit, filePath, execGit) {
  const diff = execGit(cwd, `diff -U0 ${quote(baseCommit)} ${quote(headCommit)} -- ${quote(filePath)}`, { allowError: true });
  if (!diff) return { baseRanges: [], headRanges: [] };

  const baseRanges = [];
  const headRanges = [];

  for (const line of diff.split('\n')) {
    const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (match) {
      const baseStart = parseInt(match[1], 10);
      const baseCount = parseInt(match[2] ?? '1', 10);
      const headStart = parseInt(match[3], 10);
      const headCount = parseInt(match[4] ?? '1', 10);

      if (baseCount > 0) baseRanges.push({ start: baseStart, end: baseStart + baseCount - 1 });
      if (headCount > 0) headRanges.push({ start: headStart, end: headStart + headCount - 1 });
    }
  }

  return { baseRanges, headRanges };
}

export function locateChangedFunctions(cwd, baseCommit, headCommit, sourcePath, execGit) {
  const changedFiles = getChangedProductionFiles(cwd, baseCommit, headCommit, sourcePath, execGit);
  return compareModules(changedFiles, (side, file) => getFileContentAtCommit(
    cwd, side === 'base' ? baseCommit : headCommit, file, execGit));
}

export async function runWorkflow({
  baseCommit,
  headCommit,
  sourcePath,
  reportPath,
  toolDir,
  deps = {},
}) {
  validateCliArgs({ baseCommit, headCommit, reportPath });

  const {
    exists = (p) => existsSync(p),
    execSyncImpl = execSync,
    mkdirImpl = mkdir,
    writeFileImpl = writeFile,
    log = console.log,
  } = deps;

  const execGit = createExecGit(execSyncImpl);
  const gitRoot = findGitRoot(toolDir, exists);

  if (!gitRoot) {
    throw new ValidationError('could not find a Git repository containing the tool');
  }

  validateCommit(gitRoot, baseCommit, execGit);
  validateCommit(gitRoot, headCommit, execGit);

  sourcePath ??= 'tetris/tetris-002';
  const resolvedSource = isAbsolute(sourcePath)
    ? sourcePath
    : resolve(gitRoot, sourcePath);
  const sourceRelative = relative(gitRoot, resolvedSource);
  if (sourceRelative === '..' || sourceRelative.startsWith('../') || isAbsolute(sourceRelative)) {
    throw new ValidationError('source must be inside the Git repository');
  }
  validatePathAtCommit(gitRoot, headCommit, resolvedSource, execGit);

  const absoluteReport = isAbsolute(reportPath)
    ? reportPath
    : resolve(gitRoot, reportPath);

  const reportRelative = relative(resolvedSource, absoluteReport);
  if (reportRelative === '' || (!reportRelative.startsWith('../') && reportRelative !== '..' && !isAbsolute(reportRelative))) {
    throw new ValidationError('report must be outside the analyzed source subtree');
  }

  try {
    await mkdirImpl(dirname(absoluteReport), { recursive: true });
  } catch (err) {
    throw new ValidationError(`cannot write report to '${reportPath}': ${err.message}`);
  }

  const { changedFunctions, uncertainAreas } = locateChangedFunctions(
    gitRoot, baseCommit, headCommit, resolvedSource, execGit
  );

  const changedFiles = getChangedProductionFiles(gitRoot, baseCommit, headCommit, resolvedSource, execGit);
  let impactedFunctions = [];
  const exportsByModule = new Map();
  const files = execGit(gitRoot, `ls-tree -r --name-only -z ${quote(headCommit)} -- ${quote(resolvedSource)}`, { raw: true });
  if (changedFiles.length) {
    const modules = new Map();
    for (const file of files.split('\0').filter(isProductionJsFile).sort()) {
      try {
        const parsed = parseModule(getFileContentAtCommit(gitRoot, headCommit, file, execGit), file);
        modules.set(file, parsed);
        exportsByModule.set(file, parsed.exports);
      } catch (error) {
        uncertainAreas.push({ module: file, reason: `JavaScript parse failed: ${error.message}` });
      }
    }
    const mapped = mapCallers(modules, changedFunctions);
    impactedFunctions = mapped.impactedFunctions;
    uncertainAreas.push(...mapped.uncertainAreas);
  }
  const uniqueUncertainty = [...new Map(uncertainAreas.map(area => [JSON.stringify(area), area])).values()]
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
  const impactMap = {
    baseCommit,
    headCommit,
    sourcePath: resolvedSource,
    reportPath: absoluteReport,
    changedFunctions,
    changedFiles,
    impactedFunctions,
    uncertainAreas: uniqueUncertainty,
  };

  const discovered = discoverTestCases(files.split('\0').filter(Boolean), file => getFileContentAtCommit(gitRoot, headCommit, file, execGit));
  Object.assign(impactMap, selectTests(discovered, impactMap, exportsByModule));

  const htmlContent = generateHtmlReport(impactMap);
  const jsonContent = generateJsonReport(impactMap);
  const jsonPath = deriveJsonReportPath(absoluteReport);

  try {
    if (deps.writeFileImpl) {
      await writeFileImpl(jsonPath, jsonContent, 'utf-8');
      await writeFileImpl(absoluteReport, htmlContent, 'utf-8');
    } else {
      // Stage both outputs before publishing either; publish HTML last.
      const parent = await realpath(dirname(absoluteReport));
      const realSource = await realpath(resolvedSource).catch(() => resolvedSource);
      for (const output of [absoluteReport, jsonPath]) {
        const destination = resolve(parent, relative(dirname(absoluteReport), output));
        const rel = relative(realSource, destination);
        if (rel === '' || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel))) {
          throw new Error('report must be outside the analyzed source subtree');
        }
        const info = await lstat(output).catch(error => {
          if (error.code === 'ENOENT') return null;
          throw error;
        });
        if (info && !info.isFile()) throw new Error(`output is not a regular file: ${output}`);
      }
      const staging = await mkdtemp(join(parent, '.impact-'));
      try {
        await writeFile(join(staging, 'report.json'), jsonContent, 'utf-8');
        await writeFile(join(staging, 'report.html'), htmlContent, 'utf-8');
        await rename(join(staging, 'report.json'), jsonPath);
        await rename(join(staging, 'report.html'), absoluteReport);
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
    }
  } catch (err) {
    throw new ValidationError(`cannot write report to '${reportPath}': ${err.message}`);
  }

  log(`Report written to ${absoluteReport}`);
  log(`JSON map written to ${jsonPath}`);
}

export async function main({
  argv = process.argv.slice(2),
  stderr = console.error,
  exit = process.exit,
  __dirname,
  deps,
} = {}) {
  try {
    let options;
    try { options = parseCliArgs(argv); } catch (error) { throw new ValidationError(error.message); }
    const { baseCommit, headCommit, sourcePath, reportPath } = options;
    await runWorkflow({ baseCommit, headCommit, sourcePath, reportPath, toolDir: __dirname, deps });
  } catch (err) {
    if (err instanceof ValidationError) {
      stderr(`Error: ${err.message}`);
      exit(1);
      return;
    }
    throw err;
  }
}

if (import.meta.url.startsWith('file:') && !process.env.NODE_TEST_CONTEXT) {
  const scriptPath = fileURLToPath(import.meta.url);
  if (process.argv[1] === scriptPath) {
    const __dirname = process.cwd();
    main({
      argv: process.argv.slice(2),
      stderr: console.error,
      exit: process.exit,
      __dirname,
    }).catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
