import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  lyricIndexAt,
  mediaPlaybackSeconds,
  nextLyricDelayMs,
} from '../src/renderer/lyric-clock.mjs';

const lines = [
  { t: 1 },
  { t: 5.2 },
  { t: 12.8 },
];

describe('lyric clock', () => {
  it('advances the sampled media position while playback continues', () => {
    const frame = {
      position: 42,
      duration: 200,
      playing: true,
      sampledAt: 100_000,
    };

    assert.equal(mediaPlaybackSeconds(frame, 101_250), 43.25);
    assert.equal(mediaPlaybackSeconds({ ...frame, rate: 1.5 }, 101_250), 43.875);
    assert.equal(mediaPlaybackSeconds(frame, 1_000_000), 200, 'never runs past the track');
    assert.equal(
      mediaPlaybackSeconds({ ...frame, playing: false }, 101_250),
      42,
      'a paused frame does not keep moving',
    );
  });

  it('selects the line at the extrapolated time and schedules the next boundary', () => {
    assert.equal(lyricIndexAt(lines, 4.85, 0.35), 1);
    assert.equal(nextLyricDelayMs(lines, 1, 4.85, 0.35), 7_600);
    assert.equal(nextLyricDelayMs(lines, 1, 4.85, 0.35, 1.5), 5_067);
    assert.equal(nextLyricDelayMs(lines, 2, 12.8, 0.35), null);
  });
});
