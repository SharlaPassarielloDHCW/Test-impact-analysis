import test from 'node:test';
import assert from 'node:assert/strict';
import * as ui from './helpers.js';
import { deleteTask, clearCompleted } from '../site/src/tasks.js';

test('Escape cancels an inline edit', t => {
  const site = ui.fixture(t); ui.add(site, 'Original'); ui.action(site, 0, 'edit');
  const input = ui.rows(site)[0].querySelector('.edit-input'); input.value = 'Changed';
  input.dispatchEvent(new site.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.deepEqual(ui.titles(site), ['Original']);
});

test('Cancel button leaves a task name alone', t => {
  const site = ui.fixture(t); ui.add(site, 'Original'); ui.action(site, 0, 'edit');
  ui.rows(site)[0].querySelector('.edit-input').value = 'Changed'; ui.action(site, 0, 'cancel');
  assert.deepEqual(ui.titles(site), ['Original']);
});

test('Delete removes the selected task', t => {
  const site = ui.fixture(t); ui.add(site, 'Remove'); ui.action(site, 0, 'delete');
  assert.equal(ui.rows(site).length, 0); assert.equal(ui.metric(site, 'total'), 0);
});

test('Delete preserves other tasks', t => {
  const site = ui.fixture(t); ui.add(site, 'Keep'); ui.add(site, 'Remove'); ui.action(site, 0, 'delete');
  assert.deepEqual(ui.titles(site), ['Keep']);
  assert.deepEqual(deleteTask(site.app.getTasks(), 99), site.app.getTasks());
});

test('Clear completed is disabled with no completed tasks', t => {
  const site = ui.fixture(t); ui.add(site, 'Still active');
  assert.equal(site.document.getElementById('clear-completed').disabled, true);
});

test('Clear completed removes finished tasks', t => {
  const site = ui.fixture(t); ui.add(site, 'Done'); ui.complete(site); ui.click(site, '#clear-completed');
  assert.equal(ui.rows(site).length, 0); assert.equal(ui.metric(site, 'completed'), 0);
});

test('Clear completed preserves active tasks', t => {
  const site = ui.fixture(t); ui.add(site, 'Keep'); ui.add(site, 'Done'); ui.complete(site, 0); ui.click(site, '#clear-completed');
  assert.deepEqual(ui.titles(site), ['Keep']);
  assert.deepEqual(clearCompleted(site.app.getTasks()), site.app.getTasks());
});

test('deleting the last task restores the empty message', t => {
  const site = ui.fixture(t); ui.add(site, 'Last'); ui.action(site, 0, 'delete');
  assert.equal(site.document.getElementById('empty-state').hidden, false);
});

test('sample button adds three distinct tasks', t => {
  const site = ui.fixture(t); ui.click(site, '#sample');
  assert.equal(ui.rows(site).length, 3); assert.equal(new Set(ui.titles(site)).size, 3);
});

test('tasks persist when the page is mounted again', t => {
  const site = ui.fixture(t); ui.add(site, 'Keep after reload');
  const again = ui.fixture(t, JSON.parse(site.storage.getItem('task-desk-tasks')));
  assert.deepEqual(ui.titles(again), ['Keep after reload']);
});
