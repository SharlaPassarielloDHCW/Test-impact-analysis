import test from 'node:test';
import assert from 'node:assert/strict';
import * as ui from './helpers.js';
import { toggleTask, editTask, taskStats } from '../site/src/tasks.js';

test('checking a task marks it complete', t => {
  const site = ui.fixture(t); ui.add(site, 'Ship'); ui.complete(site);
  assert.equal(ui.rows(site)[0].querySelector('.task-check').checked, true);
  assert.equal(ui.rows(site)[0].classList.contains('completed'), true);
  assert.equal(toggleTask(site.app.getTasks(), 1)[0].completed, false);
});

test('checking a completed task makes it active again', t => {
  const site = ui.fixture(t); ui.add(site, 'Ship'); ui.complete(site); ui.complete(site);
  assert.equal(ui.rows(site)[0].querySelector('.task-check').checked, false);
});

test('completion updates active and completed counts', t => {
  const site = ui.fixture(t); ui.add(site, 'One'); ui.add(site, 'Two'); ui.complete(site);
  assert.equal(ui.metric(site, 'active'), 1); assert.equal(ui.metric(site, 'completed'), 1);
  assert.equal(taskStats(site.app.getTasks(), ui.fixedNow).completed, 1);
});

test('past due active tasks are counted overdue', t => {
  const site = ui.fixture(t); ui.add(site, 'Old', { due: '2026-10-14' });
  assert.equal(ui.metric(site, 'overdue'), 1);
  assert.ok(ui.rows(site)[0].querySelector('.overdue'));
});

test('a task due today is not overdue', t => {
  const site = ui.fixture(t); ui.add(site, 'Today', { due: '2026-10-15' });
  assert.equal(ui.metric(site, 'overdue'), 0);
});

test('completing an overdue task removes it from the overdue count', t => {
  const site = ui.fixture(t); ui.add(site, 'Old', { due: '2026-10-14' }); ui.complete(site);
  assert.equal(ui.metric(site, 'overdue'), 0);
});

test('edit button opens an inline text field', t => {
  const site = ui.fixture(t); ui.add(site, 'Draft'); ui.action(site, 0, 'edit');
  assert.equal(ui.rows(site)[0].querySelector('.edit-input').value, 'Draft');
});

test('saving an edited name updates the visible task', t => {
  const site = ui.fixture(t); ui.add(site, 'Draft'); ui.action(site, 0, 'edit');
  ui.rows(site)[0].querySelector('.edit-input').value = 'Final'; ui.action(site, 0, 'save');
  assert.deepEqual(ui.titles(site), ['Final']);
  assert.equal(editTask(site.app.getTasks(), 1, 'Ready')[0].title, 'Ready');
});

test('saving a blank edited name preserves the original', t => {
  const site = ui.fixture(t); ui.add(site, 'Draft'); ui.action(site, 0, 'edit');
  ui.rows(site)[0].querySelector('.edit-input').value = '  '; ui.action(site, 0, 'save');
  assert.equal(site.app.getTasks()[0].title, 'Draft');
  assert.match(site.document.getElementById('message').textContent, /1–80 characters/);
  assert.throws(() => editTask(site.app.getTasks(), 1, '  '), /1–80 characters/);
});

test('Enter saves an inline edit', t => {
  const site = ui.fixture(t); ui.add(site, 'Draft'); ui.action(site, 0, 'edit');
  const input = ui.rows(site)[0].querySelector('.edit-input'); input.value = 'Ready';
  input.dispatchEvent(new site.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.deepEqual(ui.titles(site), ['Ready']);
});
