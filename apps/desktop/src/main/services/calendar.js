/**
 * Calendar: local events plus invitations parsed out of mail.
 *
 * Month view and reminders are local; the only remote part is an .ics that a
 * mail body carries, and that is parsed here rather than trusted whole.
 * Date parsing handles the three shapes iCalendar actually emits: UTC, floating
 * local, and all-day dates.
 */
const crypto = require('node:crypto');
const { cachePath, readJson, writeJson } = require('../paths');

let events = [];
let timer = null;
let reminded = new Set();
const listeners = new Set();

function load() {
  const saved = readJson(cachePath('calendar'), null);
  events = Array.isArray(saved?.events) ? saved.events : [];
}

function save() {
  writeJson(cachePath('calendar'), { events });
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
    title: title.slice(0, 160),
    start,
    end: Number.isFinite(Number(payload?.end)) ? Number(payload.end) : start + 60 * 60 * 1000,
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

/** Parse one ICS date value into epoch ms. */
function parseDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])).getTime();
  }
  const utc = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(text);
  if (utc) {
    return Date.UTC(Number(utc[1]), Number(utc[2]) - 1, Number(utc[3]), Number(utc[4]), Number(utc[5]), Number(utc[6]));
  }
  const local = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(text);
  if (local) {
    return new Date(Number(local[1]), Number(local[2]) - 1, Number(local[3]), Number(local[4]), Number(local[5]), Number(local[6])).getTime();
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Unfold, then pull the VEVENT fields this app renders. */
function parseIcs(text) {
  if (!text || !/BEGIN:VCALENDAR/i.test(text)) return [];
  const unfolded = String(text).replace(/\r?\n[ \t]/g, '');
  const blocks = [...unfolded.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/gi)];
  const out = [];
  for (const block of blocks) {
    const body = block[1];
    const field = (name) => {
      const match = new RegExp('^' + name + '[^:]*:(.*)$', 'im').exec(body);
      return match ? match[1].trim() : '';
    };
    const start = parseDate(field('DTSTART'));
    if (!start) continue;
    out.push({
      title: field('SUMMARY') || '未命名日程',
      start,
      end: parseDate(field('DTEND')) ?? start + 60 * 60 * 1000,
      location: field('LOCATION'),
      note: field('DESCRIPTION').slice(0, 300),
      source: 'invite',
    });
  }
  return out;
}

/** Import every VEVENT found in a text; returns how many were added. */
function importIcs(text) {
  const parsed = parseIcs(text);
  let added = 0;
  for (const event of parsed) {
    if (add(event)) added += 1;
  }
  return added;
}

/** The next few events, for the island's short list. */
function upcoming(days = 7) {
  const now = Date.now();
  const until = now + days * 24 * 60 * 60 * 1000;
  return list().filter((event) => event.end >= now && event.start <= until);
}

function tick() {
  const now = Date.now();
  for (const event of events) {
    const key = event.id + ':' + event.start;
    if (reminded.has(key)) continue;
    if (event.start > now || event.start < now - 60 * 1000) continue;
    reminded.add(key);
    try {
      new (require('electron').Notification)({
        title: '日程开始',
        body: `${event.title}${event.location ? ' · ' + event.location : ''}`,
      }).show();
    } catch {
      // best effort
    }
  }
}

function startService() {
  load();
  emit();
  clearInterval(timer);
  timer = setInterval(tick, 30000);
}

function stopService() {
  clearInterval(timer);
  timer = null;
}

function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

module.exports = { startService, stopService, onChange, list, upcoming, add, remove, parseIcs, importIcs };
