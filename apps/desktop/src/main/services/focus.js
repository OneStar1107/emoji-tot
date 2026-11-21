/**
 * One pomodoro, owned by the main process.
 *
 * Time is stored as an end timestamp, not a counter: the window can be closed,
 * the machine can sleep, and reopening the island still shows the truth. The
 * visible countdown is derived from `endsAt`, so there is nothing to drift.
 */
const { cachePath, readJson, writeJson, readPrefs } = require('../paths');
const { notify: pushNotify } = require('./notify');

const EMPTY = { phase: 'idle', running: false, remaining: 0, total: 0, cycles: 0, endsAt: 0, history: [] };
/**
 * Every fourth finished pomodoro is followed by a long rest. The count is the
 * lifetime `cycles` figure the page already shows, so the rule survives a
 * restart instead of resetting when the app reopens.
 */
const LONG_REST_EVERY = 4;
const LONG_REST_MINUTES = 15;
/** Two weeks of finished pomodoros: enough for "this week", small enough to keep. */
const HISTORY_DAYS = 14;
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
    enabled: focus.enabled === true,
  };
}

function notify(title, body) {
  pushNotify(title, body);
}

/** Midnight at the start of the day that contains `at`, in local time. */
function startOfDay(at) {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}
/** Monday 00:00 of the week that contains `at`: the page reports a Monday week. */
function startOfWeek(at) {
  const day = new Date(startOfDay(at));
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day.getTime();
}
function summary(since) {
  let count = 0;
  let minutes = 0;
  for (const entry of Array.isArray(state.history) ? state.history : []) {
    if (!entry || Number(entry.at) < since) continue;
    count += 1;
    minutes += Math.max(0, Number(entry.minutes) || 0);
  }
  return { count, minutes };
}
/** Today and this week: the two rows the focus page prints. */
function stats() {
  const now = Date.now();
  return { today: summary(startOfDay(now)), week: summary(startOfWeek(now)) };
}
/** Remember one finished pomodoro, dropping records older than the window. */
function record(minutes) {
  const now = Date.now();
  const keepFrom = startOfDay(now) - (HISTORY_DAYS - 1) * 86400000;
  const kept = (Array.isArray(state.history) ? state.history : []).filter(
    (entry) => entry && Number(entry.at) >= keepFrom,
  );
  state.history = [...kept, { at: now, minutes: Math.max(1, Math.round(minutes)) }];
}
/** Minutes of rest after the next finished pomodoro: every fourth one is long. */
function restMinutes() {
  const { rest } = prefs();
  return state.cycles > 0 && state.cycles % LONG_REST_EVERY === 0 ? LONG_REST_MINUTES : rest;
}

function remaining() {
  if (state.phase === 'idle') return 0;
  if (state.running) return Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
  return Math.max(0, Math.round(state.remaining));
}

function snapshot() {
  const longRest = state.cycles > 0 && state.cycles % LONG_REST_EVERY === 0;
  return {
    phase: state.phase,
    running: state.running,
    remaining: remaining(),
    total: state.total,
    cycles: state.cycles,
    /* What the rest after this phase will be: 15 minutes on every fourth. */
    restMinutes: longRest ? LONG_REST_MINUTES : prefs().rest,
    longRest,
    stats: stats(),
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
    /* The phase that just ended was this many minutes long; the settings may
       have changed since it started. */
    record(state.total / 60);
    const rest = restMinutes();
    const long = rest === LONG_REST_MINUTES;
    notify('专注完成', long ? `长休息 ${rest} 分钟，起来走两步。` : `休息 ${rest} 分钟，起来走两步。`);
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
  const { work, enabled } = prefs();
  if (!enabled) return false;
  if (state.phase === 'rest') return;
  startPhase('work', work);
  return true;
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
  if (state.phase === 'work') {
    startPhase('rest', restMinutes());
    return true;
  }
  stop();
  return true;
}

/** Reset the clock. Finished pomodoros are a record, not clock state: keep them. */
function restart() {
  state = { ...EMPTY, history: Array.isArray(state.history) ? state.history : [] };
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
