/**
 * The shelf: a folder the island can drop files into.
 *
 * Files are copied, not moved — the shelf is a holding area, not a place to
 * lose things. Names are kept; a duplicate gets " (1)" instead of overwriting.
 */
const fs = require('node:fs');
const path = require('node:path');
const { shell } = require('electron');
const { userDir } = require('../paths');

const listeners = new Set();

const dir = () => path.join(userDir(), 'shelf');

function ensure() {
  try {
    fs.mkdirSync(dir(), { recursive: true });
  } catch {
    // A read-only profile means no shelf; list() will be empty.
  }
}

function list() {
  ensure();
  try {
    return fs
      .readdirSync(dir())
      .map((name) => {
        const full = path.join(dir(), name);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) return null;
        return { name, size: stat.size, mtime: stat.mtimeMs };
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
    emit();
    return true;
  } catch {
    return false;
  }
}

function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

module.exports = { list, add, addBuffer, open, reveal, remove, onChange, dir };
