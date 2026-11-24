import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  buildDecodeTable,
  createElogMonitor,
  createElogTracker,
  createIncrementalDecoder,
  decodeElog,
  parseHeader,
} = require('../src/main/services/netease-elog.js');

const START = 1_700_000_000_000;
const DATE = '2026-11-24 03:00:00';

function encodeElog(text) {
  const decode = buildDecodeTable();
  const encode = new Uint8Array(256);
  for (let byte = 0; byte < 256; byte += 1) encode[decode[byte]] = byte;
  return Buffer.from([...Buffer.from(text, 'utf8')].map((byte) => encode[byte]));
}

function logLine(uptimeMs, payload) {
  return `[100:200:2026/112403:${uptimeMs}:INFO:app(1)] [${DATE}] ${payload}\n`;
}

function track(id, name, duration = 180_000) {
  return JSON.stringify({
    id,
    name,
    duration,
    artists: [{ name: 'Artist' }],
    album: { name: 'Album' },
  });
}

describe('NetEase elog decoding', () => {
  it('round-trips the player byte encoding and keeps Chinese text intact', () => {
    const text = '【playing】,"native播放state",1,"430208102_TOKEN"\n';
    assert.equal(decodeElog(encodeElog(text)), text);
  });

  it('keeps partial encoded lines until their newline arrives', () => {
    const first = '【playing】,"setPlayingPosition",42.5\n';
    const second = '【playing】,"native播放state",2,"430208102_TOKEN"\n';
    const entire = encodeElog(first + second);
    const split = Math.floor(entire.length / 2) + 3;
    const decoder = createIncrementalDecoder();

    assert.deepEqual(decoder.push(entire.subarray(0, split)), [first.trimEnd()]);
    assert.deepEqual(decoder.push(entire.subarray(split)), [second.trimEnd()]);
  });

  it('restores event timestamps from the elapsed-time field', () => {
    const header = parseHeader(logLine(12_345, 'ignored').trim(), { bootTimeMs: START });
    assert.equal(header.timestamp, START + 12_345);
    assert.equal(header.datetime, DATE);
  });
});

describe('NetEase elog state machine', () => {
  it('does not switch lyrics for a queued-song privilege precheck', () => {
    let now = START + 16_000;
    const tracker = createElogTracker({ now: () => now, bootTimeMs: START });
    tracker.processText([
      logLine(1_000, `【playing】,"checkPlayPrivilege",${track('a', 'Current')}`),
      logLine(2_000, '【playing】,"native播放资源load完成，开始播放",{"songId":"a"}'),
      logLine(12_000, '【playing】,"setPlayingPosition",42.5'),
      logLine(13_000, `【playing】,"checkPlayPrivilege",${track('b', 'Queued next')}`),
    ].join(''));

    const beforeLoad = tracker.snapshot();
    assert.equal(beforeLoad.track.id, 'a');
    assert.equal(beforeLoad.track.title, 'Current');
    assert.equal(beforeLoad.position, 46.5);
    assert.equal(beforeLoad.playing, true);
  });

  it('publishes the exact seek, freezes a pause, and resumes from that point', () => {
    let now = START + 5_000;
    const tracker = createElogTracker({ now: () => now, bootTimeMs: START });
    tracker.processText([
      logLine(1_000, `【playing】,"checkPlayPrivilege",${track('a', 'Current')}`),
      logLine(2_000, '【playing】,"native播放资源load完成，开始播放",{"songId":"a"}'),
      logLine(5_000, '【playing】,"native播放state",2,"a_TOKEN"'),
    ].join(''));
    assert.equal(tracker.snapshot().position, 3);
    assert.equal(tracker.snapshot().playing, false);

    now = START + 7_000;
    tracker.processText(logLine(7_000, '【playing】,"setPlayingPosition",92.4'));
    assert.equal(tracker.snapshot().position, 92.4);

    now = START + 67_000;
    assert.equal(tracker.snapshot().position, 92.4);

    tracker.processText(logLine(67_000, '【playing】,"native播放state",1,"a_TOKEN"'));
    now = START + 72_000;
    assert.equal(tracker.snapshot().position, 97.4);
    assert.equal(tracker.snapshot().playing, true);
  });

  it('switches only when the queued track actually starts', () => {
    let now = START + 3_000;
    const tracker = createElogTracker({ now: () => now, bootTimeMs: START });
    tracker.processText([
      logLine(1_000, `【playing】,"checkPlayPrivilege",${track('a', 'Current')}`),
      logLine(2_000, '【playing】,"native播放资源load完成，开始播放",{"songId":"a"}'),
      logLine(2_500, `【playing】,"checkPlayPrivilege",${track('b', 'Next')}`),
    ].join(''));
    assert.equal(tracker.snapshot().track.id, 'a');

    now = START + 4_000;
    tracker.processText(logLine(
      4_000,
      '【playing】,"native播放资源load完成，开始播放",{"songId":"b"}',
    ));
    assert.equal(tracker.snapshot().track.id, 'b');
    assert.equal(tracker.snapshot().track.title, 'Next');
    assert.equal(tracker.snapshot().position, 0);
  });

  it('stops showing a track after NetEase exits', () => {
    let now = START + 8_000;
    const tracker = createElogTracker({ now: () => now, bootTimeMs: START });
    tracker.processText([
      logLine(1_000, `【playing】,"checkPlayPrivilege",${track('a', 'Current')}`),
      logLine(2_000, '【playing】,"native播放资源load完成，开始播放",{"songId":"a"}'),
      logLine(8_000, '【app】,{"actionId":"exitApp"}'),
    ].join(''));

    assert.equal(tracker.snapshot().active, false);
  });
});

describe('NetEase elog incremental monitor', () => {
  it('loads existing state, follows appended seeks, and resets on truncation', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emojitot-netease-elog-'));
    const filePath = path.join(dir, 'cloudmusic.elog');
    const monitor = createElogMonitor({
      filePath,
      pollMs: 50,
      now: () => START + 4_500,
      bootTimeMs: START,
    });
    const snapshots = [];
    monitor.onChange((snapshot) => snapshots.push(snapshot));
    fs.writeFileSync(filePath, encodeElog([
      logLine(1_000, `【playing】,"checkPlayPrivilege",${track('a', 'First')}`),
      logLine(2_000, '【playing】,"native播放资源load完成，开始播放",{"songId":"a"}'),
      logLine(4_000, '【playing】,"setPlayingPosition",12.5'),
    ].join('')));

    await monitor.start();
    assert.equal(snapshots.at(-1)?.track.title, 'First');
    assert.equal(snapshots.at(-1)?.position, 13);

    fs.appendFileSync(filePath, encodeElog(
      logLine(5_000, '【playing】,"setPlayingPosition",75.5'),
    ));
    await monitor.poll();
    assert.equal(snapshots.at(-1)?.position, 75.5);
    assert.equal(snapshots.at(-1)?.eventKind, 'seek');

    fs.writeFileSync(filePath, encodeElog([
      logLine(6_000, `【playing】,"checkPlayPrivilege",${track('b', 'Second')}`),
      logLine(7_000, '【playing】,"native播放资源load完成，开始播放",{"songId":"b"}'),
    ].join('')));
    await monitor.poll();
    assert.equal(snapshots.at(-1)?.track.title, 'Second');

    monitor.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
