import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { mountApp } from '../site/src/app.js';

const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
export const fixedNow = new Date('2026-10-15T12:00:00.000Z');

export function fixture(t, initial = [], options = {}) {
  const window = new JSDOM(html, { url: 'http://task-desk.test/' }).window;
  t.after(() => window.close());
  if (initial.length) window.localStorage.setItem('task-desk-tasks', JSON.stringify(initial));
  if (options.theme) window.localStorage.setItem('task-desk-theme', options.theme);
  const document = window.document;
  const app = mountApp(document, window.localStorage, () => fixedNow);
  return { window, document, app, storage: window.localStorage };
}

export function field(site, id, value) {
  const element = site.document.getElementById(id);
  element.value = value;
  element.dispatchEvent(new site.window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  return element;
}

export function click(site, selector) {
  const element = site.document.querySelector(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  element.click();
  return element;
}

export function add(site, title, options = {}) {
  field(site, 'task-title', title);
  if (options.category) field(site, 'task-category', options.category);
  if (options.priority) field(site, 'task-priority', options.priority);
  if (options.due) field(site, 'task-due', options.due);
  site.document.getElementById('task-form').dispatchEvent(new site.window.Event('submit', { bubbles: true, cancelable: true }));
}

export function rows(site) { return [...site.document.querySelectorAll('#task-list .task')]; }
export function titles(site) { return rows(site).map(row => row.querySelector('.task-title')?.textContent); }
export function metric(site, name) { return Number(site.document.getElementById(`stat-${name}`).textContent); }
export function complete(site, index = 0) {
  const checkbox = rows(site)[index].querySelector('.task-check');
  checkbox.checked = !checkbox.checked;
  checkbox.dispatchEvent(new site.window.Event('change', { bubbles: true }));
}
export function action(site, index, name) { rows(site)[index].querySelector(`[data-action="${name}"]`).click(); }
export function status(site, name) { click(site, `[data-status="${name}"]`); }
export function task(id, title, overrides = {}) {
  return { id, title, category: 'Work', priority: 'medium', due: '', completed: false,
    createdAt: fixedNow.toISOString(), ...overrides };
}
