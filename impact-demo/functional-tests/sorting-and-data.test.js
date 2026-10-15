import test from 'node:test';
import assert from 'node:assert/strict';
import * as ui from './helpers.js';
import { sortTasks, parseTasks } from '../site/src/tasks.js';

test('newest tasks appear first by default', t => {
  const site = ui.fixture(t); ui.add(site, 'First'); ui.add(site, 'Second');
  assert.deepEqual(ui.titles(site), ['Second', 'First']);
});

test('oldest sort puts the first task first', t => {
  const site = ui.fixture(t); ui.add(site, 'First'); ui.add(site, 'Second'); ui.field(site, 'sort', 'oldest');
  assert.deepEqual(ui.titles(site), ['First', 'Second']);
});

test('title sort is alphabetical', t => {
  const site = ui.fixture(t); ui.add(site, 'Zebra'); ui.add(site, 'Apple'); ui.field(site, 'sort', 'title');
  assert.deepEqual(ui.titles(site), ['Apple', 'Zebra']);
  assert.equal(sortTasks(site.app.getTasks(), 'title')[0].title, 'Apple');
});

test('due date sort puts the earliest date first', t => {
  const site = ui.fixture(t); ui.add(site, 'Later', { due: '2026-10-30' }); ui.add(site, 'Soon', { due: '2026-10-16' });
  ui.field(site, 'sort', 'due'); assert.deepEqual(ui.titles(site), ['Soon', 'Later']);
});

test('due date sort puts undated tasks last', t => {
  const site = ui.fixture(t); ui.add(site, 'Undated'); ui.add(site, 'Dated', { due: '2026-10-16' });
  ui.field(site, 'sort', 'due'); assert.deepEqual(ui.titles(site), ['Dated', 'Undated']);
});

test('priority sort orders high medium then low', t => {
  const site = ui.fixture(t); ui.add(site, 'Low', { priority: 'low' }); ui.add(site, 'High', { priority: 'high' });
  ui.add(site, 'Medium', { priority: 'medium' }); ui.field(site, 'sort', 'priority');
  assert.deepEqual(ui.titles(site), ['High', 'Medium', 'Low']);
  assert.equal(sortTasks(site.app.getTasks(), 'priority')[0].title, 'High');
});

test('theme button switches between light and dark', t => {
  const site = ui.fixture(t); ui.click(site, '#theme-toggle');
  assert.equal(site.document.documentElement.dataset.theme, 'dark');
  ui.click(site, '#theme-toggle'); assert.equal(site.document.documentElement.dataset.theme, 'light');
});

test('theme choice persists across a new page mount', t => {
  const site = ui.fixture(t); ui.click(site, '#theme-toggle');
  const again = ui.fixture(t, [], { theme: site.storage.getItem('task-desk-theme') });
  assert.equal(again.document.documentElement.dataset.theme, 'dark');
});

test('exported JSON can restore a deleted task', t => {
  const site = ui.fixture(t); ui.add(site, 'Backup'); ui.click(site, '#export');
  const data = site.document.getElementById('task-data').value;
  ui.action(site, 0, 'delete'); ui.field(site, 'task-data', data); ui.click(site, '#import');
  assert.deepEqual(ui.titles(site), ['Backup']); assert.equal(ui.metric(site, 'total'), 1);
  assert.equal(parseTasks(data)[0].title, 'Backup');
});

test('invalid imported JSON leaves existing tasks intact', t => {
  const site = ui.fixture(t); ui.add(site, 'Keep'); ui.field(site, 'task-data', '{bad'); ui.click(site, '#import');
  assert.deepEqual(ui.titles(site), ['Keep']);
  assert.match(site.document.getElementById('message').textContent, /valid JSON/);
});
