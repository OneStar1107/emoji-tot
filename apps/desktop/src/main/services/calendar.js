/**
 * Calendar: local events plus invitations parsed out of mail.
 *
 * Month view and reminders are local; the only remote part is an .ics that a
 * mail body carries, and that is parsed here rather than trusted whole.
 * Date parsing handles the three shapes iCalendar actually emits: UTC, floating
 * local, and all-day dates.
 */
const crypto = require('node:crypto');
const platform = require('../platform');
const { cachePath, readJson, writeJson, readPrefs } = require('../paths');
const secrets = require('../secrets');

let events = [];
let subscriptions = [];
let timer = null;
let subscriptionTimer = null;
let reminded = new Set();
const listeners = new Set();

const FETCH_SCRIPT = require('node:path').join(__dirname, 'calendar-fetch.ps1');
const REFRESH_MS = 30 * 60 * 1000;

/**
 * A subscription URL is a credential.
 *
 * Feishu, DingTalk, WeCom, Outlook and iCloud all put a long-lived token in the
 * path: anyone holding the link can read the calendar. It is therefore stored
 * through safeStorage, like the mail passwords, and only ever in memory as
 * plain text. A value written by an older build has no prefix and is read as
 * clear text, so an upgrade does not silently drop existing subscriptions.
 */
const decodeUrl = (value) => {
  if (typeof value !== 'string' || !value) return '';
  if (value.startsWith('v1:') || value.startsWith('plain:')) return secrets.decrypt(value) || '';
  return value;
};

function load() {
  const saved = readJson(cachePath('calendar'), null);
  events = Array.isArray(saved?.events) ? saved.events : [];
  subscriptions = (Array.isArray(saved?.subscriptions) ? saved.subscriptions : []).map((sub) => ({
    ...sub,
    url: decodeUrl(sub.url),
  }));
}

function save() {
  writeJson(cachePath('calendar'), {
    events,
    subscriptions: subscriptions.map((sub) => ({ ...sub, url: secrets.encrypt(sub.url) })),
  });
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

function list() {
  return events
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((event) => ({ ...event }));
}

function add(payload) {
  const title = String(payload?.title ?? '').trim();
  const start = Number(payload?.start);
  if (!title || !Number.isFinite(start)) return null;
  const event = {
    id: crypto.randomBytes(4).toString('hex'),
    uid: String(payload?.uid ?? '').slice(0, 200),
    title: title.slice(0, 160),
    start,
    end: Number.isFinite(Number(payload?.end)) ? Number(payload.end) : start + 60 * 60 * 1000,
    allDay: Boolean(payload?.allDay),
    location: String(payload?.location ?? '').slice(0, 120),
    note: String(payload?.note ?? '').slice(0, 500),
    source: String(payload?.source ?? 'manual'),
    createdAt: Date.now(),
  };
  events.push(event);
  save();
  emit();
  return event;
}

function remove(id) {
  events = events.filter((event) => event.id !== id);
  save();
  emit();
}

/* ------------------------------------------------------------------ ICS */

// Parsing lives in its own module so it can be unit-tested without Electron.
const { parseIcs } = require('../ics');

/**
 * Import every VEVENT found in a text; returns how many were added.
 *
 * `source` is what makes a re-sync idempotent: the same mail polled twice
 * produces the same (uid, source, start) triple, so the second pass adds
 * nothing. An event with no UID cannot be de-duplicated and is added each
 * time — the alternative is guessing, and guessing merges two real meetings.
 */
function importIcs(text, source = 'invite') {
  if (readPrefs().calendar?.fromMail === false) return 0;
  const parsed = parseIcs(text);
  let added = 0;
  for (const event of parsed) {
    const uid = String(event.uid ?? '');
    if (uid) {
      const duplicate = events.some(
        (existing) => existing.uid === uid && existing.source === source && existing.start === event.start,
      );
      if (duplicate) continue;
    }
    if (add({ ...event, uid, source })) added += 1;
  }
  return added;
}

/** The next few events, for the island's short list. */
/**
 * One subscription URL, fetched through the child process.
 *
 * The URL is passed as an argv entry to PowerShell from execFile, which does
 * not go through a shell, so a URL with & or spaces is one argument, not two.
 */
async function fetchSubscription(url) {
  const result = await platform.runPowerShell(
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', FETCH_SCRIPT, '-Url', String(url)],
    { timeout: 40000, maxBuffer: 8 * 1024 * 1024 },
  );
  const text = result.stdout.trim();
  if (!result.ok || !text || text.startsWith('ERROR')) return null;
  return text;
}

/**
 * Replace one source's events with what the feed says now.
 *
 * Removing by source first is what makes a refresh idempotent: a moved meeting
 * must not appear twice, and a deleted one must disappear.
 */
function applySubscription(sub, text) {
  const parsed = parseIcs(text);
  const stamp = Date.now();
  events = events.filter((event) => event.source !== sub.id);
  for (const event of parsed) {
    events.push({
      id: crypto.randomBytes(4).toString('hex'),
      uid: event.uid,
      title: event.title,
      start: event.start,
      end: event.end,
      allDay: Boolean(event.allDay),
      location: event.location,
      source: sub.id,
      importedAt: stamp,
    });
  }
}

async function refreshSubscriptions(force) {
  const now = Date.now();
  let changed = false;
  for (const sub of subscriptions) {
    if (!force && sub.lastSync && now - sub.lastSync < REFRESH_MS) continue;
    const text = await fetchSubscription(sub.url);
    if (!text) {
      sub.error = '拉取失败';
      sub.lastSync = now;
      changed = true;
      continue;
    }
    if (!/BEGIN:VCALENDAR/i.test(text)) {
      sub.error = '不是日历文件';
      sub.lastSync = now;
      changed = true;
      continue;
    }
    applySubscription(sub, text);
    sub.error = '';
    sub.lastSync = now;
    changed = true;
  }
  if (changed) {
    save();
    emit();
  }
  return changed;
}

async function addSubscription(name, url) {
  const label = String(name ?? '').trim().slice(0, 60) || '日历订阅';
  const link = String(url ?? '').trim();
  if (!/^https?:\/\//i.test(link)) return { ok: false, error: '需要一个 http(s) 链接' };
  if (subscriptions.some((sub) => sub.url === link)) return { ok: false, error: '这个链接已经添加过' };
  const sub = { id: crypto.randomBytes(4).toString('hex'), name: label, url: link, lastSync: 0, error: '' };
  subscriptions.push(sub);
  save();
  // Await the first pull so the caller gets the events it just subscribed to,
  // not an empty list followed by a push a second later.
  await refreshSubscriptions(true);
  return { ok: true, id: sub.id };
}

function removeSubscription(id) {
  subscriptions = subscriptions.filter((sub) => sub.id !== id);
  events = events.filter((event) => event.source !== id);
  save();
  emit();
}

function subscriptionList() {
  return subscriptions.map(({ id, name, url, lastSync, error }) => ({ id, name, url, lastSync, error }));
}

function upcoming(days = 7) {
  const now = Date.now();
  const until = now + days * 24 * 60 * 60 * 1000;
  return list().filter((event) => event.end >= now && event.start <= until);
}

function tick() {
  const prefs = readPrefs();
  const leadMin = Math.max(0, Number(prefs.calendar?.leadMin) || 0);
  const leadMs = leadMin * 60 * 1000;
  const now = Date.now();
  for (const event of events) {
    const key = event.id + ':' + event.start;
    if (reminded.has(key)) continue;
    // Fire once, at the configured lead time; a 0 lead means "at start".
    if (event.start - leadMs > now || event.start < now - 60 * 1000) continue;
    reminded.add(key);
    const when = leadMin > 0 ? `${leadMin} 分钟后` : '现在';
    require('./notify').notify(
      '日程提醒',
      `${event.title} · ${when}${event.location ? ' · ' + event.location : ''}`,
    );
  }
}

/**
 * Start the calendar worker.
 *
 * Order matters: load() first, or the immediate refresh runs against an empty
 * subscription list and the first pull is silently skipped. Then the refresh,
 * then the two timers — both kept in variables, because the old code dropped
 * the subscription interval's handle and stopService() could not stop it.
 */
function startService() {
  load();
  emit();
  refreshSubscriptions(false).catch(() => {});

  clearInterval(timer);
  timer = setInterval(tick, 30000);

  clearInterval(subscriptionTimer);
  subscriptionTimer = setInterval(() => {
    refreshSubscriptions(false).catch(() => {});
  }, REFRESH_MS);
  subscriptionTimer.unref?.();
}

function stopService() {
  clearInterval(timer);
  timer = null;
  clearInterval(subscriptionTimer);
  subscriptionTimer = null;
}

function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

module.exports = {
  startService,
  stopService,
  onChange,
  list,
  upcoming,
  add,
  remove,
  parseIcs,
  importIcs,
  refreshSubscriptions,
  addSubscription,
  removeSubscription,
  subscriptionList,
};
