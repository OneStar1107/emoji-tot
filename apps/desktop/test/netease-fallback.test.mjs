import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createNeteaseFallback,
  createPlaybackClock,
  mapHistoryRow,
} = require('../src/main/services/netease.js');

const START = 1_700_000_000_000;

function historyRow(overrides = {}) {
  return {
    playtime: START,
    id: '430208102',
    jsonStr: JSON.stringify({
      id: '430208102',
      name: 'ghosts',
      duration: 258746,
      artists: [{ name: 'Shinigami' }, { name: 'Second Artist' }],
      album: { name: 'ghosts', picUrl: 'https://example.invalid/cover.jpg' },
      ...overrides,
    }),
  };
}

describe('NetEase history mapping', () => {
  it('turns the latest play record into a media frame with a real duration', () => {
    const frame = mapHistoryRow(historyRow(), { now: START + 12_400 });
    assert.equal(frame.active, true);
    assert.equal(frame.title, 'ghosts');
    assert.equal(frame.artist, 'Shinigami / Second Artist');
    assert.equal(frame.album, 'ghosts');
    assert.equal(frame.trackId, '430208102');
    assert.equal(frame.duration, 258.7);
    assert.equal(frame.position, 12.4);
    assert.equal(frame.source, 'cloudmusic.exe');
    assert.equal(frame.art, '', 'remote NetEase art is not exposed to the island CSP');
  });
});
describe('fallback playback clock', () => {
  it('starts mid-song when EmojiTot opens after NetEase is already playing', () => {
    let now = START + 42_000;
    const clock = createPlaybackClock({ now: () => now });
    const track = { id: 'a', playtime: START, duration: 200 };

    assert.equal(clock.sample(track, true).position, 42);
    now += 3_000;
    assert.equal(clock.sample(track, true).position, 45);
  });

  it('freezes on pause and resumes from the frozen position', () => {
    let now = START + 10_000;
    const clock = createPlaybackClock({ now: () => now });
    const track = { id: 'a', playtime: START, duration: 200 };

    assert.equal(clock.sample(track, true).position, 10);
    now += 20_000;
    assert.equal(clock.sample(track, false).position, 30);
    now += 60_000;
    assert.equal(clock.sample(track, false).position, 30);
    assert.equal(clock.sample(track, true).position, 30);
    now += 5_000;
    assert.equal(clock.sample(track, true).position, 35);
  });

  it('resets the clock when the history record changes tracks', () => {
    let now = START + 70_000;
    const clock = createPlaybackClock({ now: () => now });
    const first = { id: 'a', playtime: START, duration: 200 };
    const second = { id: 'b', playtime: START + 69_000, duration: 100 };

    assert.equal(clock.sample(first, true).position, 70);
    now += 1_000;
    assert.equal(clock.sample(second, true).position, 2);
  });

  it('re-anchors when the user seeks in either player', () => {
    let now = START + 10_000;
    const clock = createPlaybackClock({ now: () => now });
    const track = { id: 'a', playtime: START, duration: 200 };

    assert.equal(clock.sample(track, true).position, 10);
    assert.equal(clock.seek(92.4), 92.4);
    now += 3_000;
    assert.equal(clock.sample(track, true).position, 95.4);

    clock.seek(130);
    assert.equal(clock.sample(track, false).position, 130);
    now += 40_000;
    assert.equal(clock.sample(track, false).position, 130);
  });
});

describe('NetEase fallback provider', () => {
  it('emits immediately when NetEase already has an audio session', async () => {
    let now = START + 8_000;
    const emitted = [];
    const provider = createNeteaseFallback({
      now: () => now,
      readAudio: async () => ({ session: true, playing: true }),
      readHistory: async () => historyRow(),
      shouldPoll: () => true,
    });
    provider.onChange((frame) => emitted.push(frame));

    await provider.poll();
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].title, 'ghosts');
    assert.equal(emitted[0].position, 8);
  });

  it('picks up NetEase when the player opens after EmojiTot', async () => {
    let now = START;
    let audio = { session: false, playing: false };
    const emitted = [];
    const provider = createNeteaseFallback({
      now: () => now,
      readAudio: async () => audio,
      readHistory: async () => historyRow(),
      shouldPoll: () => true,
    });
    provider.onChange((frame) => emitted.push(frame));

    assert.equal(await provider.poll(), null);
    now += 5_000;
    audio = { session: true, playing: true };
    const frame = await provider.poll();
    assert.equal(frame.title, 'ghosts');
    assert.equal(frame.position, 5);
    assert.equal(emitted.at(-1)?.source, 'cloudmusic.exe');
  });

  it('does not query the large history database while SMTC is healthy', async () => {
    let historyReads = 0;
    const provider = createNeteaseFallback({
      now: () => START,
      readAudio: async () => ({ session: true, playing: true }),
      readHistory: async () => {
        historyReads += 1;
        return historyRow();
      },
      shouldPoll: () => false,
    });

    await provider.poll();
    assert.equal(historyReads, 0);
  });

  it('uses SMTC play/pause immediately while CoreAudio catches up', async () => {
    const provider = createNeteaseFallback({
      now: () => START + 20_000,
      readAudio: async () => ({ session: true, playing: true }),
      readHistory: async () => historyRow(),
      shouldPoll: () => true,
    });

    provider.setPlayingHint(false);
    const frame = await provider.poll();
    assert.equal(frame.playing, false);
  });

  it('publishes an explicit seek at once and keeps advancing from the new anchor', async () => {
    let now = START + 8_000;
    const provider = createNeteaseFallback({
      now: () => now,
      readAudio: async () => ({ session: true, playing: true }),
      readHistory: async () => historyRow(),
      shouldPoll: () => true,
    });

    await provider.poll();
    const sought = provider.seekToRatio(0.5);
    assert.equal(sought.position, 129.4);
    now += 2_000;
    const frame = await provider.poll();
    assert.equal(frame.position, 131.4);
  });

  it('can begin polling after the player is launched later', async () => {
    let now = START;
    let audio = { session: false, playing: false };
    const provider = createNeteaseFallback({
      now: () => now,
      readAudio: async () => audio,
      readHistory: async () => historyRow(),
      shouldPoll: () => true,
    });

    assert.equal(await provider.poll(), null);
    now += 6_000;
    audio = { session: true, playing: true };
    assert.equal((await provider.poll()).position, 6);
  });

  it('uses the elog track and timeline without waiting for the history database', async () => {
    let now = START + 42_000;
    let historyReads = 0;
    let notify;
    const elogMonitor = {
      start() {},
      stop() {},
      onChange(listener) {
        notify = listener;
      },
    };
    const provider = createNeteaseFallback({
      now: () => now,
      readAudio: async () => ({ session: true, playing: true }),
      readHistory: async () => {
        historyReads += 1;
        return null;
      },
      shouldPoll: () => true,
      elogMonitor,
    });
    provider.onChange(() => {});
    notify({
      active: true,
      track: {
        id: '430208102',
        title: 'ghosts',
        artist: 'Shinigami',
        album: 'ghosts',
        duration: 258.7,
      },
      playing: true,
      position: 42,
      duration: 258.7,
      updated: now,
      eventKind: 'load',
    });

    const frame = await provider.poll();
    assert.equal(frame.title, 'ghosts');
    assert.equal(frame.position, 42);
    assert.equal(frame.duration, 258.7);
    assert.equal(historyReads, 0);

    now += 3_000;
    assert.equal((await provider.poll()).position, 45);
  });

  it('shows a newly launched player before CoreAudio has registered its session', async () => {
    const now = START + 6_000;
    let notify;
    const elogMonitor = {
      start() {},
      stop() {},
      onChange(listener) {
        notify = listener;
      },
    };
    const provider = createNeteaseFallback({
      now: () => now,
      readAudio: async () => ({ session: false, playing: false }),
      readHistory: async () => null,
      shouldPoll: () => true,
      elogMonitor,
    });
    provider.onChange(() => {});
    notify({
      active: true,
      track: {
        id: '430208102',
        title: 'ghosts',
        artist: 'Shinigami',
        album: 'ghosts',
        duration: 258.7,
      },
      playing: true,
      position: 6,
      duration: 258.7,
      lastEventAt: now,
      updated: now,
      eventKind: 'load',
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal((await provider.poll()).title, 'ghosts');
    assert.equal((await provider.poll()).position, 6);
  });

  it('reanchors the NetEase clock as soon as elog reports an external seek', async () => {
    let now = START + 10_000;
    let notify;
    const elogMonitor = {
      start() {},
      stop() {},
      onChange(listener) {
        notify = listener;
      },
    };
    const provider = createNeteaseFallback({
      now: () => now,
      readAudio: async () => ({ session: true, playing: true }),
      readHistory: async () => null,
      shouldPoll: () => true,
      elogMonitor,
    });
    const emitted = [];
    provider.onChange((frame) => emitted.push(frame));
    notify({
      active: true,
      track: {
        id: '430208102',
        title: 'ghosts',
        artist: 'Shinigami',
        album: 'ghosts',
        duration: 258.7,
      },
      playing: true,
      position: 10,
      duration: 258.7,
      updated: now,
      eventKind: 'load',
    });
    await provider.poll();

    now += 20_000;
    notify({
      active: true,
      track: {
        id: '430208102',
        title: 'ghosts',
        artist: 'Shinigami',
        album: 'ghosts',
        duration: 258.7,
      },
      playing: true,
      position: 92.4,
      duration: 258.7,
      updated: now,
      eventKind: 'seek',
    });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(emitted.at(-1).position, 92.4);
    now += 2_000;
    assert.equal((await provider.poll()).position, 94.4);
  });
});
