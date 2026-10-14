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
} from '../bin/test-impact-analysis.js';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
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
  it('writes html and json placeholders', async () => {
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
