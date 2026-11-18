/**
 * Water and posture reminders.
 *
 * Both are "time since last acknowledged", not schedules: the reminder fires
 * when the interval has elapsed, and acknowledging resets it. Reminders repeat
 * on a slower cadence so a missed toast does not become a notification storm.
 */
const { Notification } = require('electron');
const { cachePath, readJson, writeJson, readPrefs } = require('../paths');

const REPEAT_MS = 10 * 60 * 1000;
let state = {
  lastWater: Date.now(),
  lastStand: Date.now(),
  waterAt: 0,
  standAt: 0,
  waterCount: 0,
  standCount: 0,
};
let timer = null;
const listeners = new Set();

function load() {
  const saved = readJson(cachePath('health'), null);
  if (saved && typeof saved === 'object') state = { ...state, ...saved };
}

function save() {
  writeJson(cachePath('health'), state);
}

function prefs() {
  const all = readPrefs();
  const health = all.health ?? {};
  return {
    enabled: health.enabled === true,
    waterMin: Math.max(5, Number(health.waterMin) || 45),
    standMin: Math.max(10, Number(health.standMin) || 60),
  };
}

function notify(title, body) {
  try {
    new Notification({ title, body }).show();
  } catch {
    // best effort
  }
}

function snapshot() {
  const config = prefs();
  const now = Date.now();
  const waterDue = state.lastWater + config.waterMin * 60000;
  const standDue = state.lastStand + config.standMin * 60000;
  return {
    enabled: config.enabled,
    waterMin: config.waterMin,
    standMin: config.standMin,
    sinceWater: Math.floor((now - state.lastWater) / 60000),
    sinceStand: Math.floor((now - state.lastStand) / 60000),
    waterDue: now >= waterDue,
    standDue: now >= standDue,
    waterCount: state.waterCount,
    standCount: state.standCount,
  };
}

function emit() {
  const value = snapshot();
  for (const fn of listeners) {
    try {
      fn(value);
    } catch {
      // ignore
    }
  }
}

function check() {
  const config = prefs();
  if (!config.enabled) return;
  const now = Date.now();
  if (now >= state.lastWater + config.waterMin * 60000 && now - state.waterAt > REPEAT_MS) {
    state.waterAt = now;
    save();
    notify('该喝水了', `距离上次喝水已经 ${config.waterMin} 分钟。`);
  }
  if (now >= state.lastStand + config.standMin * 60000 && now - state.standAt > REPEAT_MS) {
    state.standAt = now;
    save();
    notify('起来动一动', `已经坐了 ${config.standMin} 分钟。`);
  }
  emit();
}

function drink() {
  state.lastWater = Date.now();
  state.waterAt = 0;
  state.waterCount += 1;
  save();
  emit();
}

function stand() {
  state.lastStand = Date.now();
  state.standAt = 0;
  state.standCount += 1;
  save();
  emit();
}

function startService() {
  load();
  clearInterval(timer);
  timer = setInterval(check, 30000);
  check();
}

function stopService() {
  clearInterval(timer);
  timer = null;
}

function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

module.exports = { startService, stopService, onChange, snapshot, drink, stand };
