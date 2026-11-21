/**
 * The shelf: a folder the island can drop files into.
 *
 * Files are copied, not moved — the shelf is a holding area, not a place to
 * lose things. Names are kept; a duplicate gets " (1)" instead of overwriting.
 */
const fs = require('node:fs');
const path = require('node:path');
const { shell } = require('electron');
const { userDir, readPrefs, readJson, writeJson } = require('../paths');

const listeners = new Set();

/**
 * How many named groups a file can be sorted into. Group 0 is "未分组", the
 * state every file starts in; the index is what the page draws on the chip.
 */
const GROUPS = 4;

/**
 * File name → group, kept beside prefs rather than inside them.
 *
 * This is data about the shelf's contents, not a setting: the map is written
 * by moving a file on the island and pruned when the file is deleted, and it
 * would be noise in the settings audit. A missing or unreadable file simply
 * means every file is back in 未分组.
 */
const groupsFile = () => path.join(userDir(), 'shelf-groups.json');

function readGroups() {
  const raw = readJson(groupsFile(), null);
  const map = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return map;
  for (const [name, value] of Object.entries(raw)) {
    const group = Number(value);
    if (!name || name.length > 255) continue;
    if (!Number.isInteger(group) || group < 1 || group > GROUPS) continue;
    map[name] = group;
  }
  return map;
}

function writeGroups(map) {
  writeJson(groupsFile(), map);
}

/**
 * Where the shelf keeps its files.
 *
 * `shelf.dir` was a setting with no reader: the folder was hard-coded, so
 * whatever the user typed changed nothing. A relative path is resolved inside
 * the app's data directory rather than the process cwd — the cwd of a packaged
 * app is wherever the launcher happened to be.
 */
const dir = () => {
  const custom = readPrefs().shelf?.dir;
  if (typeof custom === 'string' && custom.trim()) {
    const value = custom.trim();
    return path.isAbsolute(value) ? value : path.join(userDir(), value);
  }
  return path.join(userDir(), 'shelf');
};

function ensure() {
  try {
    fs.mkdirSync(dir(), { recursive: true });
  } catch {
    // A read-only profile means no shelf; list() will be empty.
  }
}

function list() {
  ensure();
  const groups = readGroups();
  try {
    return fs
      .readdirSync(dir())
      .map((name) => {
        const full = path.join(dir(), name);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) return null;
        return { name, size: stat.size, mtime: stat.mtimeMs, group: groups[name] ?? 0 };
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
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

function add(paths) {
  ensure();
  const saved = [];
  for (const source of Array.isArray(paths) ? paths : []) {
    try {
      const base = path.basename(String(source));
      if (!base) continue;
      const ext = path.extname(base);
      const stem = path.basename(base, ext);
      let target = path.join(dir(), base);
      let index = 1;
      while (fs.existsSync(target)) target = path.join(dir(), `${stem} (${index++})${ext}`);
      fs.copyFileSync(source, target);
      saved.push(path.basename(target));
    } catch {
      // One unreadable file must not abort the rest of the drop.
    }
  }
  emit();
  return saved;
}

/**
 * Store a dropped file that arrived as bytes rather than a path.
 *
 * Some drops (virtual files, files from inside a sandboxed app) have content
 * but no filesystem path. The renderer sends the bytes for anything under its
 * 20 MB ceiling; larger files without a path are refused rather than silently
 * dropped, and the island still shows the old list.
 */
function addBuffer(name, bytes) {
  ensure();
  try {
    const base = path.basename(String(name || 'file'));
    if (!base) return [];
    const ext = path.extname(base);
    const stem = path.basename(base, ext);
    let target = path.join(dir(), base);
    let index = 1;
    while (fs.existsSync(target)) target = path.join(dir(), `${stem} (${index++})${ext}`);
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
    if (!buffer.length) return [];
    fs.writeFileSync(target, buffer);
    emit();
    return [path.basename(target)];
  } catch {
    return [];
  }
}

/** Resolve a shelf name to its absolute path, refusing anything with a path in it. */
function resolve(name) {
  const base = path.basename(String(name));
  const full = path.join(dir(), base);
  return fs.existsSync(full) ? full : null;
}

async function open(name) {
  const full = resolve(name);
  if (!full) return false;
  const error = await shell.openPath(full);
  return !error;
}

function reveal(name) {
  const full = resolve(name);
  if (full) shell.showItemInFolder(full);
  return Boolean(full);
}

function remove(name) {
  const full = resolve(name);
  if (!full) return false;
  try {
    fs.rmSync(full);
    /* A deleted file must not leave a group waiting for the next file that
       happens to reuse its name. */
    const base = path.basename(String(name));
    const groups = readGroups();
    if (groups[base]) {
      delete groups[base];
      writeGroups(groups);
    }
    emit();
    return true;
  } catch {
    return false;
  }
}

/**
 * Move a file into a group (0 = 未分组).
 *
 * Only a name that resolves inside the shelf is accepted — the chip is drawn
 * from the list, so a failure here means the file went away between the paint
 * and the click. The write happens before the emit so the list that ships with
 * the change already carries the new group.
 */
function setGroup(name, group) {
  const full = resolve(name);
  const index = Number(group);
  if (!full || !Number.isInteger(index) || index < 0 || index > GROUPS) return false;
  const base = path.basename(String(name));
  const groups = readGroups();
  if (index === 0) delete groups[base];
  else groups[base] = index;
  writeGroups(groups);
  emit();
  return true;
}

function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

module.exports = { list, add, addBuffer, open, reveal, remove, setGroup, onChange, dir, GROUPS };
