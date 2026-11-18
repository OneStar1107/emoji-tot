/**
 * A local task list with one reminder per task.
 *
 * Due dates are epoch milliseconds and reminders are marked on the item, so
 * restarting the app does not re-announce yesterday's overdue item every
 * launch. Nothing leaves the machine.
 */
const crypto = require('node:crypto');
const { cachePath, readJson, writeJson, readPrefs } = require('../paths');
const { notify } = require('./notify');

let items = [];
let timer = null;
const listeners = new Set();

function load() {
  const saved = readJson(cachePath('todos'), null);
  items = Array.isArray(saved?.items) ? saved.items : [];
}

function save() {
  writeJson(cachePath('todos'), { items });
}

function emit() {
  const value = list();
  for (const fn of listeners) {
    try {
      fn(value);
    } catch {
      // ignore
    }
  }
}

function list() {
  return items
    .slice()
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return (a.due ?? Number.MAX_SAFE_INTEGER) - (b.due ?? Number.MAX_SAFE_INTEGER);
    })
    .map((item) => ({ ...item }));
}

/** Repeat kinds a task can carry. "none" is the default and is not stored. */
const REPEATS = new Set(['daily', 'weekly']);

/**
 * The next time this repeat should come around, expressed in the future.
 *
 * A repeating task is completed late often enough that adding one period once
 * is not enough — finish Monday's chore on Thursday and the next one is already
 * tomorrow, not yesterday. This walks forward until it lands in the future.
 */
function nextDue(base, repeat) {
  const step = repeat === 'daily' ? 86400000 : 7 * 86400000;
  let next = base + step;
  const now = Date.now();
  let guard = 0;
  while (next <= now && guard < 400) {
    next += step;
    guard += 1;
  }
  return next;
}

function add(text, due, repeat) {
  const body = String(text ?? '').trim();
  if (!body) return null;
  const item = {
    id: crypto.randomBytes(4).toString('hex'),
    text: body.slice(0, 200),
    done: false,
    due: Number.isFinite(Number(due)) && Number(due) > 0 ? Number(due) : null,
    createdAt: Date.now(),
    reminded: false,
  };
  if (REPEATS.has(repeat)) {
    item.repeat = repeat;
    /*
     * A repeat without a due date has nothing to count from, so it would never
     * come back. Give it the first occurrence: one period from now.
     */
    if (!item.due) item.due = Date.now() + (repeat === 'daily' ? 86400000 : 7 * 86400000);
  }
  items.push(item);
  save();
  emit();
  return item;
}

function toggle(id) {
  const item = items.find((entry) => entry.id === id);
  if (!item) return;
  item.done = !item.done;
  if (item.done) {
    item.reminded = true;
    // A repeating task is not finished, it is scheduled again: keep it in the
    // done column until the next occurrence comes due, then revive it.
    if (item.repeat && item.due) {
      item.nextDue = nextDue(item.due, item.repeat);
    }
  } else {
    item.nextDue = null;
  }
  save();
  emit();
}

function remove(id) {
  items = items.filter((entry) => entry.id !== id);
  save();
  emit();
}

function update(id, patch) {
  const item = items.find((entry) => entry.id === id);
  if (!item) return;
  if (typeof patch.text === 'string' && patch.text.trim()) item.text = patch.text.trim().slice(0, 200);
  if ('due' in patch) {
    item.due = Number.isFinite(Number(patch.due)) && Number(patch.due) > 0 ? Number(patch.due) : null;
    item.reminded = false;
  }
  if ('repeat' in patch) {
    if (REPEATS.has(patch.repeat)) item.repeat = patch.repeat;
    else delete item.repeat;
    item.nextDue = null;
  }
  save();
  emit();
}

function clearDone() {
  items = items.filter((entry) => !entry.done);
  save();
  emit();
}

function checkDue() {
  const prefs = readPrefs();
  if (prefs.todo?.enabled === false) return;
  const shouldNotify = prefs.todo?.notify !== false;
  const now = Date.now();
  let changed = false;
  for (const item of items) {
    if (item.done && item.nextDue && item.nextDue <= now) {
      // The next occurrence arrived: put it back in the list as a live task.
      item.done = false;
      item.due = item.nextDue;
      item.nextDue = null;
      item.reminded = false;
      changed = true;
      continue;
    }
    if (item.done || item.reminded || !item.due || item.due > now) continue;
    item.reminded = true;
    changed = true;
    if (shouldNotify) notify('待办到期', item.text);
  }
  if (changed) save();
  if (changed) emit();
}

function startService() {
  load();
  clearInterval(timer);
  timer = setInterval(checkDue, 30000);
  checkDue();
}

function stopService() {
  clearInterval(timer);
  timer = null;
}

function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

module.exports = { startService, stopService, onChange, list, add, toggle, remove, update, clearDone };
