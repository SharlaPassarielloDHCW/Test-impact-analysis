import test from 'node:test';
import assert from 'node:assert/strict';
import * as ui from './helpers.js';
import { normalizeTitle, createTask, addTask } from '../site/src/tasks.js';

test('empty dashboard invites a first task', t => {
  const site = ui.fixture(t);
  assert.match(site.document.getElementById('empty-state').textContent, /No tasks yet/);
  assert.equal(ui.metric(site, 'total'), 0);
});

test('submitting a task displays it in the list', t => {
  const site = ui.fixture(t); ui.add(site, 'Write tests');
  assert.deepEqual(ui.titles(site), ['Write tests']);
});

test('task names are trimmed and internal whitespace is collapsed', t => {
  const site = ui.fixture(t); ui.add(site, '  Write   useful\n tests  ');
  assert.deepEqual(ui.titles(site), ['Write useful tests']);
  assert.equal(normalizeTitle('  Write   useful\n tests  '), 'Write useful tests');
});

test('a blank task name is rejected', t => {
  const site = ui.fixture(t); ui.add(site, '   ');
  assert.equal(ui.rows(site).length, 0);
  assert.match(site.document.getElementById('message').textContent, /1–80 characters/);
  assert.throws(() => createTask([], { title: '   ' }), /1–80 characters/);
});

test('an 80 character name is accepted', t => {
  const site = ui.fixture(t); ui.add(site, 'A'.repeat(80));
  assert.equal(ui.titles(site)[0].length, 80);
  assert.equal(createTask([], { title: 'A'.repeat(80) }).title.length, 80);
});

test('a name longer than 80 characters is rejected', t => {
  const site = ui.fixture(t); ui.add(site, 'A'.repeat(81));
  assert.equal(ui.rows(site).length, 0);
  assert.throws(() => createTask([], { title: 'A'.repeat(81) }), /1–80 characters/);
});

test('selected category appears on the task', t => {
  const site = ui.fixture(t); ui.add(site, 'Read book', { category: 'Study' });
  assert.match(ui.rows(site)[0].textContent, /Study/);
});

test('selected priority appears on the task', t => {
  const site = ui.fixture(t); ui.add(site, 'Pay bill', { priority: 'high' });
  assert.match(ui.rows(site)[0].querySelector('.pill').textContent, /high/);
});

test('selected due date appears on the task', t => {
  const site = ui.fixture(t); ui.add(site, 'Call Sam', { due: '2026-10-20' });
  assert.match(ui.rows(site)[0].textContent, /2026-10-20/);
});

test('each submitted task has a distinct identifier', t => {
  const site = ui.fixture(t); ui.add(site, 'First'); ui.add(site, 'Second');
  assert.deepEqual(site.app.getTasks().map(task => task.id), [1, 2]);
  assert.equal(addTask(site.app.getTasks(), { title: 'Third' })[2].id, 3);
  assert.equal(ui.field(site, 'task-title', '').value, '');
});
