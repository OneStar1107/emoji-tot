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
const lyrics = require('../src/main/services/lyrics.js');
const calendar = require('../src/main/services/calendar.js');
const mail = require('../src/main/services/mail.js');

const cal = (body) => ['BEGIN:VCALENDAR', 'VERSION:2.0', body, 'END:VCALENDAR'].join('\r\n');
const vevent = (lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');

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

describe('lyrics: a failed lookup is remembered for minutes, not days', () => {
  const track = { title: 'Offline Song', artist: 'Nobody', duration: 120 };
  const key = createHash('sha1').update(track.title + '|' + track.artist + '|' + track.duration).digest('hex').slice(0, 16);
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
    assert.ok(stats.execFile > before, 'an expired negative entry must not suppress the retry');
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
