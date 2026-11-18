/**
 * iCalendar parsing, directly.
 *
 * These cases are the ones that produced wrong events in the field: a zoned
 * time read as local (two hours off), an all-day event shifted by the UTC
 * offset, a comma escape left visible in the title, and a weekly meeting that
 * appeared exactly once.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ics = require('../src/main/ics.js');

const cal = (body) => ['BEGIN:VCALENDAR', 'VERSION:2.0', body, 'END:VCALENDAR'].join('\r\n');
const vevent = (lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');

describe('ics: dates', () => {
  it('resolves a TZID wall-clock time to the right instant', () => {
    const out = ics.parseIcs(cal(vevent([
      'UID:tz-1',
      'SUMMARY:Standup',
      'DTSTART;TZID=Asia/Shanghai:20260301T100000',
      'DTEND;TZID=Asia/Shanghai:20260301T103000',
    ])));
    assert.equal(out.length, 1);
    // 10:00 in Shanghai (UTC+8) is 02:00 UTC.
    assert.equal(new Date(out[0].start).toISOString(), '2026-03-01T02:00:00.000Z');
    assert.equal(out[0].end - out[0].start, 30 * 60 * 1000);
  });

  it('keeps a UTC timestamp as UTC', () => {
    const out = ics.parseIcs(cal(vevent([
      'UID:utc-1',
      'SUMMARY:Flight',
      'DTSTART:20260301T100000Z',
    ])));
    assert.equal(new Date(out[0].start).toISOString(), '2026-03-01T10:00:00.000Z');
  });

  it('marks an all-day event and gives it a day, not an hour', () => {
    const out = ics.parseIcs(cal(vevent([
      'UID:allday-1',
      'SUMMARY:Holiday',
      'DTSTART;VALUE=DATE:20260301',
      'DTEND;VALUE=DATE:20260302',
    ])));
    assert.equal(out[0].allDay, true);
    assert.equal(out[0].end - out[0].start, 86400000);
    const d = new Date(out[0].start);
    assert.equal(d.getDate(), 1, 'the day must not shift with the local offset');
  });

  it('survives a folded line', () => {
    const out = ics.parseIcs(cal(vevent([
      'UID:fold-1',
      'SUMMARY:A very long title that was',
      '  folded across two lines',
      'DTSTART:20260301T100000Z',
    ])));
    assert.equal(out[0].title, 'A very long title that was folded across two lines');
  });
});

describe('ics: text escapes', () => {
  it('unescapes comma, semicolon and newline in SUMMARY and LOCATION', () => {
    const out = ics.parseIcs(cal(vevent([
      'UID:esc-1',
      'SUMMARY:Planning\\, Q2',
      'LOCATION:Room 4\\; floor 2',
      'DESCRIPTION:line one\\nline two',
      'DTSTART:20260301T100000Z',
    ])));
    assert.equal(out[0].title, 'Planning, Q2');
    assert.equal(out[0].location, 'Room 4; floor 2');
    assert.equal(out[0].note, 'line one\nline two');
  });
});

describe('ics: recurrence', () => {
  it('expands a weekly meeting to COUNT instances, one week apart', () => {
    const out = ics.parseIcs(cal(vevent([
      'UID:week-1',
      'SUMMARY:Weekly',
      'DTSTART;TZID=Asia/Shanghai:20260301T100000',
      'RRULE:FREQ=WEEKLY;COUNT=3',
    ])));
    assert.equal(out.length, 3);
    assert.equal(new Date(out[1].start).toISOString(), '2026-03-08T02:00:00.000Z');
    assert.equal(new Date(out[2].start).toISOString(), '2026-03-15T02:00:00.000Z');
  });

  it('honours INTERVAL and UNTIL', () => {
    const out = ics.parseIcs(cal(vevent([
      'UID:daily-1',
      'SUMMARY:Every other day',
      'DTSTART:20260301T090000Z',
      'RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20260305T090000Z',
    ])));
    assert.equal(out.length, 3, '1st, 3rd and 5th');
  });

  it('returns the single event for a rule it does not implement', () => {
    const out = ics.parseIcs(cal(vevent([
      'UID:byday-1',
      'SUMMARY:Third Tuesday',
      'DTSTART:20260301T090000Z',
      'RRULE:FREQ=MONTHLY;BYDAY=3TU;COUNT=6',
    ])));
    assert.equal(out.length, 1, 'an unsupported rule yields the base event, not a wrong expansion');
  });

  it('skips invalid month days instead of rolling into the next month', () => {
    const out = ics.parseIcs(cal(vevent([
      'UID:month-end-1',
      'SUMMARY:Month end',
      'DTSTART:20260131T090000',
      'RRULE:FREQ=MONTHLY;COUNT=4',
    ])));
    const dates = out.map((event) => {
      const date = new Date(event.start);
      return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    });
    assert.deepEqual(dates, [
      '2026-1-31',
      '2026-3-31',
      '2026-5-31',
      '2026-7-31',
    ]);
  });

  it('skips invalid leap days in yearly recurrence', () => {
    const out = ics.parseIcs(cal(vevent([
      'UID:leap-day-1',
      'SUMMARY:Leap day',
      'DTSTART:20240229T090000',
      'RRULE:FREQ=YEARLY;COUNT=3',
    ])));
    const dates = out.map((event) => {
      const date = new Date(event.start);
      return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    });
    assert.deepEqual(dates, ['2024-2-29', '2028-2-29', '2032-2-29']);
  });
});

describe('ics: identity', () => {
  it('carries the UID so an importer can de-duplicate', () => {
    const out = ics.parseIcs(cal(vevent(['UID:stable-42', 'SUMMARY:X', 'DTSTART:20260301T090000Z'])));
    assert.equal(out[0].uid, 'stable-42');
  });

  it('ignores a block with no start', () => {
    const out = ics.parseIcs(cal(vevent(['UID:nostart-1', 'SUMMARY:Broken'])));
    assert.equal(out.length, 0);
  });

  it('ignores input that is not a calendar at all', () => {
    assert.deepEqual(ics.parseIcs('hello'), []);
    assert.deepEqual(ics.parseIcs(''), []);
  });
});
