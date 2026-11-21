import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRIORITY,
  EMOTION_IDS,
  IDLE_STATE,
  createArbiter,
  emotionSegment,
  getEmotion,
  isEmotionId,
  resolveEmotionId,
  stateForEmotion,
} from '../src/index.js';

/* ---------------------------------------------------------------- ids */

describe('protocol ids are strictly what they claim to be', () => {
  const notIds = ['3.5', '58abc', '9'.repeat(100), 'a', '', '   ', '1e3', '+3', '-1', '99.9', '0x10', ' 3 4 ', null, undefined];

  it('rejects anything that is not one or two digits', () => {
    for (const value of notIds) {
      expect(isEmotionId(value as never), String(value)).toBe(false);
    }
  });

  it('does not let a near-miss fall into a segment', () => {
    // '3.5' used to parseInt to 3 and silently become a lifecycle id; '58abc'
    // became 58 and landed in signalling. Neither is an id.
    for (const value of ['3.5', '58abc', '9'.repeat(100)]) {
      expect(stateForEmotion(value), value).toBe(IDLE_STATE);
      expect(emotionSegment(value), value).toBeNull();
      expect(getEmotion(value), value).toBeNull();
      expect(resolveEmotionId(value), value).toBeNull();
    }
  });

  it('still accepts the documented forms', () => {
    expect(isEmotionId('3')).toBe(true);
    expect(isEmotionId('03')).toBe(true);
    expect(isEmotionId(' 03 ')).toBe(true);
    expect(isEmotionId(3)).toBe(true);
    expect(stateForEmotion('34')).toBe('error');
    expect(stateForEmotion(34)).toBe('error');
  });

  it('keeps every declared id parseable', () => {
    for (const id of EMOTION_IDS) expect(isEmotionId(id), id).toBe(true);
  });
});

/* -------------------------------------------------------------- clock */

interface FakeTimer {
  at: number;
  fn: () => void;
  cancelled: boolean;
}

function makeClock() {
  let now = 0;
  let timers: FakeTimer[] = [];
  return {
    now: () => now,
    schedule(fn: () => void, ms: number) {
      const handle: FakeTimer = { at: now + ms, fn, cancelled: false };
      timers.push(handle);
      return handle;
    },
    cancel(handle: unknown) {
      const timer = handle as FakeTimer;
      if (timer) timer.cancelled = true;
    },
    advance(ms: number) {
      const target = now + ms;
      let guard = 0;
      for (;;) {
        if (guard++ > 500) break;
        timers = timers.filter((timer) => !timer.cancelled);
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (!next || next.at > target) break;
        timers.shift();
        now = next.at;
        next.fn();
      }
      now = target;
    },
  };
}

/* --------------------------------------------------------------- queue */

describe('arbiter: event queue', () => {
  it('plays every event that arrives during a dwell instead of keeping one', () => {
    const clock = makeClock();
    const applied: string[] = [];
    const arb = createArbiter({
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
      minDisplayMs: 100,
      autoTick: false,
      onApply: (result) => applied.push(result.state),
    });

    arb.update({ sessionId: 'a', emotionId: '34' }); // error 80, an event
    expect(applied).toEqual(['idle', 'error']);

    // Both arrive during error's dwell and are both outranked by it.
    arb.update({ sessionId: 'b', emotionId: '50' }); // notifying 48
    arb.update({ sessionId: 'c', emotionId: '13' }); // surprised 55
    expect(applied).toEqual(['idle', 'error']);

    clock.advance(100);
    expect(applied).toEqual(['idle', 'error', 'surprised']);

    clock.advance(100);
    expect(applied).toEqual(['idle', 'error', 'surprised', 'notifying']);

    arb.dispose();
  });

  it('falls back to the highest-priority condition once the queue drains', () => {
    const clock = makeClock();
    const applied: string[] = [];
    const arb = createArbiter({
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
      minDisplayMs: 100,
      autoTick: false,
      onApply: (result) => applied.push(result.state),
    });

    arb.update({ sessionId: 'work', emotionId: '30' }); // thinking 30, continuous
    arb.update({ sessionId: 'boom', emotionId: '34' }); // error 80, urgent
    expect(applied).toEqual(['idle', 'thinking', 'error']);

    clock.advance(100);
    clock.advance(100);
    // "done" is a moment, not a mode: the ball returns to what is happening.
    expect(applied[applied.length - 1]).toBe('error');
    arb.remove('boom');
    clock.advance(100);
    expect(applied[applied.length - 1]).toBe('thinking');
    arb.dispose();
  });

  it('orders equal priorities by arrival', () => {
    const clock = makeClock();
    const applied: string[] = [];
    const arb = createArbiter({
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
      minDisplayMs: 100,
      autoTick: false,
      priority: { ...DEFAULT_PRIORITY, notifying: 50, receiving: 50 },
      onApply: (result) => applied.push(result.state),
    });

    arb.update({ sessionId: 'hold', emotionId: '34' }); // error 80 holds the screen
    arb.update({ sessionId: 'first', emotionId: '50' }); // notifying 50
    arb.update({ sessionId: 'second', emotionId: '31' }); // receiving 50

    clock.advance(100);
    expect(applied).toEqual(['idle', 'error', 'notifying']);
    clock.advance(100);
    expect(applied).toEqual(['idle', 'error', 'notifying', 'receiving']);
    arb.dispose();
  });
});

/* ----------------------------------------------------------------- ttl */

describe('arbiter: session expiry', () => {
  it('sweeps by itself, so a host that never calls tick still recovers', () => {
    const clock = makeClock();
    const arb = createArbiter({
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
      sessionTtlMs: 4000,
      minDisplayMs: 10,
      autoTick: true,
    });
    arb.update({ sessionId: 'ghost', emotionId: '32' });
    expect(arb.sessions().size).toBe(1);
    clock.advance(6000);
    expect(arb.sessions().size).toBe(0);
    arb.dispose();
  });

  it('leaves sweeping to the host when autoTick is off', () => {
    const clock = makeClock();
    const arb = createArbiter({
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
      sessionTtlMs: 4000,
      minDisplayMs: 10,
      autoTick: false,
    });
    arb.update({ sessionId: 'ghost', emotionId: '32' });
    clock.advance(6000);
    expect(arb.sessions().size).toBe(1);
    arb.tick();
    expect(arb.sessions().size).toBe(0);
    arb.dispose();
  });

  it('stops its own interval on dispose', () => {
    const clock = makeClock();
    const arb = createArbiter({
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
      sessionTtlMs: 4000,
      minDisplayMs: 10,
    });
    arb.update({ sessionId: 'ghost', emotionId: '32' });
    arb.dispose();
    // dispose() clears its sessions and cancels the sweep; nothing may come
    // back afterwards.
    expect(arb.sessions().size).toBe(0);
    clock.advance(20000);
    expect(arb.sessions().size).toBe(0);
  });
});
