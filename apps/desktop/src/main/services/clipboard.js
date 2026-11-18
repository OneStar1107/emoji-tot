/**
 * Clipboard history: the last few things copied, kept on this machine.
 *
 * Windows lets an app mark clipboard content as "do not monitor" — that is what
 * password managers set. Electron does not expose that clipboard format, so the
 * guard here is narrower and honest about it: empty payloads and very large
 * ones are skipped, and the list is capped so a copy storm cannot grow the file
 * without bound. Anything richer needs a native reader we do not ship.
 */
const { clipboard } = require('electron');
const path = require('node:path');
const { userDir, readJson, writeJson } = require('../paths');

const MAX_ITEMS = 60;
const MAX_LENGTH = 8000;
const KEEP_DAYS = 7;

let items = [];
let timer = null;
let last = '';
const listeners = new Set();

const file = () => path.join(userDir(), 'clipboard.json');

function load() {
  const raw = readJson(file(), []);
  items = Array.isArray(raw) ? raw.filter((item) => item && typeof item.text === 'string') : [];
  last = '';
}

function save() {
  writeJson(file(), items);
}

function emit() {
  for (const fn of listeners) fn(list());
}

function list() {
  return items.map(({ id, text, at, pinned }) => ({ id, text, at, pinned: Boolean(pinned) }));
}

function poll() {
  let text = '';
  try {
    text = clipboard.readText() || '';
  } catch {
    return;
  }
  if (!text || text === last) return;
  last = text;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_LENGTH) return;
  const existing = items.find((item) => item.text === trimmed);
  if (existing) {
    existing.at = Date.now();
  } else {
    items.unshift({ id: 'c' + Date.now().toString(36) + items.length, text: trimmed, at: Date.now(), pinned: false });
  }
  prune();
  save();
  emit();
}

function prune() {
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  items = items
    .filter((item) => item.pinned || item.at >= cutoff)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at - a.at)
    .slice(0, MAX_ITEMS);
}

function copy(id) {
  const found = items.find((item) => item.id === id);
  if (!found) return false;
  try {
    clipboard.writeText(found.text);
    last = found.text;
  } catch {
    return false;
  }
  found.at = Date.now();
  save();
  emit();
  return true;
}

function togglePin(id) {
  const found = items.find((item) => item.id === id);
  if (!found) return;
  found.pinned = !found.pinned;
  prune();
  save();
  emit();
}

function remove(id) {
  items = items.filter((item) => item.id !== id);
  save();
  emit();
}

function clear() {
  items = [];
  save();
  emit();
}

function start() {
  load();
  try {
    last = clipboard.readText() || '';
  } catch {
    last = '';
  }
  timer = setInterval(poll, 900);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

function onChange(fn) {
  listeners.add(fn);
}

module.exports = { start, stop, list, copy, togglePin, remove, clear, onChange };
