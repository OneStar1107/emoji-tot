/**
 * A local task list with one reminder per task.
 *
 * Due dates are epoch milliseconds and reminders are marked on the item, so
 * restarting the app does not re-announce yesterday's overdue item every
 * launch. A repeating task carries a rule (每天 / 每周 / 工作日); ticking it
 * writes the completed occurrence to the done column and pushes the next one
 * as a fresh row. Every task also carries a priority (高 / 中 / 低) that decides
 * the order the list is read in. Nothing leaves the machine.
 */
const crypto = require('node:crypto');
const { cachePath, readJson, writeJson, readPrefs } = require('../paths');
const { notify } = require('./notify');

let items = [];
let timer = null;
const listeners = new Set();

/** Priority is a fixed three-value scale; a task without one reads as 中. */
const PRIORITY_RANK = { high: 0, mid: 1, low: 2 };
const PRIORITIES = new Set(Object.keys(PRIORITY_RANK));

/**
 * Rows written before priority existed read as 中 from now on. Normalising on
 * load, rather than on every read, keeps one shape in memory and in the file
 * the next save writes.
 */
function normalize(item) {
  const next = { ...item };
  if (!PRIORITIES.has(next.priority)) next.priority = 'mid';
  return next;
}

function load() {
  const saved = readJson(cachePath('todos'), null);
  items = Array.isArray(saved?.items) ? saved.items.map(normalize) : [];
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
      /* Priority first, then the deadline: a 高 task due next week outranks a
         低 one due this afternoon, because that is the order to work in. */
      const rank = (PRIORITY_RANK[a.priority] ?? PRIORITY_RANK.mid) - (PRIORITY_RANK[b.priority] ?? PRIORITY_RANK.mid);
      if (rank) return rank;
      return (a.due ?? Number.MAX_SAFE_INTEGER) - (b.due ?? Number.MAX_SAFE_INTEGER);
    })
    .map((item) => ({ ...item }));
}

/** Repeat kinds a task can carry. "none" is the default and is not stored. */
const REPEATS = new Set(['daily', 'weekly', 'workday']);

const DAY = 86400000;
const WORKDAYS = new Set([1, 2, 3, 4, 5]);
const isWorkday = (time) => WORKDAYS.has(new Date(time).getDay());

/**
 * The next time this repeat should come around, expressed in the future.
 *
 * A repeating task is completed late often enough that adding one period once
 * is not enough — finish Monday's chore on Thursday and the next one is already
 * tomorrow, not yesterday. This walks forward until it lands in the future.
 * Workdays step one day at a time and skip Saturday and Sunday, so a Friday
 * chore comes back on Monday instead of on the weekend.
 */
function nextDue(base, repeat) {
  const step = repeat === 'weekly' ? 7 * DAY : DAY;
  const now = Date.now();
  let next = base + step;
  let guard = 0;
  while ((next <= now || (repeat === 'workday' && !isWorkday(next))) && guard < 400) {
    next += step;
    guard += 1;
  }
  return next;
}

function add(text, due, repeat, priority) {
  const body = String(text ?? '').trim();
  if (!body) return null;
  const item = {
    id: crypto.randomBytes(4).toString('hex'),
    text: body.slice(0, 200),
    done: false,
    due: Number.isFinite(Number(due)) && Number(due) > 0 ? Number(due) : null,
    createdAt: Date.now(),
    reminded: false,
    priority: PRIORITIES.has(priority) ? priority : 'mid',
  };
  if (REPEATS.has(repeat)) {
    item.repeat = repeat;
    /*
     * A repeat without a due date has nothing to count from, so it would never
     * come back. Give it the first occurrence: one period from now, on a
     * weekday when the repeat only counts workdays.
     */
    if (!item.due) item.due = nextDue(Date.now(), repeat);
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
    /*
     * A repeat is not a property of the row that was ticked: the occurrence
     * just completed is history, and the next one is born immediately with its
     * own id and its own deadline. Two rows, not one row that comes back —
     * which is also why 清空已完成 cannot take the next occurrence with it.
     */
    if (item.repeat && item.due) {
      const next = {
        ...item,
        id: crypto.randomBytes(4).toString('hex'),
        done: false,
        due: nextDue(item.due, item.repeat),
        createdAt: Date.now(),
        reminded: false,
      };
      delete next.nextDue;
      items.push(next);
      delete item.repeat;
      delete item.nextDue;
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
      /*
       * Rows written by older builds kept the next occurrence on the completed
       * row; revive it once so those chains continue under the current rule,
       * which writes the next occurrence as its own row when the task is
       * ticked. New data never sets nextDue.
       */
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
