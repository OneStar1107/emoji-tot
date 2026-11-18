/**
 * Where the app keeps its files, and the one way to read them.
 *
 * Three windows and every service share these paths, so they live alone in a
 * module instead of being copied next to each window. A read-only profile must
 * never crash the pet, so writes swallow their errors and reads fall back.
 */
const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');

const userDir = () => app.getPath('userData');
const prefsPath = () => path.join(userDir(), 'prefs.json');
const statePath = () => path.join(userDir(), 'state.json');
const cachePath = (name) => path.join(userDir(), `cache-${name}.json`);

/**
 * Absolute path to one of the PowerShell scripts next to the services.
 *
 * PowerShell cannot open a file inside app.asar — only Electron's own fs shim
 * understands that archive — so the packaged build writes the scripts to
 * app.asar.unpacked (see asarUnpack in the app package.json). __dirname still
 * points into the archive at runtime, so the path is redirected here rather
 * than at seven call sites. In development nothing is unpacked and the plain
 * path is already correct.
 */
function scriptFile(name) {
  const inside = path.join(__dirname, 'services', name);
  return inside.includes(`app.asar${path.sep}`) ? inside.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`) : inside;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
  } catch {
    // A read-only profile is not worth crashing the app over.
  }
}

/** Preferences are a single flat object; every window reads the same file. */
function readPrefs() {
  const raw = readJson(prefsPath(), {});
  return raw && typeof raw === 'object' ? raw : {};
}

/** Merge a patch into prefs and return the whole object. */
function writePrefs(patch) {
  const next = { ...readPrefs(), ...patch };
  writeJson(prefsPath(), next);
  return next;
}

module.exports = { userDir, prefsPath, statePath, cachePath, scriptFile, readJson, writeJson, readPrefs, writePrefs };
