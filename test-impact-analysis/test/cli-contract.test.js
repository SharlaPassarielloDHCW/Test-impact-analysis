import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  ValidationError,
  parseCliArgs,
  findGitRoot,
  createExecGit,
  validateCommit,
  validatePathAtCommit,
  validateCliArgs,
  escapeHtml,
  deriveJsonReportPath,
  generateHtmlReport,
  generateJsonReport,
  runWorkflow,
  main,
  isProductionJsFile,
  getChangedProductionFiles,
  getFileContentAtCommit,
  parseFunctionRanges,
  getDiffLineRanges,
  locateChangedFunctions,
} from '../bin/test-impact-analysis.js';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

describe('parseCliArgs', () => {
  it('returns defaults when only base and head are given', () => {
    const result = parseCliArgs(['--base', 'abc123', '--head', 'def456']);
    assert.strictEqual(result.baseCommit, 'abc123');
    assert.strictEqual(result.headCommit, 'def456');
    assert.strictEqual(result.sourcePath, 'tetris/tetris-002');
    assert.strictEqual(result.reportPath, undefined);
  });

  it('parses all options including short forms', () => {
    const result = parseCliArgs([
      '-b', 'a', '-h', 'b', '-s', 'src', '-r', 'out.html',
    ]);
    assert.strictEqual(result.baseCommit, 'a');
    assert.strictEqual(result.headCommit, 'b');
    assert.strictEqual(result.sourcePath, 'src');
    assert.strictEqual(result.reportPath, 'out.html');
  });
});

describe('findGitRoot', () => {
  it('finds .git in the start directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-root-'));
    mkdirSync(join(dir, '.git'));
    const root = findGitRoot(dir);
    assert.strictEqual(root, dir);
    rmSync(dir, { recursive: true });
  });

  it('walks upward to find .git', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-root-'));
    mkdirSync(join(dir, '.git'));
    const nested = join(dir, 'a', 'b');
    const root = findGitRoot(nested);
    assert.strictEqual(root, dir);
    rmSync(dir, { recursive: true });
  });

  it('returns null when no .git exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'no-git-'));
    const root = findGitRoot(dir);
    assert.strictEqual(root, null);
    rmSync(dir, { recursive: true });
  });
});

describe('createExecGit', () => {
  it('returns trimmed stdout on success', () => {
    let called = false;
    const exec = createExecGit((cmd, opts) => {
      called = true;
      assert.ok(cmd.startsWith('git '));
      return '  hello  ';
    });
    const result = exec('/some/dir', 'status');
    assert.strictEqual(result, 'hello');
    assert.strictEqual(called, true);
  });

  it('returns null on error when allowError is true', () => {
    const exec = createExecGit(() => {
      throw new Error('fail');
    });
    const result = exec('/some/dir', 'bad', { allowError: true });
    assert.strictEqual(result, null);
  });

  it('throws on error when allowError is false', () => {
    const exec = createExecGit(() => {
      throw new Error('fail');
    });
    assert.throws(() => exec('/some/dir', 'bad'));
  });
});

describe('validateCommit', () => {
  it('passes for a valid commit', () => {
    const execGit = () => 'commit';
    validateCommit('/repo', 'abc', execGit);
  });

  it('throws ValidationError for unresolvable commit', () => {
    const execGit = () => null;
    assert.throws(
      () => validateCommit('/repo', 'bad', execGit),
      ValidationError,
    );
  });

  it('throws ValidationError for non-commit object', () => {
    const execGit = () => 'tree';
    assert.throws(
      () => validateCommit('/repo', 'bad', execGit),
      ValidationError,
    );
  });
});

describe('validatePathAtCommit', () => {
  it('passes when path exists', () => {
    const execGit = () => '040000 tree src';
    validatePathAtCommit('/repo', 'head', 'src', execGit);
  });

  it('throws ValidationError when path missing', () => {
    const execGit = () => null;
    assert.throws(
      () => validatePathAtCommit('/repo', 'head', 'src', execGit),
      ValidationError,
    );
  });
});

describe('validateCliArgs', () => {
  it('throws when base is missing', () => {
    assert.throws(
      () => validateCliArgs({ headCommit: 'h', reportPath: 'r' }),
      ValidationError,
    );
  });

  it('throws when head is missing', () => {
    assert.throws(
      () => validateCliArgs({ baseCommit: 'b', reportPath: 'r' }),
      ValidationError,
    );
  });

  it('throws when report is missing', () => {
    assert.throws(
      () => validateCliArgs({ baseCommit: 'b', headCommit: 'h' }),
      ValidationError,
    );
  });

  it('passes when all are present', () => {
    validateCliArgs({ baseCommit: 'b', headCommit: 'h', reportPath: 'r' });
  });
});

describe('escapeHtml', () => {
  it('escapes all HTML metacharacters', () => {
    assert.strictEqual(
      escapeHtml('<script>alert("xss")</script>\'test\' &'),
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&#39;test&#39; &amp;',
    );
  });

  it('returns empty string for falsy input', () => {
    assert.strictEqual(escapeHtml(''), '');
    assert.strictEqual(escapeHtml(null), '');
    assert.strictEqual(escapeHtml(undefined), '');
  });

  it('does not alter safe text', () => {
    assert.strictEqual(escapeHtml('hello world 123'), 'hello world 123');
  });
});

describe('deriveJsonReportPath', () => {
  it('replaces .html with .json', () => {
    assert.strictEqual(deriveJsonReportPath('report.html'), 'report.json');
  });

  it('replaces .htm with .json', () => {
    assert.strictEqual(deriveJsonReportPath('report.htm'), 'report.json');
  });

  it('is case-insensitive for .html extension', () => {
    assert.strictEqual(deriveJsonReportPath('report.HTML'), 'report.json');
    assert.strictEqual(deriveJsonReportPath('report.HtMl'), 'report.json');
  });

  it('replaces only the last .html extension', () => {
    assert.strictEqual(
      deriveJsonReportPath('report.html.html'),
      'report.html.json',
    );
  });

  it('appends .json when no .html extension exists', () => {
    assert.strictEqual(deriveJsonReportPath('report.txt'), 'report.txt.json');
  });
});

describe('generateHtmlReport', () => {
  it('returns a self-contained HTML document', () => {
    const html = generateHtmlReport({
      baseCommit: 'base123',
      headCommit: 'head456',
      sourcePath: '/repo/src',
    });
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('base123'));
    assert.ok(html.includes('head456'));
    assert.ok(html.includes('/repo/src'));
    assert.ok(html.includes('Code Impact Report'));
  });

  it('escapes HTML metacharacters in inputs', () => {
    const html = generateHtmlReport({
      baseCommit: '<base>"\'&',
      headCommit: '<head>"\'&',
      sourcePath: '<source>"\'&',
    });
    assert.ok(!html.includes('<base>"\'&'));
    assert.ok(!html.includes('<head>"\'&'));
    assert.ok(!html.includes('<source>"\'&'));
    assert.ok(html.includes('&lt;base&gt;'));
    assert.ok(html.includes('&lt;head&gt;'));
    assert.ok(html.includes('&lt;source&gt;'));
    assert.ok(html.includes('&quot;'));
    assert.ok(html.includes('&#39;'));
    assert.ok(html.includes('&amp;'));
  });

  it('renders empty arrays without crashing', () => {
    const html = generateHtmlReport({
      baseCommit: 'a',
      headCommit: 'b',
      sourcePath: 'src',
      changedFunctions: [],
      impactedFunctions: [],
      uncertainAreas: [],
    });
    assert.ok(html.includes('a'));
    assert.ok(html.includes('b'));
    assert.ok(html.includes('src'));
  });
});

describe('generateJsonReport', () => {
  it('produces valid JSON with the expected shape', () => {
    const json = generateJsonReport({
      baseCommit: 'base123',
      headCommit: 'head456',
      sourcePath: '/repo/src',
      reportPath: '/repo/report.html',
      changedFunctions: [{ name: 'fn1' }],
      impactedFunctions: [{ name: 'fn2', path: 'a -> b' }],
      uncertainAreas: [{ module: 'mod1', reason: 'dynamic' }],
    });
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.baseCommit, 'base123');
    assert.strictEqual(parsed.headCommit, 'head456');
    assert.strictEqual(parsed.sourcePath, '/repo/src');
    assert.strictEqual(parsed.reportPath, '/repo/report.html');
    assert.deepStrictEqual(parsed.changedFunctions, [{ name: 'fn1' }]);
    assert.deepStrictEqual(parsed.impactedFunctions, [{ name: 'fn2', path: 'a -> b' }]);
    assert.deepStrictEqual(parsed.uncertainAreas, [{ module: 'mod1', reason: 'dynamic' }]);
  });

  it('uses stable ordering in JSON output', () => {
    const json1 = generateJsonReport({
      baseCommit: 'a',
      headCommit: 'b',
      sourcePath: 'src',
      reportPath: 'r.html',
      changedFunctions: [],
      impactedFunctions: [],
      uncertainAreas: [],
    });
    const json2 = generateJsonReport({
      baseCommit: 'a',
      headCommit: 'b',
      sourcePath: 'src',
      reportPath: 'r.html',
      changedFunctions: [],
      impactedFunctions: [],
      uncertainAreas: [],
    });
    assert.strictEqual(json1, json2);
  });

  it('defaults arrays to empty when omitted', () => {
    const json = generateJsonReport({
      baseCommit: 'a',
      headCommit: 'b',
      sourcePath: 'src',
      reportPath: 'r.html',
    });
    const parsed = JSON.parse(json);
    assert.deepStrictEqual(parsed.changedFunctions, []);
    assert.deepStrictEqual(parsed.impactedFunctions, []);
    assert.deepStrictEqual(parsed.uncertainAreas, []);
  });
});

describe('runWorkflow validation', () => {
  it('throws ValidationError for missing report path', async () => {
    await assert.rejects(
      runWorkflow({
        baseCommit: 'a',
        headCommit: 'b',
        sourcePath: 'src',
        toolDir: '/tmp',
        deps: { exists: () => true, execSyncImpl: () => '' },
      }),
      ValidationError,
    );
  });

  it('throws ValidationError when git root is not found', async () => {
    await assert.rejects(
      runWorkflow({
        baseCommit: 'a',
        headCommit: 'b',
        sourcePath: 'src',
        reportPath: 'out.html',
        toolDir: '/tmp',
        deps: { exists: () => false },
      }),
      ValidationError,
    );
  });

  it('throws ValidationError for unwritable report path', async () => {
    const execGit = () => 'commit';
    await assert.rejects(
      runWorkflow({
        baseCommit: 'a',
        headCommit: 'b',
        sourcePath: 'src',
        reportPath: '/dev/null/out.html',
        toolDir: '/tmp',
        deps: {
          exists: (p) => p === '/tmp/.git',
          execSyncImpl: () => '',
          mkdirImpl: () => {
            const err = new Error('EEXIST');
            err.code = 'EEXIST';
            throw err;
          },
        },
      }),
      ValidationError,
    );
  });

  it('throws ValidationError for write failure', async () => {
    const execGit = () => 'commit';
    await assert.rejects(
      runWorkflow({
        baseCommit: 'a',
        headCommit: 'b',
        sourcePath: 'src',
        reportPath: '/root/out.html',
        toolDir: '/tmp',
        deps: {
          exists: (p) => p === '/tmp/.git',
          execSyncImpl: () => '',
          mkdirImpl: async () => {},
          writeFileImpl: () => {
            const err = new Error('EACCES');
            err.code = 'EACCES';
            throw err;
          },
        },
      }),
      ValidationError,
    );
  });
});

describe('runWorkflow success', () => {
  it('writes empty html and json reports', async () => {
    const files = {};
    const execGit = (cwd, args) => {
      if (args.includes('cat-file')) return 'commit';
      if (args.includes('ls-tree')) return '040000 tree src';
      return '';
    };
    const logs = [];

    await runWorkflow({
      baseCommit: 'base123',
      headCommit: 'head456',
      sourcePath: 'src',
      reportPath: 'report.html',
      toolDir: '/repo',
      deps: {
        exists: (p) => p === '/repo/.git',
        execSyncImpl: (cmd) => execGit('/repo', cmd.replace(/^git /, '')),
        mkdirImpl: async () => {},
        writeFileImpl: async (path, content) => {
          files[path] = content;
        },
        log: (msg) => logs.push(msg),
      },
    });

    assert.ok(files['/repo/report.html']);
    assert.ok(files['/repo/report.json']);
    assert.ok(files['/repo/report.html'].includes('<!DOCTYPE html>'));
    assert.ok(files['/repo/report.html'].includes('base123'));

    const jsonPayload = JSON.parse(files['/repo/report.json']);
    assert.strictEqual(jsonPayload.baseCommit, 'base123');
    assert.strictEqual(jsonPayload.headCommit, 'head456');
    assert.strictEqual(jsonPayload.sourcePath, '/repo/src');
    assert.strictEqual(jsonPayload.reportPath, '/repo/report.html');
    assert.deepStrictEqual(jsonPayload.changedFunctions, []);
    assert.deepStrictEqual(jsonPayload.impactedFunctions, []);
    assert.deepStrictEqual(jsonPayload.uncertainAreas, []);

    assert.strictEqual(logs.length, 2);
  });

  it('escapes malicious inputs in the HTML report', async () => {
    const files = {};
    const maliciousBase = '<base>"\'&';
    const maliciousHead = '<head>"\'&';
    const maliciousSource = '<source>"\'&';

    await runWorkflow({
      baseCommit: maliciousBase,
      headCommit: maliciousHead,
      sourcePath: maliciousSource,
      reportPath: 'report.html',
      toolDir: '/repo',
      deps: {
        exists: (p) => p === '/repo/.git',
        execSyncImpl: (cmd) => {
          if (cmd.includes('cat-file')) return 'commit';
          if (cmd.includes('ls-tree')) return '040000 tree src';
          return '';
        },
        mkdirImpl: async () => {},
        writeFileImpl: async (path, content) => {
          files[path] = content;
        },
        log: () => {},
      },
    });

    const html = files['/repo/report.html'];
    assert.ok(!html.includes('<base>"\'&'));
    assert.ok(!html.includes('<head>"\'&'));
    assert.ok(!html.includes('<source>"\'&'));
    assert.ok(html.includes('&lt;base&gt;'));
    assert.ok(html.includes('&lt;head&gt;'));
    assert.ok(html.includes('&lt;source&gt;'));
    assert.ok(html.includes('&quot;'));
    assert.ok(html.includes('&#39;'));
    assert.ok(html.includes('&amp;'));
  });
});

describe('main', () => {
  it('prints ValidationError to stderr and exits 1', async () => {
    let exitCode = null;
    let stderrMsg = '';
    await main({
      argv: [],
      stderr: (msg) => {
        stderrMsg = msg;
      },
      exit: (code) => {
        exitCode = code;
      },
      __dirname: '/tmp',
    });
    assert.strictEqual(exitCode, 1);
    assert.ok(stderrMsg.includes('Error:'));
  });

  it('re-throws non-validation errors', async () => {
    await assert.rejects(
      main({
        argv: ['--base', 'a', '--head', 'b', '--report', 'r'],
        stderr: () => {},
        exit: () => {},
        __dirname: '/tmp',
        deps: {
          exists: () => {
            throw new Error('unexpected crash');
          },
        },
      }),
      (err) => err instanceof Error && !(err instanceof ValidationError),
    );
  });
});

describe('isProductionJsFile', () => {
  it('accepts regular .js files', () => {
    assert.strictEqual(isProductionJsFile('src/game.js'), true);
    assert.strictEqual(isProductionJsFile('lib/helpers.js'), true);
  });

  it('rejects non-.js files', () => {
    assert.strictEqual(isProductionJsFile('README.md'), false);
    assert.strictEqual(isProductionJsFile('src/styles.css'), false);
  });

  it('rejects node_modules', () => {
    assert.strictEqual(isProductionJsFile('node_modules/lodash/index.js'), false);
    assert.strictEqual(isProductionJsFile('vendor/node_modules/foo.js'), false);
  });

  it('rejects test files', () => {
    assert.strictEqual(isProductionJsFile('src/game.test.js'), false);
    assert.strictEqual(isProductionJsFile('src/game.spec.js'), false);
    assert.strictEqual(isProductionJsFile('tests/regression.test.js'), false);
    assert.strictEqual(isProductionJsFile('__tests__/unit.js'), false);
  });

  it('rejects generated files', () => {
    assert.strictEqual(isProductionJsFile('dist/app.bundle.js'), false);
    assert.strictEqual(isProductionJsFile('src/app.min.js'), false);
    assert.strictEqual(isProductionJsFile('types/index.d.ts'), false);
  });
});

describe('parseFunctionRanges', () => {
  it('finds exported and non-exported functions', () => {
    const code = 'export function a() {}\nfunction b() {\n  return 1;\n}';
    const result = parseFunctionRanges(code);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].name, 'a');
    assert.strictEqual(result[0].startLine, 1);
    assert.strictEqual(result[0].endLine, 1);
    assert.strictEqual(result[1].name, 'b');
    assert.strictEqual(result[1].startLine, 2);
    assert.strictEqual(result[1].endLine, 4);
  });

  it('finds indented function declarations', () => {
    const code = 'if (true) {\n  function inner() {\n    return 1;\n  }\n}';
    const result = parseFunctionRanges(code);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, 'inner');
    assert.strictEqual(result[0].startLine, 2);
    assert.strictEqual(result[0].endLine, 4);
  });

  it('handles nested braces correctly', () => {
    const code = 'function outer() {\n  if (true) {\n    return 1;\n  }\n}';
    const result = parseFunctionRanges(code);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, 'outer');
    assert.strictEqual(result[0].startLine, 1);
    assert.strictEqual(result[0].endLine, 5);
  });

  it('returns empty array for code without functions', () => {
    const result = parseFunctionRanges('const x = 1;\nexport const y = 2;');
    assert.deepStrictEqual(result, []);
  });

  it('handles braces inside strings', () => {
    const code = 'function a() {\n  const s = "{";\n  return s;\n}';
    const result = parseFunctionRanges(code);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, 'a');
    assert.strictEqual(result[0].endLine, 4);
  });

  it('parses real Tetris game.js', () => {
    const code = readFileSync(new URL('../../tetris/tetris-002/game.js', import.meta.url), 'utf-8');
    const result = parseFunctionRanges(code);
    const names = result.map(r => r.name);
    assert.ok(names.includes('createEmptyBoard'));
    assert.ok(names.includes('createGameState'));
    assert.ok(names.includes('collides'));
    assert.ok(names.includes('tick'));
    assert.ok(names.includes('movePiece'));
    assert.ok(names.includes('clearLines'));
  });

  it('parses real Tetris pieces.js with large nested objects', () => {
    const code = readFileSync(new URL('../../tetris/tetris-002/pieces.js', import.meta.url), 'utf-8');
    const result = parseFunctionRanges(code);
    const names = result.map(r => r.name);
    assert.deepStrictEqual(names, ['getShape', 'getColor', 'createPiece', 'getWallKicks']);
  });
});

describe('getDiffLineRanges', () => {
  it('parses git diff -U0 output', () => {
    const execGit = () => `@@ -10,5 +12,3 @@\n context\n@@ -25,1 +23,4 @@\n more`;
    const result = getDiffLineRanges('/repo', 'base', 'head', 'file.js', execGit);
    assert.deepStrictEqual(result.baseRanges, [{ start: 10, end: 14 }, { start: 25, end: 25 }]);
    assert.deepStrictEqual(result.headRanges, [{ start: 12, end: 14 }, { start: 23, end: 26 }]);
  });

  it('returns empty ranges when diff is empty', () => {
    const execGit = () => null;
    const result = getDiffLineRanges('/repo', 'base', 'head', 'file.js', execGit);
    assert.deepStrictEqual(result.baseRanges, []);
    assert.deepStrictEqual(result.headRanges, []);
  });

  it('handles added lines at start', () => {
    const execGit = () => '@@ -0,0 +1,5 @@';
    const result = getDiffLineRanges('/repo', 'base', 'head', 'file.js', execGit);
    assert.deepStrictEqual(result.baseRanges, []);
    assert.deepStrictEqual(result.headRanges, [{ start: 1, end: 5 }]);
  });

  it('handles removed lines at start', () => {
    const execGit = () => '@@ -1,5 +0,0 @@';
    const result = getDiffLineRanges('/repo', 'base', 'head', 'file.js', execGit);
    assert.deepStrictEqual(result.baseRanges, [{ start: 1, end: 5 }]);
    assert.deepStrictEqual(result.headRanges, []);
  });
});

describe('locateChangedFunctions', () => {
  it('identifies added, modified, and removed functions in a temp repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tia-test-'));
    execSync('git init', { cwd: dir });
    execSync('git config user.email "test@test.com"', { cwd: dir });
    execSync('git config user.name "Test"', { cwd: dir });

    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'game.js'), 'export function a() { return 1; }\nexport function b() { return 2; }\n');
    execSync('git add .', { cwd: dir });
    execSync('git commit -m base', { cwd: dir });
    const baseCommit = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf-8' }).trim();

    writeFileSync(join(dir, 'src', 'game.js'), 'export function a() { return 10; }\nexport function c() { return 3; }\n');
    execSync('git add .', { cwd: dir });
    execSync('git commit -m head', { cwd: dir });
    const headCommit = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf-8' }).trim();

    const execGit = createExecGit(execSync);
    const result = locateChangedFunctions(dir, baseCommit, headCommit, join(dir, 'src'), execGit);

    const names = result.changedFunctions.map(f => `${f.changeType}:${f.name}`);
    assert.ok(names.includes('modified:a'), `expected modified:a in ${names}`);
    assert.ok(names.includes('removed:b'), `expected removed:b in ${names}`);
    assert.ok(names.includes('added:c'), `expected added:c in ${names}`);
    assert.strictEqual(result.changedFunctions.length, 3);
    assert.deepStrictEqual(result.uncertainAreas, []);

    rmSync(dir, { recursive: true });
  });

  it('reports uncertain when a change is outside any named function', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tia-test-'));
    execSync('git init', { cwd: dir });
    execSync('git config user.email "test@test.com"', { cwd: dir });
    execSync('git config user.name "Test"', { cwd: dir });

    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'game.js'), 'const X = 1;\nexport function a() { return X; }\n');
    execSync('git add .', { cwd: dir });
    execSync('git commit -m base', { cwd: dir });
    const baseCommit = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf-8' }).trim();

    writeFileSync(join(dir, 'src', 'game.js'), 'const X = 2;\nexport function a() { return X; }\n');
    execSync('git add .', { cwd: dir });
    execSync('git commit -m head', { cwd: dir });
    const headCommit = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf-8' }).trim();

    const execGit = createExecGit(execSync);
    const result = locateChangedFunctions(dir, baseCommit, headCommit, join(dir, 'src'), execGit);

    assert.strictEqual(result.changedFunctions.length, 0);
    assert.strictEqual(result.uncertainAreas.length, 1);
    assert.ok(result.uncertainAreas[0].module.endsWith('src/game.js'));
    assert.ok(result.uncertainAreas[0].reason.includes('outside a named function'));

    rmSync(dir, { recursive: true });
  });

  it('returns empty result when no production files changed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tia-test-'));
    execSync('git init', { cwd: dir });
    execSync('git config user.email "test@test.com"', { cwd: dir });
    execSync('git config user.name "Test"', { cwd: dir });

    writeFileSync(join(dir, 'README.md'), '# hello\n');
    execSync('git add .', { cwd: dir });
    execSync('git commit -m base', { cwd: dir });
    const baseCommit = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf-8' }).trim();

    writeFileSync(join(dir, 'README.md'), '# world\n');
    execSync('git add .', { cwd: dir });
    execSync('git commit -m head', { cwd: dir });
    const headCommit = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf-8' }).trim();

    const execGit = createExecGit(execSync);
    const result = locateChangedFunctions(dir, baseCommit, headCommit, dir, execGit);

    assert.deepStrictEqual(result.changedFunctions, []);
    assert.deepStrictEqual(result.uncertainAreas, []);

    rmSync(dir, { recursive: true });
  });
});

describe('runWorkflow with changed functions', () => {
  it('populates changedFunctions and uncertainAreas in JSON output', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tia-test-'));
    execSync('git init', { cwd: dir });
    execSync('git config user.email "test@test.com"', { cwd: dir });
    execSync('git config user.name "Test"', { cwd: dir });

    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'game.js'), 'export function a() { return 1; }\n');
    execSync('git add .', { cwd: dir });
    execSync('git commit -m base', { cwd: dir });
    const baseCommit = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf-8' }).trim();

    writeFileSync(join(dir, 'src', 'game.js'), 'export function a() { return 2; }\n');
    execSync('git add .', { cwd: dir });
    execSync('git commit -m head', { cwd: dir });
    const headCommit = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf-8' }).trim();

    const files = {};
    const logs = [];

    await runWorkflow({
      baseCommit,
      headCommit,
      sourcePath: 'src',
      reportPath: 'report.html',
      toolDir: dir,
      deps: {
        exists: (p) => p === join(dir, '.git'),
        execSyncImpl: execSync,
        mkdirImpl: async () => {},
        writeFileImpl: async (path, content) => {
          files[path] = content;
        },
        log: (msg) => logs.push(msg),
      },
    });

    const jsonPayload = JSON.parse(files[join(dir, 'report.json')]);
    assert.strictEqual(jsonPayload.changedFunctions.length, 1);
    assert.strictEqual(jsonPayload.changedFunctions[0].name, 'a');
    assert.strictEqual(jsonPayload.changedFunctions[0].changeType, 'modified');
    assert.deepStrictEqual(jsonPayload.uncertainAreas, []);

    const html = files[join(dir, 'report.html')];
    assert.ok(html.includes('Changed Functions'));
    assert.ok(html.includes('a'));
    assert.ok(html.includes('modified'));

    rmSync(dir, { recursive: true });
  });
});
