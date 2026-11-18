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

let writeSequence = 0;

function writeJson(file, value) {
  const temp = `${file}.${process.pid}.${Date.now()}.${writeSequence++}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const text = JSON.stringify(value, null, 2);
    const fd = fs.openSync(temp, 'w');
    try {
      fs.writeFileSync(fd, text, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, file);
  } catch {
    try {
      fs.unlinkSync(temp);
    } catch {
      // The temporary file may never have been created.
    }
    // A read-only profile is not worth crashing the app over, and the previous
    // target file remains intact when rename fails.
  }
}

/**
 * The settings schema, injected once at boot.
 *
 * It lives in src/shared/schema.js, an ES module, so the main process loads it
 * with a dynamic import after app.whenReady(); until then readPrefs() falls
 * back to the raw file, which is what every caller saw before the schema
 * existed. Keeping the fallback means a broken import degrades to the old
 * behaviour instead of emptying every setting.
 */
let settingsSchema = null;

function configureSettingsSchema(value) {
  settingsSchema = value ?? null;
}

/** The file exactly as stored, defaults not applied. */
function readStoredPrefs() {
  const raw = readJson(prefsPath(), {});
  return raw && typeof raw === 'object' ? raw : {};
}

/** Preferences with every default filled in — never a bare {}. */
function readPrefs() {
  const stored = readStoredPrefs();
  return settingsSchema ? settingsSchema.withDefaults(stored) : stored;
}

/**
 * Merge a patch into prefs and return the whole object.
 *
 * Unknown keys are dropped rather than written: a control whose key drifted
 * from the schema used to leave a dead entry in prefs.json that nothing read
 * and nothing could reset.
 */
function writePrefs(patch) {
  const base = readStoredPrefs();
  const accepted =
    settingsSchema && patch && typeof patch === 'object'
      ? settingsSchema.filterPatch(patch).accepted
      : patch ?? {};
  const next = { ...base, ...accepted };
  writeJson(prefsPath(), next);
  return settingsSchema ? settingsSchema.withDefaults(next) : next;
}

module.exports = { userDir, prefsPath, statePath, cachePath, scriptFile, readJson, writeJson, readPrefs, readStoredPrefs, writePrefs, configureSettingsSchema };
