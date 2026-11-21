/**
 * The Windows master volume, as the system itself reports it.
 *
 * The island has no Node-accessible volume API, so a small PowerShell child
 * owns the CoreAudio endpoint. A read opens the panel, but a drag cannot pay a
 * process spawn per step: after the first call the child stays alive in
 * -Watch mode, the compiled C# class stays loaded, and one line on stdin is
 * one 10ms volume change. Requests are serialised because the child answers
 * one line at a time, and consecutive drags collapse into the latest value so
 * the slider never queues up stale steps behind the network.
 *
 * Everything returns the same shape, success or not: { ok, volume, muted,
 * error }. A failed read is a state the UI can draw ("系统音量不可用"), not an
 * exception the renderer has to catch.
 */
const platform = require('../platform');
const { scriptFile } = require('../paths');

const SCRIPT = scriptFile('volume.ps1');
const TIMEOUT_MS = 5000;

const failure = (error) => ({ ok: false, volume: null, muted: false, error: String(error || 'volume unavailable') });

/** Turn one JSON line from the child into the shared state shape. */
function parseLine(line) {
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  if (value.ok !== true) return failure(value.error);
  const volume = Number(value.volume);
  if (!Number.isFinite(volume)) return failure('volume missing from reply');
  return {
    ok: true,
    volume: Math.max(0, Math.min(100, Math.round(volume))),
    muted: value.muted === true,
    error: '',
  };
}

let child = null;
let buffer = '';
/** The request whose answer we are waiting for. */
let current = null;
/** Requests already written off the queue but not yet sent. */
const queue = [];

function ensureChild() {
  if (child) return child;
  if (!platform.supports('volume')) return null;
  child = platform.spawnPowerShell(
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Watch'],
    { stdio: ['pipe', 'pipe', 'ignore'] },
  );
  const spawned = child;
  if (!spawned) return null;
  buffer = '';
  spawned.stdout.setEncoding('utf8');
  spawned.stdout.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) handleLine(line.trim());
  });
  const gone = () => {
    // An old child exiting after a reset must not detach the replacement.
    if (child !== spawned) return;
    child = null;
    finish(failure('volume process exited'));
    pump();
  };
  spawned.on('exit', gone);
  spawned.on('error', gone);
  return spawned;
}

function settle(request, state) {
  clearTimeout(request.timer);
  const waiters = request.waiters ?? [request.resolve];
  for (const resolve of waiters) resolve(state);
}

function finish(state) {
  if (!current) return;
  settle(current, state);
  current = null;
}

function handleLine(line) {
  if (!line || line[0] !== '{') return;
  const state = parseLine(line);
  if (!state) return;
  finish(state);
  pump();
}

function failAll(error) {
  if (current) {
    settle(current, failure(error));
    current = null;
  }
  while (queue.length) settle(queue.shift(), failure(error));
}

function pump() {
  if (current || !queue.length) return;
  const running = ensureChild();
  if (!running) {
    failAll('volume unavailable on this platform');
    return;
  }
  current = queue.shift();
  current.timer = setTimeout(() => {
    if (!current) return;
    settle(current, failure('volume request timed out'));
    current = null;
    // A child that stopped answering cannot be trusted with the next command.
    resetChild();
    pump();
  }, TIMEOUT_MS);
  try {
    running.stdin.write(current.line + '\n');
  } catch (error) {
    finish(failure(String(error?.message ?? error)));
    resetChild();
    pump();
  }
}

function resetChild() {
  const dying = child;
  child = null;
  if (!dying) return;
  try {
    dying.stdin.end();
  } catch {
    // The pipe is already gone.
  }
  try {
    dying.kill();
  } catch {
    // Already exited.
  }
}

/**
 * Send one command. A second set() that arrives before the first has even
 * been written replaces it instead of queueing another hop: the system only
 * needs the value the finger is on now.
 */
function enqueue(line, coalesce) {
  return new Promise((resolve) => {
    const tail = queue[queue.length - 1];
    if (coalesce && tail && tail.coalesce === coalesce) {
      tail.line = line;
      tail.waiters.push(resolve);
      return;
    }
    queue.push({ line, coalesce, waiters: [resolve] });
    pump();
  });
}

function get() {
  return enqueue('get');
}

function set(value) {
  const level = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return enqueue('set ' + level, 'set');
}

function mute(value) {
  return enqueue('mute ' + (value ? 1 : 0), 'mute');
}

/** Closing the app must not leave a PowerShell child behind. */
function stop() {
  failAll('volume stopped');
  resetChild();
}

module.exports = { get, set, mute, stop };
