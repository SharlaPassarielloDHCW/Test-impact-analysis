import test from 'node:test';
import assert from 'node:assert/strict';
import * as ui from './helpers.js';
import { filterTasks } from '../site/src/tasks.js';

test('Active filter hides completed tasks', t => {
  const site = ui.fixture(t); ui.add(site, 'Active'); ui.add(site, 'Done'); ui.complete(site, 0); ui.status(site, 'active');
  assert.deepEqual(ui.titles(site), ['Active']);
  assert.equal(filterTasks(site.app.getTasks(), { status: 'active' }).length, 1);
});

test('Completed filter hides active tasks', t => {
  const site = ui.fixture(t); ui.add(site, 'Active'); ui.add(site, 'Done'); ui.complete(site, 0); ui.status(site, 'completed');
  assert.deepEqual(ui.titles(site), ['Done']);
});

test('All filter restores every task', t => {
  const site = ui.fixture(t); ui.add(site, 'Active'); ui.add(site, 'Done'); ui.complete(site, 0);
  ui.status(site, 'active'); ui.status(site, 'all'); assert.equal(ui.rows(site).length, 2);
});

test('selected status filter exposes pressed state', t => {
  const site = ui.fixture(t); ui.status(site, 'completed');
  assert.equal(site.document.querySelector('[data-status="completed"]').getAttribute('aria-pressed'), 'true');
  assert.equal(site.document.querySelector('[data-status="all"]').getAttribute('aria-pressed'), 'false');
});

test('search finds a task by its title', t => {
  const site = ui.fixture(t); ui.add(site, 'Write report'); ui.add(site, 'Call client'); ui.field(site, 'search', 'report');
  assert.deepEqual(ui.titles(site), ['Write report']);
  assert.equal(filterTasks(site.app.getTasks(), { query: 'report' })[0].title, 'Write report');
});

test('search finds a task by category', t => {
  const site = ui.fixture(t); ui.add(site, 'Read chapter', { category: 'Study' }); ui.add(site, 'Call client');
  ui.field(site, 'search', 'Study'); assert.deepEqual(ui.titles(site), ['Read chapter']);
});

test('search ignores letter case', t => {
  const site = ui.fixture(t); ui.add(site, 'Review PR'); ui.field(site, 'search', 'REVIEW');
  assert.deepEqual(ui.titles(site), ['Review PR']);
});

test('an unmatched search shows a filter-specific empty message', t => {
  const site = ui.fixture(t); ui.add(site, 'Review PR'); ui.field(site, 'search', 'nothing');
  assert.equal(ui.rows(site).length, 0);
  assert.match(site.document.getElementById('empty-state').textContent, /No tasks match/);
});

test('priority filter selects only matching tasks', t => {
  const site = ui.fixture(t); ui.add(site, 'Urgent', { priority: 'high' }); ui.add(site, 'Later', { priority: 'low' });
  ui.field(site, 'priority-filter', 'high'); assert.deepEqual(ui.titles(site), ['Urgent']);
});

test('status search and priority filters combine', t => {
  const site = ui.fixture(t); ui.add(site, 'Work urgent', { priority: 'high' });
  ui.add(site, 'Work later', { priority: 'low' }); ui.add(site, 'Personal urgent', { priority: 'high' });
  ui.complete(site, 0); ui.status(site, 'active'); ui.field(site, 'priority-filter', 'high'); ui.field(site, 'search', 'Work');
  assert.deepEqual(ui.titles(site), ['Work urgent']);
});
