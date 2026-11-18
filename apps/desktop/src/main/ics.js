/**
 * iCalendar parsing, with no Electron and no filesystem.
 *
 * Split out of the calendar service so it can be tested directly: a date
 * parser that is only reachable through a running app is a parser nobody
 * checks. Everything here is a pure function of its arguments.
 */


/** Unfold RFC 5545 continuation lines: CRLF followed by space or tab. */
function unfold(text) {
  return String(text).replace(/\r?\n[ \t]/g, '');
}

/**
 * One VEVENT body as a name → { value, params } map.
 *
 * `field("DTSTART")` used to return just the value and silently drop the
 * parameters, which is why TZID and VALUE=DATE were invisible. Parsing the
 * parameter list is what makes a zoned or all-day event distinguishable from
 * a floating one.
 */
function parseFields(body) {
  const map = new Map();
  for (const line of unfold(body).split(/\r?\n/)) {
    const match = /^([A-Za-z-]+)((?:;[^:]*)?):([\s\S]*)$/.exec(line);
    if (!match) continue;
    const name = match[1].toUpperCase();
    if (map.has(name)) continue;
    const params = {};
    for (const part of match[2].split(';')) {
      if (!part) continue;
      const eq = part.indexOf('=');
      if (eq < 0) params[part.toUpperCase()] = '';
      else params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
    }
    map.set(name, { value: match[3], params });
  }
  return map;
}

/** RFC 5545 text escapes: \\n \\, \\; \\\\. */
function decodeText(value) {
  return String(value ?? '')
    .replace(/\\[nN]/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

/** Offset of a zone from UTC at an instant, in ms. */
function zoneOffset(utcMs, timeZone) {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = {};
    for (const part of dtf.formatToParts(new Date(utcMs))) {
      if (part.type !== 'literal') parts[part.type] = part.value;
    }
    const hour = parts.hour === '24' ? '00' : parts.hour;
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return asUtc - utcMs;
  } catch {
    return 0;
  }
}

/** A wall-clock time in a named zone, as epoch ms. Two passes settle DST. */
function zonedToUtc(y, mo, d, h, mi, sec, timeZone) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, sec);
  const first = guess - zoneOffset(guess, timeZone);
  return guess - zoneOffset(first, timeZone);
}

/**
 * Parse one ICS date value into epoch ms.
 *
 * Handles the three shapes iCalendar actually emits plus the two parameters
 * that change their meaning: TZID (a wall-clock time in a named zone) and
 * VALUE=DATE (an all-day event, which must not shift with the local offset).
 */
function parseDate(value, params = {}) {
  if (!value) return null;
  const text = String(value).trim();
  const timeZone = params.TZID ? String(params.TZID) : '';

  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (dateOnly) {
    // All-day: keep it at local midnight so the month grid shows the right day.
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])).getTime();
  }

  const stamp = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(text);
  if (stamp) {
    const [, y, mo, d, h, mi, sec, zulu] = stamp.map(Number.isFinite ? (v) => v : (v) => v);
    const args = [Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec)];
    if (zulu === 'Z') return Date.UTC(...args);
    if (timeZone) return zonedToUtc(args[0], args[1] + 1, args[2], args[3], args[4], args[5], timeZone);
    return new Date(...args).getTime();
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** One RRULE string as a key → value map. */
function parseRule(text) {
  const rule = {};
  for (const part of String(text ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    rule[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return rule;
}

const RRULE_LIMIT = 30;

/**
 * Expand the recurrence forms this app supports.
 *
 * FREQ (DAILY / WEEKLY / MONTHLY / YEARLY) with INTERVAL, COUNT and UNTIL is
 * what invites and shared calendars actually use. Everything else — BYDAY,
 * BYSETPOS, BYMONTHDAY, EXDATE, RECURRENCE-ID overrides, RDATE — is listed as
 * unsupported in docs/PRIVACY.md rather than half-implemented here: a wrong
 * expansion is worse than an honest single event.
 */
const UNSUPPORTED_RULE_PARTS = ['BYDAY', 'BYMONTHDAY', 'BYYEARDAY', 'BYWEEKNO', 'BYSETPOS', 'BYHOUR', 'BYMINUTE', 'BYSECOND', 'BYMONTH'];

function expandRecurrence(event, ruleText) {
  const rule = parseRule(ruleText);
  const freq = String(rule.FREQ ?? '').toUpperCase();
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return [];
  // A rule we cannot honour exactly is left as its base event. Expanding
  // "third Tuesday" as "every month on the 1st" would invent six meetings
  // that do not exist, which is worse than showing one that does.
  if (UNSUPPORTED_RULE_PARTS.some((part) => rule[part] !== undefined)) return [];
  const interval = Math.max(1, Number(rule.INTERVAL) || 1);
  const count = Math.max(0, Number(rule.COUNT) || 0);
  const until = rule.UNTIL ? parseDate(rule.UNTIL) : 0;
  const limit = Math.min(count || RRULE_LIMIT, RRULE_LIMIT);

  const out = [];
  const base = new Date(event.start);
  const duration = event.end - event.start;
  let cursor = new Date(base.getTime());

  for (let i = 1; i < limit; i += 1) {
    if (freq === 'DAILY') cursor = new Date(cursor.getTime() + interval * 86400000);
    else if (freq === 'WEEKLY') cursor = new Date(cursor.getTime() + interval * 7 * 86400000);
    else if (freq === 'MONTHLY') cursor = new Date(cursor.getFullYear(), cursor.getMonth() + interval, cursor.getDate(), cursor.getHours(), cursor.getMinutes(), cursor.getSeconds());
    else cursor = new Date(cursor.getFullYear() + interval, cursor.getMonth(), cursor.getDate(), cursor.getHours(), cursor.getMinutes(), cursor.getSeconds());
    if (until && cursor.getTime() > until) break;
    out.push({ ...event, start: cursor.getTime(), end: cursor.getTime() + duration });
  }
  return out;
}

/** Pull the VEVENT fields this app renders, with recurrence expanded. */
function parseIcs(text) {
  if (!text || !/BEGIN:VCALENDAR/i.test(text)) return [];
  const unfolded = unfold(text);
  const blocks = [...unfolded.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/gi)];
  const out = [];
  for (const block of blocks) {
    const fields = parseFields(block[1]);
    const dtStart = fields.get('DTSTART');
    if (!dtStart) continue;
    const start = parseDate(dtStart.value, dtStart.params);
    if (start === null) continue;
    const dtEnd = fields.get('DTEND');
    const allDay = String(dtStart.params.VALUE ?? '').toUpperCase() === 'DATE';
    const base = {
      uid: decodeText(fields.get('UID')?.value ?? ''),
      title: decodeText(fields.get('SUMMARY')?.value) || '未命名日程',
      start,
      end: (dtEnd ? parseDate(dtEnd.value, dtEnd.params) : null) ?? start + (allDay ? 86400000 : 60 * 60 * 1000),
      allDay,
      location: decodeText(fields.get('LOCATION')?.value),
      note: decodeText(fields.get('DESCRIPTION')?.value).slice(0, 300),
      source: 'invite',
    };
    out.push(base);
    const rrule = fields.get('RRULE');
    if (rrule) out.push(...expandRecurrence(base, rrule.value));
  }
  return out;
}


module.exports = {
  unfold,
  parseFields,
  decodeText,
  parseDate,
  parseRule,
  expandRecurrence,
  parseIcs,
  zonedToUtc,
  RRULE_LIMIT,
};
