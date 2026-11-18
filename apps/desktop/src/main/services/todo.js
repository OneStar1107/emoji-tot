/**
 * A local task list with one reminder per task.
 *
 * Due dates are epoch milliseconds and reminders are marked on the item, so
 * restarting the app does not re-announce yesterday's overdue item every
 * launch. Nothing leaves the machine.
 */
const { Notification } = require('electron');
const crypto = require('node:crypto');
const { cachePath, readJson, writeJson } = require('../paths');

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

function add(text, due) {
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
  items.push(item);
  save();
  emit();
  return item;
}

function toggle(id) {
  const item = items.find((entry) => entry.id === id);
  if (!item) return;
  item.done = !item.done;
  if (item.done) item.reminded = true;
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
  save();
  emit();
}

function clearDone() {
  items = items.filter((entry) => !entry.done);
  save();
  emit();
}

function checkDue() {
  const now = Date.now();
  let changed = false;
  for (const item of items) {
    if (item.done || item.reminded || !item.due || item.due > now) continue;
    item.reminded = true;
    changed = true;
    try {
      new Notification({ title: '待办到期', body: item.text }).show();
    } catch {
      // best effort
    }
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
