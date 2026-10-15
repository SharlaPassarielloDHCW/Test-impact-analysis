import { addTask, toggleTask, editTask, deleteTask, clearCompleted, filterTasks, sortTasks,
  taskStats, parseTasks, loadTasks, saveTasks } from './tasks.js';

export function mountApp(root = document, storage = root.defaultView.localStorage, clock = () => new Date()) {
  const byId = id => root.getElementById(id);
  let tasks = loadTasks(storage);
  let status = 'all';
  let editingId = null;
  const theme = storage.getItem('task-desk-theme') === 'dark' ? 'dark' : 'light';
  root.documentElement.dataset.theme = theme;
  const message = text => { byId('message').textContent = text; };
  const commit = next => { tasks = next; saveTasks(storage, tasks); render(); };

  function render() {
    const stats = taskStats(tasks, clock());
    for (const key of Object.keys(stats)) byId(`stat-${key}`).textContent = String(stats[key]);
    byId('clear-completed').disabled = stats.completed === 0;
    for (const button of byId('status-filters').querySelectorAll('button'))
      button.setAttribute('aria-pressed', String(button.dataset.status === status));
    const visible = sortTasks(filterTasks(tasks, {
      status, priority: byId('priority-filter').value, query: byId('search').value,
    }), byId('sort').value);
    byId('empty-state').hidden = visible.length > 0;
    byId('empty-state').textContent = tasks.length ? 'No tasks match these filters.' : 'No tasks yet. Add one above to get started.';
    const list = byId('task-list');
    list.replaceChildren();
    for (const task of visible) {
      const row = root.createElement('li');
      row.className = `task${task.completed ? ' completed' : ''}`;
      row.dataset.id = task.id;
      const check = root.createElement('input');
      check.className = 'task-check'; check.type = 'checkbox'; check.checked = task.completed;
      check.setAttribute('aria-label', `Complete ${task.title}`);
      const body = root.createElement('div'); body.className = 'task-body';
      if (editingId === task.id) {
        const input = root.createElement('input'); input.className = 'edit-input'; input.value = task.title;
        input.setAttribute('aria-label', 'Edit task name'); body.append(input);
      } else {
        const title = root.createElement('div'); title.className = 'task-title'; title.textContent = task.title; body.append(title);
      }
      const meta = root.createElement('div'); meta.className = 'task-meta';
      const category = root.createElement('span'); category.textContent = task.category;
      const priority = root.createElement('span'); priority.className = `pill ${task.priority}`; priority.textContent = task.priority;
      meta.append(category, priority);
      if (task.due) {
        const due = root.createElement('span'); due.textContent = `Due ${task.due}`;
        if (!task.completed && task.due < clock().toISOString().slice(0, 10)) due.className = 'overdue';
        meta.append(due);
      }
      body.append(meta);
      const actions = root.createElement('div'); actions.className = 'task-actions';
      for (const [action, label] of editingId === task.id ? [['save', 'Save'], ['cancel', 'Cancel']] : [['edit', 'Edit'], ['delete', 'Delete']]) {
        const button = root.createElement('button'); button.type = 'button'; button.dataset.action = action; button.textContent = label;
        button.setAttribute('aria-label', `${label} ${task.title}`); actions.append(button);
      }
      row.append(check, body, actions); list.append(row);
    }
  }

  byId('task-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      commit(addTask(tasks, { title: byId('task-title').value, category: byId('task-category').value,
        priority: byId('task-priority').value, due: byId('task-due').value }, clock()));
      byId('task-form').reset(); byId('task-title').focus(); message('Task added.');
    } catch (error) { message(error.message); }
  });
  byId('task-list').addEventListener('change', event => {
    if (!event.target.matches('.task-check')) return;
    commit(toggleTask(tasks, Number(event.target.closest('.task').dataset.id)));
  });
  byId('task-list').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = Number(button.closest('.task').dataset.id);
    if (button.dataset.action === 'delete') { commit(deleteTask(tasks, id)); message('Task deleted.'); }
    if (button.dataset.action === 'edit') { editingId = id; render(); byId('task-list').querySelector('.edit-input').focus(); }
    if (button.dataset.action === 'cancel') { editingId = null; render(); }
    if (button.dataset.action === 'save') {
      try { commit(editTask(tasks, id, button.closest('.task').querySelector('.edit-input').value)); editingId = null; render(); message('Task renamed.'); }
      catch (error) { message(error.message); }
    }
  });
  byId('task-list').addEventListener('keydown', event => {
    if (!event.target.matches('.edit-input')) return;
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      event.target.closest('.task').querySelector(`[data-action="${event.key === 'Enter' ? 'save' : 'cancel'}"]`).click();
    }
  });
  byId('clear-completed').addEventListener('click', () => { commit(clearCompleted(tasks)); message('Completed tasks cleared.'); });
  byId('status-filters').addEventListener('click', event => {
    const button = event.target.closest('button[data-status]'); if (button) { status = button.dataset.status; render(); }
  });
  for (const id of ['search', 'priority-filter', 'sort']) byId(id).addEventListener(id === 'search' ? 'input' : 'change', render);
  byId('theme-toggle').addEventListener('click', () => {
    const next = root.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    root.documentElement.dataset.theme = next; storage.setItem('task-desk-theme', next);
  });
  byId('export').addEventListener('click', () => { byId('task-data').value = JSON.stringify(tasks, null, 2); message('Tasks exported below.'); });
  byId('import').addEventListener('click', () => {
    try { commit(parseTasks(byId('task-data').value)); message('Tasks imported.'); }
    catch (error) { message(error.message); }
  });
  byId('sample').addEventListener('click', () => {
    let next = tasks;
    for (const [title, category, priority] of [['Plan the week', 'Work', 'high'], ['Read a chapter', 'Study', 'medium'], ['Take a walk', 'Personal', 'low']])
      next = addTask(next, { title, category, priority, due: '' }, clock());
    commit(next); message('Sample tasks added.');
  });
  render();
  return { getTasks: () => [...tasks], render };
}

if (typeof document !== 'undefined') mountApp(document);
