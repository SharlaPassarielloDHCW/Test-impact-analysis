export function normalizeTitle(value) {
  return String(value).trim().replace(/\s+/g, ' ');
}

export function createTask(tasks, input, now = new Date()) {
  const title = normalizeTitle(input.title);
  if (!title || title.length > 80) throw new Error('Task name must be 1–80 characters.');
  const due = input.due || '';
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error('Use a valid due date.');
  return {
    id: Math.max(0, ...tasks.map(task => Number(task.id) || 0)) + 1,
    title,
    category: ['Work', 'Personal', 'Study'].includes(input.category) ? input.category : 'Work',
    priority: ['low', 'medium', 'high'].includes(input.priority) ? input.priority : 'medium',
    due,
    completed: false,
    createdAt: now.toISOString(),
  };
}

export function addTask(tasks, input, now = new Date()) {
  return [...tasks, createTask(tasks, input, now)];
}

export function toggleTask(tasks, id) {
  return tasks.map(task => task.id === id ? { ...task, completed: !task.completed } : task);
}

export function editTask(tasks, id, title) {
  const next = normalizeTitle(title);
  if (!next || next.length > 80) throw new Error('Task name must be 1–80 characters.');
  return tasks.map(task => task.id === id ? { ...task, title: next } : task);
}

export function deleteTask(tasks, id) {
  return tasks.filter(task => task.id !== id);
}

export function clearCompleted(tasks) {
  return tasks.filter(task => !task.completed);
}

export function filterTasks(tasks, { status = 'all', priority = 'all', query = '' } = {}) {
  const text = normalizeTitle(query).toLocaleLowerCase();
  return tasks.filter(task =>
    (status === 'all' || (status === 'completed') === task.completed) &&
    (priority === 'all' || priority === task.priority) &&
    (!text || `${task.title} ${task.category}`.toLocaleLowerCase().includes(text)));
}

export function sortTasks(tasks, order = 'newest') {
  const rank = { high: 0, medium: 1, low: 2 };
  return [...tasks].sort((a, b) => {
    if (order === 'title') return a.title.localeCompare(b.title) || a.id - b.id;
    if (order === 'due') return (a.due || '9999-12-31').localeCompare(b.due || '9999-12-31') || a.id - b.id;
    if (order === 'priority') return rank[a.priority] - rank[b.priority] || a.id - b.id;
    return order === 'oldest' ? a.id - b.id : b.id - a.id;
  });
}

export function taskStats(tasks, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return {
    total: tasks.length,
    active: tasks.filter(task => !task.completed).length,
    completed: tasks.filter(task => task.completed).length,
    overdue: tasks.filter(task => !task.completed && task.due && task.due < today).length,
  };
}

export function parseTasks(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Task data must be valid JSON.'); }
  if (!Array.isArray(data) || data.some(task => !task || typeof task !== 'object' ||
    !Number.isSafeInteger(task.id) || task.id < 1 || typeof task.title !== 'string' ||
    !normalizeTitle(task.title) || typeof task.completed !== 'boolean' ||
    !['Work', 'Personal', 'Study'].includes(task.category) ||
    !['low', 'medium', 'high'].includes(task.priority) ||
    typeof task.due !== 'string' || typeof task.createdAt !== 'string'))
    throw new Error('Task data has an invalid task.');
  if (new Set(data.map(task => task.id)).size !== data.length) throw new Error('Task IDs must be unique.');
  return data.map(task => ({ id: task.id, title: normalizeTitle(task.title), category: task.category,
    priority: task.priority, due: task.due, completed: task.completed, createdAt: task.createdAt }));
}

export function loadTasks(storage) {
  try { return parseTasks(storage.getItem('task-desk-tasks') || '[]'); } catch { return []; }
}

export function saveTasks(storage, tasks) {
  storage.setItem('task-desk-tasks', JSON.stringify(tasks));
}
