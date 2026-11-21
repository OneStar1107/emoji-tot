import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { MEDIA_EMOTION, AGENT_EMOTION, mediaEmotion, agentEmotion, createEmotionDirector } = require('../src/main/media-emotion.js');

/** A clock whose timers only fire when the test says time has moved. */
function makeClock() {
  let now = 0;
  let timers = [];
  return {
    now: () => now,
    schedule(fn, ms) {
      const handle = { at: now + ms, fn };
      timers.push(handle);
      return handle;
    },
    cancel(handle) {
      timers = timers.filter((item) => item !== handle);
    },
    advance(ms) {
      now += ms;
      // Timers armed by a fired timer are due within the same advance.
      for (let guard = 0; guard < 50; guard += 1) {
        const due = timers.filter((item) => item.at <= now).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((item) => item !== due);
        due.fn();
      }
    },
  };
}

function makeDirector(clock) {
  const applied = [];
  const director = createEmotionDirector({
    now: clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel,
    minDisplayMs: 2000,
    onApply: (result) => applied.push(result),
  });
  return { director, applied };
}

describe('media emotion mapping', () => {
  it('maps every media signal to its named emotion', () => {
    assert.equal(mediaEmotion({ active: true, playing: true, duration: 180 }), MEDIA_EMOTION.playing);
    assert.equal(mediaEmotion({ active: true, playing: true, duration: 0 }), MEDIA_EMOTION.live);
    assert.equal(mediaEmotion({ active: true, playing: false, duration: 180 }), MEDIA_EMOTION.paused);
    assert.equal(mediaEmotion({ error: true }), MEDIA_EMOTION.error);
    assert.equal(mediaEmotion({ active: false }), null);
    assert.equal(mediaEmotion({ game: 'cs2.exe' }), MEDIA_EMOTION.game);
    assert.equal(mediaEmotion({ active: true, playing: true, duration: 180 }, { enabled: false }), null);
  });

  it('keeps the published ids stable', () => {
    assert.deepEqual(MEDIA_EMOTION, {
      playing: '10',
      live: '13',
      game: '16',
      paused: '02',
      error: '11',
    });
    assert.deepEqual(AGENT_EMOTION, { running: '30', done: '33', error: '34' });
  });

  it('maps agent status words', () => {
    assert.equal(agentEmotion('running'), AGENT_EMOTION.running);
    assert.equal(agentEmotion('done'), AGENT_EMOTION.done);
    assert.equal(agentEmotion('error'), AGENT_EMOTION.error);
    assert.equal(agentEmotion('idle'), null);
  });
});

describe('emotion priority', () => {
  it('is manual > agent > media > idle, and returns as each clears', () => {
    const clock = makeClock();
    const { director } = makeDirector(clock);

    director.set('media', '10');
    assert.equal(director.current().emotionId, '10');

    clock.advance(500);
    director.set('agent', '30');
    assert.equal(director.current().emotionId, '10', 'the media face keeps its 2000ms');
    clock.advance(1500);
    assert.equal(director.current().emotionId, '30', 'agent outranks media');

    director.set('manual', '13');
    assert.equal(director.current().emotionId, '30', 'manual also waits for the dwell');
    clock.advance(2000);
    assert.equal(director.current().emotionId, '13', 'manual outranks agent');

    director.clear('manual');
    clock.advance(2000);
    assert.equal(director.current().emotionId, '30', 'agent resumes when the preview ends');

    director.clear('agent');
    clock.advance(2000);
    assert.equal(director.current().emotionId, '10', 'media resumes when the agent stops');

    director.clear('media');
    clock.advance(2000);
    assert.equal(director.current().emotionId, '02', 'idle is the empty state');
  });

  it('resolves the strongest source without waiting', () => {
    const clock = makeClock();
    const { director } = makeDirector(clock);
    director.set('media', '10');
    director.set('agent', '30');
    director.set('manual', '13');
    assert.equal(director.resolve().emotionId, '13');
    assert.equal(director.resolve().source, 'manual');
  });
});

describe('minimum dwell', () => {
  it('holds the shown emotion for 2000ms before any replacement', () => {
    const clock = makeClock();
    const { director, applied } = makeDirector(clock);

    director.set('media', '10');
    assert.equal(director.current().emotionId, '10');
    assert.equal(applied.length, 1);

    clock.advance(500);
    director.set('media', '02');
    assert.equal(director.current().emotionId, '10', 'a new emotion arrived during the dwell');

    clock.advance(1499);
    assert.equal(director.current().emotionId, '10', '1999ms is still inside the dwell');

    clock.advance(1);
    assert.equal(director.current().emotionId, '02', 'at 2000ms the replacement lands');
    assert.equal(applied.length, 2);
  });

  it('does not restart the dwell when the same emotion is re-published', () => {
    const clock = makeClock();
    const { director } = makeDirector(clock);
    director.set('media', '10');
    clock.advance(1500);
    director.set('media', '10');
    clock.advance(499);
    director.set('media', '02');
    clock.advance(1);
    assert.equal(director.current().emotionId, '02', 'the original 2000ms budget still applies');
  });
});
