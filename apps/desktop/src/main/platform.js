/**
 * What this machine can actually do, and the one way to ask it.
 *
 * Eight services reach outside the app — battery, media, devices, messenger,
 * fullscreen, weather, lyrics, quota, calendar — and every one of them used to
 * call `execFile('powershell.exe', …)` itself. That made "does this platform
 * support the feature" a question nobody could answer in one place, and it
 * meant each service had to remember windowsHide, timeouts and the fact that a
 * failed spawn emits 'error' whether or not anyone listens.
 *
 * The app ships for Windows. macOS support was a promise the code never kept:
 * only battery had a pmset branch, everything else was PowerShell. Rather than
 * half-support two platforms, this module states the truth — the features
 * table below is what the UI reads — so a non-Windows build degrades to "this
 * feature is unavailable here" instead of a service that silently never starts.
 */
const { execFile, spawn } = require('node:child_process');

const PLATFORM = process.platform;

/**
 * Feature → supported here.
 *
 * A missing entry means unsupported. `windowsOnly` is the short version:
 * every runtime feature of this app is Windows-only today, and saying so is
 * the point of the table.
 */
const FEATURES = {
  win32: {
    battery: true,
    media: true,
    devices: true,
    messenger: true,
    fullscreen: true,
    weather: true,
    lyrics: true,
    quota: true,
    calendar: true,
    clipboard: true,
    volume: true,
  },
  darwin: {
    // Battery has a real pmset reader; nothing else does.
    battery: true,
  },
  linux: {},
};

const features = FEATURES[PLATFORM] ?? {};

/** Is this feature usable on the current platform? */
function supports(feature) {
  return features[feature] === true;
}

/** Every feature this build knows about, with its availability. */
function capabilities() {
  const names = new Set(Object.keys(FEATURES.win32));
  for (const table of Object.values(FEATURES)) {
    for (const name of Object.keys(table)) names.add(name);
  }
  return Object.fromEntries([...names].sort().map((name) => [name, supports(name)]));
}

/** The command a service should run, or null when the platform has none. */
function command() {
  return PLATFORM === 'win32' ? 'powershell.exe' : null;
}

/**
 * Run one PowerShell command and settle exactly once.
 *
 * Errors, timeouts and a missing binary all come back as `{ ok: false }`
 * rather than a thrown exception: a weather refresh that fails is a stale
 * reading, not a crash. The callback form of execFile already handles spawn
 * failures, but an unhandled 'error' event on the child would still take the
 * process down, so it is attached here as well.
 */
function runPowerShell(args, options = {}) {
  const { timeout = 15000, maxBuffer = 4 * 1024 * 1024, env } = options;
  return new Promise((resolve) => {
    const exe = command();
    if (!exe) {
      resolve({ ok: false, code: 'unsupported', stdout: '', error: 'no shell on this platform' });
      return;
    }
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    let child;
    try {
      const execOptions = { windowsHide: true, timeout, maxBuffer };
      if (env) execOptions.env = env;
      child = execFile(exe, args, execOptions, (error, stdout, stderr) => {
        const out = String(stdout ?? '');
        if (error) {
          done({
            ok: false,
            code: error.killed ? 'timeout' : 'error',
            stdout: out,
            error: String(error.message ?? error),
            stderr: String(stderr ?? ''),
          });
          return;
        }
        done({ ok: true, code: 'ok', stdout: out, error: '', stderr: String(stderr ?? '') });
      });
    } catch (error) {
      done({ ok: false, code: 'error', stdout: '', error: String(error?.message ?? error) });
      return;
    }
    // Belt and braces: execFile's callback fires for spawn errors, but the
    // 'error' event is still emitted and would be unhandled without this.
    child.on('error', () => {});
  });
}

/**
 * Start a long-lived PowerShell process (a watcher).
 *
 * Returns null when the platform has no shell, so callers can skip without
 * branching. The returned child already has an 'error' listener attached; a
 * watcher that cannot start is logged once and left alone, because a retry
 * loop against a missing binary is worse than a feature that is simply off.
 */
/*
 * Every long-lived child is remembered, so nothing outlives the app.
 *
 * A watcher is a PowerShell process with a console of its own; when the app is
 * killed hard (taskkill /F during an install, a crash) Windows leaves those
 * children behind. They are invisible, keep polling, and — measured on this
 * machine — piled up to 32 of them under one instance after a day of restarts.
 * Killing the remembered set on quit is the cheap half of the fix; the other
 * half is services calling stop() before start(), which they already do.
 */
const watchers = new Set();

function trackWatcher(child) {
  watchers.add(child);
  child.once('exit', () => watchers.delete(child));
  return child;
}

function killWatchers() {
  for (const child of watchers) {
    try {
      child.kill();
    } catch {
      // already gone
    }
  }
  watchers.clear();
}

function spawnPowerShell(args, options = {}) {
  const exe = command();
  if (!exe) return null;
  const { onError, ...spawnOptions } = options;
  let child;
  try {
    child = spawn(exe, args, { windowsHide: true, ...spawnOptions });
  } catch (error) {
    onError?.(error);
    return null;
  }
  child.on('error', (error) => {
    onError?.(error);
  });
  return trackWatcher(child);
}

/**
 * Kill a watcher after it stops behaving, and clean up the timer on exit.
 *
 * A PowerShell watcher that hangs holds a process handle forever; without a
 * watchdog a broken script is indistinguishable from an idle one.
 */
function guardChild(child, ms, onTimeout) {
  if (!child) return () => {};
  const timer = setTimeout(() => {
    try {
      child.kill();
    } catch {
      // already gone
    }
    onTimeout?.();
  }, ms);
  timer.unref?.();
  const clear = () => clearTimeout(timer);
  child.once('exit', clear);
  child.once('close', clear);
  return clear;
}

module.exports = {
  killWatchers,
  id: PLATFORM,
  isWindows: PLATFORM === 'win32',
  windowsOnly: PLATFORM !== 'win32' ? false : true,
  /** False on every non-Windows platform: the app is a Windows product. */
  supported: PLATFORM === 'win32',
  supports,
  capabilities,
  command,
  runPowerShell,
  spawnPowerShell,
  guardChild,
};
