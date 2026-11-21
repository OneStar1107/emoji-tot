/**
 * Water and posture reminders.
 *
 * Both are "time since last acknowledged", not schedules: the reminder fires
 * when the interval has elapsed, and acknowledging resets it. Reminders repeat
 * on a slower cadence so a missed toast does not become a notification storm.
 *
 * The two counters belong to a local date: a drink at 23:59 and one at 00:01
 * are on different days, so "today" starts at zero by itself at midnight. A
 * week of day buckets is kept in the same file, which is what lets the page
 * draw a trend without a second store.
 */
const { cachePath, readJson, writeJson, readPrefs } = require('../paths');
const { notify: pushNotify } = require('./notify');

const REPEAT_MS = 10 * 60 * 1000;
/** How many local days are kept: today plus the six before it. */
const KEEP_DAYS = 7;

/** The local calendar day, YYYY-MM-DD. Local, because midnight is local. */
function dayKey(at) {
  const date = new Date(at);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Midnight of the day `back` days before `now`, so no hour can skip a date. */
function dayBack(now, back) {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - back);
}

const emptyDay = () => ({ water: 0, stand: 0 });

let state = {
  lastWater: Date.now(),
  lastStand: Date.now(),
  waterAt: 0,
  standAt: 0,
  /** The day the two counters below live on; every read rolls it forward. */
  day: dayKey(Date.now()),
  /** One bucket per local day, today included. */
  days: {},
};
let timer = null;
const listeners = new Set();

function load() {
  const saved = readJson(cachePath('health'), null);
  if (!saved || typeof saved !== 'object') return;
  state = { ...state, ...saved };
  if (!state.days || typeof state.days !== 'object') {
    /* An older file carries two flat counts and no day. Each one belongs to
       the day its own timestamp was written, which is the only date the file
       still remembers; crediting them all to today would invent a number. */
    state.days = {};
    const park = (at, field, count) => {
      const key = dayKey(Number(at) || Date.now());
      const bucket = state.days[key] ?? (state.days[key] = emptyDay());
      bucket[field] += Math.max(0, Math.floor(Number(count) || 0));
    };
    park(state.lastWater, 'water', state.waterCount);
    park(state.lastStand, 'stand', state.standCount);
  }
  delete state.waterCount;
  delete state.standCount;
  prune(Date.now());
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
  pushNotify(title, body);
}

/** Today's bucket, created the first time the day is asked about. */
function dayFor(key) {
  return state.days[key] ?? (state.days[key] = emptyDay());
}

/**
 * Forget buckets older than the week the page draws.
 *
 * Without this the file would keep one entry per day forever. A bucket that is
 * not drawn is a bucket nobody can miss.
 */
function prune(now) {
  const keep = new Set();
  for (let back = 0; back < KEEP_DAYS; back += 1) keep.add(dayKey(dayBack(now, back).getTime()));
  for (const key of Object.keys(state.days)) if (!keep.has(key)) delete state.days[key];
}

/**
 * Move the counters onto today's date.
 *
 * Runs at the top of snapshot(), so a page opened at 00:01, a reminder at
 * 08:00 and a click from the island all read the same fresh day: no timer has
 * to fire at midnight and the app does not have to be restarted. The write is
 * skipped unless the date actually changed.
 */
function roll(now) {
  const key = dayKey(now);
  if (state.day === key) return;
  state.day = key;
  prune(now);
  save();
}

/**
 * Seven local days, oldest first, today last.
 *
 * A day with no bucket is a zero rather than a gap: a missing column would
 * read as "no data", and the point of the strip is to show the quiet days too.
 */
function trend(now) {
  const out = [];
  for (let back = KEEP_DAYS - 1; back >= 0; back -= 1) {
    const key = dayKey(dayBack(now, back).getTime());
    const bucket = state.days[key] ?? emptyDay();
    out.push({ key, water: bucket.water || 0, stand: bucket.stand || 0, today: back === 0 });
  }
  return out;
}

function snapshot() {
  const config = prefs();
  const now = Date.now();
  roll(now);
  const today = dayFor(state.day);
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
    waterCount: today.water,
    standCount: today.stand,
    /** Today plus the six days before it, oldest first. */
    trend: trend(now),
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
  const now = Date.now();
  roll(now);
  const today = dayFor(state.day);
  state.lastWater = now;
  state.waterAt = 0;
  today.water += 1;
  save();
  emit();
}

function stand() {
  const now = Date.now();
  roll(now);
  const today = dayFor(state.day);
  state.lastStand = now;
  state.standAt = 0;
  today.stand += 1;
  save();
  emit();
}

/**
 * The way back out of a counter.
 *
 * The two "clear" buttons sit next to their own card and must not touch the
 * other one: clearing the water count is not a reason to tell someone they
 * just stood up. reset() both-at-once stays for tests and for a future
 * "reset everything" action.
 *
 * Only today is cleared: the earlier days are a record of what happened, not a
 * scratchpad, and the week would be a lie if one clear emptied all of it.
 */
function resetWater() {
  const now = Date.now();
  roll(now);
  dayFor(state.day).water = 0;
  state.lastWater = now;
  state.waterAt = 0;
  save();
  emit();
}

function resetStand() {
  const now = Date.now();
  roll(now);
  dayFor(state.day).stand = 0;
  state.lastStand = now;
  state.standAt = 0;
  save();
  emit();
}

/** Both counters, deliberately — used by tests and by a full reset. */
function reset() {
  resetWater();
  resetStand();
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

module.exports = { startService, stopService, onChange, snapshot, drink, stand, reset, resetWater, resetStand };
