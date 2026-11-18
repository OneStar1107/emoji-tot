/**
 * One pomodoro, owned by the main process.
 *
 * Time is stored as an end timestamp, not a counter: the window can be closed,
 * the machine can sleep, and reopening the island still shows the truth. The
 * visible countdown is derived from `endsAt`, so there is nothing to drift.
 */
const { cachePath, readJson, writeJson, readPrefs } = require('../paths');
const { notify: pushNotify } = require('./notify');

const EMPTY = { phase: 'idle', running: false, remaining: 0, total: 0, cycles: 0, endsAt: 0 };
let state = { ...EMPTY };
let timer = null;
const listeners = new Set();

function load() {
  const saved = readJson(cachePath('focus'), null);
  if (saved && typeof saved === 'object' && saved.phase) {
    state = { ...EMPTY, ...saved };
  }
}

function save() {
  writeJson(cachePath('focus'), state);
}

function prefs() {
  const all = readPrefs();
  const focus = all.focus ?? {};
  return {
    work: Math.max(1, Number(focus.work) || 25),
    rest: Math.max(1, Number(focus.rest) || 5),
    enabled: focus.enabled !== false,
  };
}

function notify(title, body) {
  pushNotify(title, body);
}

function remaining() {
  if (state.phase === 'idle') return 0;
  if (state.running) return Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
  return Math.max(0, Math.round(state.remaining));
}

function snapshot() {
  return {
    phase: state.phase,
    running: state.running,
    remaining: remaining(),
    total: state.total,
    cycles: state.cycles,
  };
}

function emit() {
  const value = snapshot();
  for (const fn of listeners) {
    try {
      fn(value);
    } catch {
      // A listener that throws must not stop the clock.
    }
  }
}

function startPhase(phase, minutes) {
  state.phase = phase;
  state.running = true;
  state.total = minutes * 60;
  state.endsAt = Date.now() + minutes * 60 * 1000;
  state.remaining = state.total;
  save();
  emit();
}

function finish() {
  if (state.phase === 'work') {
    state.cycles += 1;
    const rest = prefs().rest;
    notify('专注完成', `休息 ${rest} 分钟，起来走两步。`);
    startPhase('rest', rest);
    return;
  }
  if (state.phase === 'rest') {
    notify('休息结束', '下一轮专注随时可以开始。');
    state = { ...state, phase: 'idle', running: false, remaining: 0, total: 0, endsAt: 0 };
    save();
    emit();
  }
}

function tick() {
  if (state.phase === 'idle') return;
  if (state.running && remaining() <= 0) finish();
  else emit();
}

function start() {
  const { work } = prefs();
  if (state.phase === 'rest') return;
  startPhase('work', work);
}

function pause() {
  if (state.phase === 'idle' || !state.running) return;
  state.remaining = remaining();
  state.running = false;
  state.endsAt = 0;
  save();
  emit();
}

function resume() {
  if (state.phase === 'idle' || state.running) return;
  state.running = true;
  state.endsAt = Date.now() + state.remaining * 1000;
  save();
  emit();
}

function stop() {
  state = { ...state, phase: 'idle', running: false, remaining: 0, total: 0, endsAt: 0 };
  save();
  emit();
}

/** Jump to the next phase: used by "skip" on the island. */
function skip() {
  if (state.phase === 'idle') return start();
  if (state.phase === 'work') return finish();
  stop();
}

function restart() {
  state = { ...EMPTY };
  save();
  emit();
}

function startService() {
  load();
  // A phase that finished while the app was closed is completed once, then
  // the clock returns to idle rather than crediting a session nobody saw.
  if (state.phase !== 'idle' && state.running && remaining() <= 0) {
    state = { ...state, phase: 'idle', running: false, remaining: 0, total: 0, endsAt: 0 };
    save();
  }
  clearInterval(timer);
  timer = setInterval(tick, 1000);
}

function stopService() {
  clearInterval(timer);
  timer = null;
}

function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

module.exports = { startService, stopService, onChange, snapshot, start, pause, resume, stop, skip, restart };
