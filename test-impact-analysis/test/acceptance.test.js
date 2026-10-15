import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWorkflow } from '../bin/test-impact-analysis.js';

function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'impact acceptance '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test');
  function write(files) {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      if (content === null) rmSync(join(root, path));
      else writeFileSync(join(root, path), content);
    }
  }
  const commit = () => { git('add', '.'); git('commit', '--allow-empty', '-m', 'fixture'); return git('rev-parse', 'HEAD'); };
  write(files); const base = commit();
  return { root, git, write, commit, base, async report(head, extra = {}) {
    await runWorkflow({ baseCommit: base, headCommit: head, sourcePath: 'src', reportPath: 'report.html', toolDir: root, deps: { log() {} }, ...extra });
    return JSON.parse(readFileSync(join(root, 'report.json'), 'utf8'));
  } };
}

test('direct, transitive and imported alias paths are stable and read committed content', async t => {
  const f = fixture(t, {
    'src/pieces.js': 'function shape() { return 1; } export { shape as getShape };',
    'src/game.js': `import { getShape as shape } from './pieces.js';
export function collides() { return shape(); }
export function movePiece() { return collides(); }
export function tick() { return movePiece(); }`,
    'src/other.js': 'export function shape() { return 1; }',
  });
  f.write({ 'src/pieces.js': 'function shape() { return 2; } export { shape as getShape };' });
  const head = f.commit();
  f.write({ 'src/pieces.js': 'this uncommitted text is invalid JavaScript' });
  const map = await f.report(head);
  assert.deepEqual(map.changedFunctions, [{ module: 'src/pieces.js', name: 'shape', changeType: 'modified' }]);
  const tick = map.impactedFunctions.find(fn => fn.name === 'tick');
  assert.deepEqual(tick.callPath.map(fn => fn.name), ['tick', 'movePiece', 'collides', 'shape']);
  assert.equal(map.impactedFunctions.length, 3);
  assert.deepEqual(map.uncertainAreas, []);
  const first = readFileSync(join(f.root, 'report.html'), 'utf8');
  assert.match(first, /3 confirmed call paths/);
  assert.match(first, /src\/game.js#tick →/);
  assert.deepEqual(await f.report(head), map);
  assert.equal(readFileSync(join(f.root, 'report.html'), 'utf8'), first);
});

test('deletion-only function edits and outside statements, strings and comments', async t => {
  const f = fixture(t, { 'src/a.js': `const removed = 1;
export function clearLines() {
  const text = "}"; // {
  return 1;
}
export function settlePiece() { return clearLines(); }` });
  f.write({ 'src/a.js': `export function clearLines() {
  const text = "}"; // {
}
export function settlePiece() { return clearLines(); }` });
  const map = await f.report(f.commit());
  assert.deepEqual(map.changedFunctions.map(fn => fn.name), ['clearLines']);
  assert.equal(map.impactedFunctions[0].name, 'settlePiece');
  assert.ok(map.uncertainAreas.some(a => a.reason.includes('outside a named function')));
});

test('computed calls, dynamic imports, shadowing and removals stay uncertain', async t => {
  const f = fixture(t, { 'src/a.js': `export function target() { return 1; }
export function removed() { return 1; }
export function caller(target) { return target(); }
export function dynamic(obj, key) { return obj[key](); }
export function load() { return import('./a.js'); }
export function oldCaller() { return removed(); }` });
  f.write({ 'src/a.js': `export function target() { return 2; }
export function caller(target) { return target(); }
export function dynamic(obj, key) { return obj[key](); }
export function load() { return import('./a.js'); }
export function oldCaller() { return removed(); }` });
  const map = await f.report(f.commit());
  assert.ok(map.changedFunctions.some(f => f.changeType === 'removed'));
  assert.equal(map.impactedFunctions.length, 0);
  for (const reason of ['dynamic import', 'unresolved call in caller', 'unresolved call in dynamic', 'removed function']) {
    assert.ok(map.uncertainAreas.some(a => a.reason.includes(reason)), reason);
    assert.ok(readFileSync(join(f.root, 'report.html'), 'utf8').includes(reason));
  }
});

test('outside-source and ignored-file changes produce an explicit empty result', async t => {
  const f = fixture(t, { 'src/a.js': 'export function a() {}', 'README.md': 'base' });
  f.write({ 'README.md': 'head', 'src/test/a.js': 'broken syntax', 'src/dist/out.js': 'broken syntax' });
  const map = await f.report(f.commit());
  assert.deepEqual(map.changedFiles, []);
  assert.deepEqual(map.changedFunctions, []);
  assert.deepEqual(map.impactedFunctions, []);
  assert.deepEqual(map.uncertainAreas, []);
  assert.match(readFileSync(join(f.root, 'report.html'), 'utf8'), /No relevant changes/);
});

test('invalid inputs and unwritable companion output do not create HTML success reports', async t => {
  const f = fixture(t, { 'src/a.js': 'export function a() {}' });
  await assert.rejects(f.report('missing-commit'), /cannot be resolved/);
  await assert.rejects(f.report(f.base, { sourcePath: 'missing' }), /does not exist/);
  await assert.rejects(f.report(f.base, { sourcePath: '../outside' }), /inside the Git/);
  mkdirSync(join(f.root, 'report.json'));
  await assert.rejects(f.report(f.base), /cannot write report/);
  assert.equal(existsSync(join(f.root, 'report.html')), false);
});

test('cycles terminate and parse failures are visible', async t => {
  const f = fixture(t, { 'src/a.js': 'export function a() { return b(); }\nexport function b() { return a(); }', 'src/bad.js': 'export function good() {}' });
  f.write({ 'src/a.js': 'export function a() { return b() + 1; }\nexport function b() { return a(); }', 'src/bad.js': 'export function {' });
  const map = await f.report(f.commit());
  assert.equal(map.impactedFunctions.length, 1);
  assert.equal(map.impactedFunctions[0].name, 'b');
  assert.ok(map.uncertainAreas.some(a => a.module === 'src/bad.js' && a.reason.includes('parse failed')));
});

test('CLI runs from root and nested directory, handles quoted paths, and protects source', async t => {
  const f = fixture(t, { "src/quote's.js": 'export function a() { return 1; }' });
  f.write({ "src/quote's.js": 'export function a() { return 2; }' });
  const head = f.commit();
  const cli = fileURLToPath(new URL('../bin/test-impact-analysis.js', import.meta.url));
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  mkdirSync(join(f.root, 'nested'));
  for (const cwd of [f.root, join(f.root, 'nested')]) {
    const result = spawnSync(process.execPath, [cli, '--base', f.base, '--head', head,
      '--source', 'src', '--report', 'report.html'], { cwd, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(join(f.root, 'report.json'), 'utf8')).changedFunctions[0].name, 'a');
  }
  await assert.rejects(f.report(head, { reportPath: 'src/new/report.html' }), /outside the analyzed source/);
  assert.equal(existsSync(join(f.root, 'src/new')), false);
  const result = spawnSync(process.execPath, [cli, '--unknown'], { cwd: f.root, env, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Error:/);
});
