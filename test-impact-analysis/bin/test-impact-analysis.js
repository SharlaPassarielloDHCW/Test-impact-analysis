#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

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

export function generateHtmlReport({ baseCommit, headCommit, sourcePath, changedFunctions = [], impactedFunctions = [], uncertainAreas = [] }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml('Code Impact Report')}</title>
<style>
body { font-family: sans-serif; margin: 2rem; }
h1 { border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; }
</style>
</head>
<body>
<h1>${escapeHtml('Code Impact Report')}</h1>
<p><strong>${escapeHtml('Base commit:')}</strong> ${escapeHtml(baseCommit)}</p>
<p><strong>${escapeHtml('Head commit:')}</strong> ${escapeHtml(headCommit)}</p>
<p><strong>${escapeHtml('Source subtree:')}</strong> ${escapeHtml(sourcePath)}</p>
<p>${escapeHtml('Full analysis implementation pending.')}</p>
</body>
</html>
`;
}

export function generateJsonReport({ baseCommit, headCommit, sourcePath, reportPath, changedFunctions = [], impactedFunctions = [], uncertainAreas = [] }) {
  return JSON.stringify({
    baseCommit,
    headCommit,
    sourcePath,
    reportPath,
    changedFunctions,
    impactedFunctions,
    uncertainAreas,
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
  return function execGit(cwd, args, { allowError = false } = {}) {
    try {
      return execSyncImpl(`git ${args}`, {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch (err) {
      if (allowError) return null;
      throw err;
    }
  };
}

export function validateCommit(cwd, commit, execGit) {
  const result = execGit(cwd, `cat-file -t ${commit}`, { allowError: true });
  if (!result) {
    throw new ValidationError(`commit '${commit}' cannot be resolved in ${cwd}`);
  }
  if (result !== 'commit') {
    throw new ValidationError(`'${commit}' is not a commit object (found ${result})`);
  }
}

export function validatePathAtCommit(cwd, commit, sourcePath, execGit) {
  const result = execGit(cwd, `ls-tree ${commit} -- ${sourcePath}`, { allowError: true });
  if (!result) {
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

  const resolvedSource = isAbsolute(sourcePath)
    ? sourcePath
    : resolve(gitRoot, sourcePath);
  validatePathAtCommit(gitRoot, headCommit, resolvedSource, execGit);

  const absoluteReport = isAbsolute(reportPath)
    ? reportPath
    : resolve(gitRoot, reportPath);

  try {
    await mkdirImpl(dirname(absoluteReport), { recursive: true });
  } catch (err) {
    throw new ValidationError(`cannot write report to '${reportPath}': ${err.message}`);
  }

  const impactMap = {
    baseCommit,
    headCommit,
    sourcePath: resolvedSource,
    reportPath: absoluteReport,
    changedFunctions: [],
    impactedFunctions: [],
    uncertainAreas: [],
  };

  const htmlContent = generateHtmlReport(impactMap);
  const jsonContent = generateJsonReport(impactMap);
  const jsonPath = deriveJsonReportPath(absoluteReport);

  try {
    await writeFileImpl(absoluteReport, htmlContent, 'utf-8');
    await writeFileImpl(jsonPath, jsonContent, 'utf-8');
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
  const { baseCommit, headCommit, sourcePath, reportPath } = parseCliArgs(argv);

  try {
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
    const __dirname = resolve(dirname(scriptPath), '..');
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
