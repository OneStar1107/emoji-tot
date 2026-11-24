/**
 * The data-path services, exercised with Electron stubbed out.
 *
 * These tests exist for the failures that do not throw: a reset button wired
 * to an undefined export, an offline lyric lookup remembered for a week, a
 * meeting imported twice because two ids were minted for it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Module = require('node:module');
const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(resolve(here, '..', 'src', rel), 'utf8');
const repo = (rel) => readFileSync(resolve(here, '..', '..', '..', rel), 'utf8');

const dataDir = mkdtempSync(join(tmpdir(), 'emojitot-test-'));
const stats = { execFile: 0 };

const originalLoad = Module._load;
Module._load = function patched(request) {
  if (request === 'electron') {
    return {
      app: { getPath: () => dataDir, getVersion: () => '0.0.0-test' },
      safeStorage: {
        isEncryptionAvailable: () => false,
        encryptString: () => Buffer.from(''),
        decryptString: () => '',
      },
      shell: { openPath: async () => '' },
      Notification: class { show() {} },
    };
  }
  if (request === 'node:child_process' || request === 'child_process') {
    return {
      execFile: (command, args, options, callback) => {
        stats.execFile += 1;
        const done = typeof options === 'function' ? options : callback;
        // Every lookup in this file fails: that is the offline case.
        done(new Error('offline'));
      },
    };
  }
  return originalLoad.apply(this, arguments);
};

const health = require('../src/main/services/health.js');
const focus = require('../src/main/services/focus.js');
const lyrics = require('../src/main/services/lyrics.js');
const calendar = require('../src/main/services/calendar.js');
const mail = require('../src/main/services/mail.js');
const paths = require('../src/main/paths.js');
const platform = require('../src/main/platform.js');

const cal = (body) => ['BEGIN:VCALENDAR', 'VERSION:2.0', body, 'END:VCALENDAR'].join('\r\n');
const vevent = (lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
const writePrefs = (value) => writeFileSync(join(dataDir, 'prefs.json'), JSON.stringify(value));
const writeFocusCache = (value) => writeFileSync(join(dataDir, 'cache-focus.json'), JSON.stringify(value));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('focus: enabled and skip semantics', () => {
  it('cannot start while the feature is disabled', () => {
    writePrefs({ focus: { enabled: false, work: 25, rest: 5 } });
    focus.restart();
    assert.equal(focus.start(), false);
    assert.equal(focus.snapshot().phase, 'idle');
  });

  it('skipping work does not count a completed cycle', () => {
    writePrefs({ focus: { enabled: true, work: 25, rest: 5 } });
    focus.restart();
    assert.equal(focus.start(), true);
    focus.skip();
    const snapshot = focus.snapshot();
    assert.equal(snapshot.phase, 'rest');
    assert.equal(snapshot.cycles, 0);
    focus.restart();
  });
});

/*
 * The statistics are the page s second reading and the long rest is the one
 * rule that depends on lifetime history: both are driven by a finished work
 * phase, so the test runs the real one-second tick against a pinned clock
 * instead of reimplementing finish() in the test.
 */
describe('focus: today and week totals, and the long rest', () => {
  it('credits a finished pomodoro and gives the fourth one a 15-minute rest', async () => {
    writePrefs({ focus: { enabled: true, work: 25, rest: 5 } });
    writeFocusCache({ phase: 'idle', running: false, remaining: 0, total: 0, cycles: 3, endsAt: 0, history: [] });
    focus.startService();
    const realNow = Date.now;
    let now = new Date(2026, 0, 5, 9, 0, 0).getTime(); // a Monday
    Date.now = () => now;
    try {
      assert.equal(focus.start(), true);
      // The pinned clock jumps the full work phase, so the next tick finishes it.
      now += 25 * 60 * 1000 + 1000;
      await sleep(1250);
      const snapshot = focus.snapshot();
      assert.equal(snapshot.phase, 'rest');
      assert.equal(snapshot.cycles, 4, 'the finished pomodoro is counted');
      assert.equal(snapshot.total, 15 * 60, 'the fourth rest is a long one');
      assert.equal(snapshot.restMinutes, 15);
      assert.equal(snapshot.longRest, true);
      assert.deepEqual(snapshot.stats.today, { count: 1, minutes: 25 });
      assert.deepEqual(snapshot.stats.week, { count: 1, minutes: 25 });
      const saved = JSON.parse(readFileSync(join(dataDir, 'cache-focus.json'), 'utf8'));
      assert.equal(saved.history.length, 1, 'the pomodoro is written through');
      assert.equal(saved.history[0].minutes, 25);
    } finally {
      Date.now = realNow;
      focus.stopService();
      focus.restart();
    }
  });

  it('returns to the configured rest after the long one', () => {
    writePrefs({ focus: { enabled: true, work: 25, rest: 5 } });
    writeFocusCache({ phase: 'idle', running: false, remaining: 0, total: 0, cycles: 5, endsAt: 0, history: [] });
    focus.startService();
    try {
      focus.start();
      focus.skip();
      const snapshot = focus.snapshot();
      assert.equal(snapshot.phase, 'rest');
      assert.equal(snapshot.total, 5 * 60, 'the fifth pomodoro rests the normal five minutes');
      assert.equal(snapshot.longRest, false);
    } finally {
      focus.stopService();
      focus.restart();
    }
  });
});

describe('health: the two clear buttons are separate', () => {
  it('exports what the IPC branch calls', () => {
    for (const name of ['reset', 'resetWater', 'resetStand']) {
      assert.equal(typeof health[name], 'function', name + ' must exist');
    }
  });

  it('clears only the water counter', () => {
    health.drink();
    health.stand();
    assert.equal(health.snapshot().waterCount, 1);
    assert.equal(health.snapshot().standCount, 1);

    health.resetWater();
    const snap = health.snapshot();
    assert.equal(snap.waterCount, 0, 'water count cleared');
    assert.equal(snap.standCount, 1, 'clearing water must not touch posture');
  });

  it('clears only the posture counter', () => {
    health.drink();
    health.stand();
    health.resetStand();
    const snap = health.snapshot();
    assert.equal(snap.standCount, 0, 'posture count cleared');
    assert.equal(snap.waterCount, 1, 'clearing posture must not touch water');
  });

  it('reset() still clears both', () => {
    health.drink();
    health.stand();
    health.reset();
    const snap = health.snapshot();
    assert.equal(snap.waterCount, 0);
    assert.equal(snap.standCount, 0);
  });
});

describe('health: the counters belong to a local date', () => {
  const cacheFile = join(dataDir, 'cache-health.json');
  const key = (date) => {
    const pad = (n) => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  };
  const yesterday = () => {
    const at = new Date();
    return new Date(at.getFullYear(), at.getMonth(), at.getDate() - 1);
  };

  it('reports seven days, oldest first, today last', () => {
    health.drink();
    const snap = health.snapshot();
    assert.equal(snap.trend.length, 7, 'a week is seven buckets');
    assert.equal(snap.trend[6].today, true, 'the last bucket is today');
    assert.equal(snap.trend[6].key, key(new Date()));
    assert.equal(snap.trend.filter((day) => day.today).length, 1, 'exactly one bucket is today');
    assert.equal(snap.trend[6].water, snap.waterCount, 'the last bar is the today count');
  });

  it('resets on a new local day but keeps the day it left', () => {
    writeFileSync(
      cacheFile,
      JSON.stringify({
        lastWater: Date.now() - 60 * 60 * 1000,
        lastStand: Date.now() - 60 * 60 * 1000,
        waterAt: 0,
        standAt: 0,
        day: key(yesterday()),
        days: { [key(yesterday())]: { water: 4, stand: 2 } },
        waterCount: 4,
        standCount: 2,
      }),
    );
    health.startService();
    try {
      const snap = health.snapshot();
      assert.equal(snap.waterCount, 0, 'yesterday water is not today water');
      assert.equal(snap.standCount, 0, 'yesterday posture is not today posture');
      const left = snap.trend.find((day) => day.key === key(yesterday()));
      assert.deepEqual({ water: left.water, stand: left.stand }, { water: 4, stand: 2 }, 'the day it left keeps its count');
      assert.equal(snap.trend[6].water, 0, 'only today was reset');
    } finally {
      health.stopService();
    }
  });

  it('clears today without emptying the week', () => {
    health.drink();
    health.stand();
    health.resetWater();
    const snap = health.snapshot();
    assert.equal(snap.trend[6].water, 0, 'today water cleared');
    assert.equal(snap.trend[6].stand, 1, 'clearing water leaves posture alone');
    assert.ok(snap.trend.slice(0, 6).some((day) => day.water > 0 || day.stand > 0), 'earlier days survive a clear');
  });
});

describe('lyrics: a failed lookup is remembered for minutes, not days', () => {
  const track = { title: 'Offline Song', artist: 'Nobody', duration: 120 };
  const key = createHash('sha1').update(lyrics.trackLookupKey(track)).digest('hex').slice(0, 16);
  const cacheFile = join(dataDir, 'cache-lyrics-' + key + '.json');

  it('treats the short TTL as strictly shorter than a real hit', () => {
    assert.ok(lyrics.NEGATIVE_TTL <= 10 * 60 * 1000, 'a negative entry must expire in minutes');
    assert.ok(lyrics.NEGATIVE_TTL < lyrics.CACHE_TTL, 'negative TTL must be shorter than a hit');
  });

  it('marks an offline result unavailable and writes a negative entry', async () => {
    const value = await lyrics.get(track);
    assert.equal(value.unavailable, true);
    assert.equal(value.synced, false);
    const saved = JSON.parse(readFileSync(cacheFile, 'utf8'));
    assert.equal(saved.negative, true, 'the cache must record that this was a failure');
  });

  it('does not ask again inside the short window', async () => {
    await lyrics.get(track);
    const before = stats.execFile;
    await lyrics.get(track);
    assert.equal(stats.execFile, before, 'a fresh negative entry short-circuits the lookup');
  });

  it('asks again once the short window has passed', async () => {
    const saved = JSON.parse(readFileSync(cacheFile, 'utf8'));
    saved.at = Date.now() - lyrics.NEGATIVE_TTL - 1000;
    writeFileSync(cacheFile, JSON.stringify(saved));
    const before = stats.execFile;
    await lyrics.get(track);
    // The rewritten cache file is the platform-independent proof: a short-
    // circuited lookup would leave `at` at the expired timestamp it was given.
    const retried = JSON.parse(readFileSync(cacheFile, 'utf8'));
    assert.ok(retried.at > saved.at, 'an expired negative entry must not suppress the retry');
    // Only Windows actually spawns a shell, so the counter is only meaningful there.
    if (platform.supported) {
      assert.ok(stats.execFile > before, 'the retry must reach the lookup');
    }
  });
});

describe('lyrics: search results are ranked for the exact media session', () => {
  it('prefers the player catalogue for NetEase and keeps track identity in the lookup key', () => {
    assert.deepEqual(lyrics.providerOrder({ source: 'cloudmusic.exe' }), ['netease', 'lrclib']);
    assert.deepEqual(lyrics.providerOrder({ source: 'Spotify.exe' }), ['lrclib']);
    assert.notEqual(
      lyrics.trackLookupKey({ title: 'Song', artist: 'Artist', trackId: '1', source: 'cloudmusic.exe' }),
      lyrics.trackLookupKey({ title: 'Song', artist: 'Artist', trackId: '2', source: 'cloudmusic.exe' }),
    );
  });

  it('keeps the catalogue duration so the island can label a player without a timeline', () => {
    assert.equal(typeof lyrics.lyricsValue, 'function');
    const value = lyrics.lyricsValue({
      trackName: 'ghosts',
      duration: 125,
      syncedLyrics: '[00:10.00] I don\'t wanna fucking die here',
    }, { title: 'ghosts', artist: 'Shinigami', duration: 0 });
    assert.equal(value.duration, 125);
    assert.equal(value.synced, true);
  });

  it('accepts a synced match even when the clip duration differs from the catalogue', () => {
    const candidates = [
      {
        id: 1,
        trackName: 'get me high (live)',
        artistName: 'Marco Luka',
        duration: 16,
        syncedLyrics: '[00:01.00] live version',
      },
      {
        id: 2,
        trackName: 'get me high',
        artistName: 'Marco Luka',
        duration: 105,
        syncedLyrics: '[00:10.18] Run right through my mind',
      },
      {
        id: 3,
        trackName: 'get me high',
        artistName: 'Somebody Else',
        duration: 16,
        syncedLyrics: '[00:01.00] wrong artist',
      },
    ];
    const picked = lyrics.pickLyricsCandidate(candidates, {
      title: 'get me high',
      artist: 'marco luka',
      duration: 16,
    });
    assert.equal(picked.id, 2);
  });

  it('never uses an instrumental or unsynced result as timed lyrics', () => {
    const picked = lyrics.pickLyricsCandidate([
      { id: 1, trackName: 'Song', artistName: 'Artist', instrumental: true, syncedLyrics: '[00:01.00] x' },
      { id: 2, trackName: 'Song', artistName: 'Artist', syncedLyrics: '' },
    ], { title: 'Song', artist: 'Artist' });
    assert.equal(picked, null);
  });

  it('applies an LRC offset once to every repeated timestamp', () => {
    const parsed = lyrics.parseLrc([
      '[offset:500]',
      '[00:10.00]first',
      '[00:12.00][00:20.00]chorus',
    ].join('\n'));
    assert.deepEqual(parsed.map((line) => [line.t, line.text]), [
      [9.5, 'first'],
      [11.5, 'chorus'],
      [19.5, 'chorus'],
    ]);
  });
});

describe('calendar: importing the same invite twice', () => {
  it('adds nothing the second time', () => {
    const text = cal(vevent(['UID:dup-1', 'SUMMARY:One', 'DTSTART:20260401T090000Z']));
    const first = calendar.importIcs(text, 'mail:msg-1');
    const second = calendar.importIcs(text, 'mail:msg-1');
    assert.equal(first, 1);
    assert.equal(second, 0, 'a re-sync of the same mail must not duplicate the event');
    assert.equal(calendar.list().filter((event) => event.uid === 'dup-1').length, 1);
  });

  it('keeps the same UID from two different sources', () => {
    const text = cal(vevent(['UID:dup-2', 'SUMMARY:Two', 'DTSTART:20260402T090000Z']));
    assert.equal(calendar.importIcs(text, 'mail:a'), 1);
    assert.equal(calendar.importIcs(text, 'mail:b'), 1, 'two sources are two events');
    assert.equal(calendar.list().filter((event) => event.uid === 'dup-2').length, 2);
  });

  it('re-writes a recurring invite idempotently', () => {
    const text = cal(vevent([
      'UID:dup-3',
      'SUMMARY:Weekly',
      'DTSTART:20260403T090000Z',
      'RRULE:FREQ=WEEKLY;COUNT=3',
    ]));
    assert.equal(calendar.importIcs(text, 'mail:c'), 3);
    assert.equal(calendar.importIcs(text, 'mail:c'), 0, 'all three instances already exist');
  });
});

/*
 * The island edits events in place. This is the backend half of that: the same
 * id keeps the same row, the title changes, and a moved meeting keeps its
 * length instead of growing or shrinking around the new start.
 */
describe('calendar: editing an event in place', () => {
  const event = () => {
    const text = cal(vevent(['UID:edit-1', 'SUMMARY:旧标题', 'DTSTART:20261121T213000']));
    calendar.importIcs(text, 'mail:edit');
    return calendar.list().find((item) => item.uid === 'edit-1');
  };

  it('retitles the same event and keeps its id', () => {
    const before = event();
    const updated = calendar.update(before.id, { title: '新标题' });
    assert.equal(updated.id, before.id);
    assert.equal(calendar.list().find((item) => item.id === before.id).title, '新标题');
  });

  it('moves the event and shifts the end by the same delta', () => {
    const before = event();
    const moved = calendar.update(before.id, { start: before.start + 30 * 60 * 1000 });
    assert.equal(moved.start, before.start + 30 * 60 * 1000);
    assert.equal(moved.end - moved.start, before.end - before.start, 'the appointment keeps its length');
  });

  it('refuses to retitle to nothing and leaves the row alone', () => {
    const before = event();
    assert.equal(calendar.update(before.id, { title: '   ' }), null);
    assert.equal(calendar.list().find((item) => item.id === before.id).title, '旧标题');
    assert.equal(calendar.update('no-such-id', { title: 'x' }), null);
  });
});

describe('mail: MIME reading', () => {
  it('decodes a Q-encoded UTF-8 header', () => {
    assert.equal(mail.decodeHeader('=?UTF-8?Q?=E4=BC=9A=E8=AE=AE?='), '会议');
  });

  it('decodes a Q-encoded GBK header', () => {
    assert.equal(mail.decodeHeader('=?GBK?Q?=BB=E1=D2=E9?='), '会议');
  });

  it('finds a calendar part that sits after the body', () => {
    const boundary = 'BOUNDARY42';
    const raw = [
      'Content-Type: multipart/mixed; boundary="' + boundary + '"',
      '',
      '--' + boundary,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      'See you there. '.repeat(200),
      '--' + boundary,
      'Content-Type: text/calendar; charset=utf-8; method=REQUEST',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID=mime-1',
      'SUMMARY=Planning=2C Q2',
      'DTSTART:20260501T100000Z',
      'END:VEVENT',
      'END:VCALENDAR',
      '--' + boundary + '--',
    ].join('\r\n');
    const ics = mail.extractCalendar(raw);
    assert.ok(ics.includes('BEGIN:VCALENDAR'), 'the calendar part was past the 6 KB mark');
    assert.ok(ics.includes('UID=mime-1'));
  });
});

describe('calendar: startService wiring', () => {
  const source = src('main/services/calendar.js');

  it('loads before the first refresh', () => {
    const start = source.slice(source.indexOf('function startService()'), source.indexOf('function stopService()'));
    assert.ok(start.indexOf('load()') >= 0, 'startService must load');
    assert.ok(start.indexOf('load()') < start.indexOf('refreshSubscriptions('),
      'the first refresh must see the subscriptions already loaded');
  });

  it('keeps handles for both timers and clears both', () => {
    assert.ok(source.includes('let subscriptionTimer'), 'the subscription interval needs a handle');
    const stop = source.slice(source.indexOf('function stopService()'));
    assert.ok(stop.slice(0, 400).includes('clearInterval(timer)'));
    assert.ok(stop.slice(0, 400).includes('clearInterval(subscriptionTimer)'));
  });
});

describe('errors are visible, not swallowed', () => {
  it('surfaces mail, quota and subscription failures in the UI', () => {
    const island = src('renderer/island.js');
    assert.ok(island.includes('state.error'), 'mail errors must reach the island');
    assert.ok(island.includes('cal-error'), 'a failed subscription must show a bar');
    assert.ok(island.includes('last?.error'), 'a quota failure must replace the balance');

    const settings = src('renderer/settings.js');
    assert.ok(settings.includes('mailState.error'));
    assert.ok(settings.includes('sub.error'));
    assert.ok(settings.includes('last?.error'));
  });

  it('keeps the subscription failure on the record for the UI to read', () => {
    const source = src('main/services/calendar.js');
    assert.ok(source.includes("sub.error = '拉取失败'"));
    assert.ok(source.includes("sub.error = '不是日历文件'"));
  });
});

describe('atomic JSON writes', () => {
  it('keeps the previous file when the final rename fails', () => {
    const target = join(dataDir, 'atomic.json');
    writeFileSync(target, JSON.stringify({ old: true }));
    const rename = fs.renameSync;
    fs.renameSync = () => {
      throw new Error('rename failed');
    };
    try {
      assert.doesNotThrow(() => paths.writeJson(target, { next: true }));
    } finally {
      fs.renameSync = rename;
    }
    assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), { old: true });
  });
});
