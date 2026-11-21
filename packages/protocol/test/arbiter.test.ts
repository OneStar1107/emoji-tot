import { describe, expect, it } from 'vitest';
import { createArbiter } from '../src/arbiter.js';

/** A deterministic clock so the dwell and expiry rules are testable. */
function harness(options: Parameters<typeof createArbiter>[0] = {}) {
  let now = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const applied: string[] = [];
  const arbiter = createArbiter({
    minDisplayMs: 100,
    sessionTtlMs: 1000,
    now: () => now,
    schedule: (fn, ms) => {
      const timer = { at: now + ms, fn };
      timers.push(timer);
      return timer;
    },
    cancel: (handle) => {
      const i = timers.indexOf(handle as { at: number; fn: () => void });
      if (i >= 0) timers.splice(i, 1);
    },
    onApply: (r) => applied.push(r.emotionId),
    ...options,
  });
  // The arbiter publishes its idle frame on construction; those assertions
  // are about what happens *after* an update, so start from a clean log.
  applied.length = 0;
  const advance = (ms: number) => {
    const target = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > target) break;
      timers.shift();
      now = next.at;
      next.fn();
    }
    now = target;
  };
  return { arbiter, advance, applied, now: () => now };
}

describe('createArbiter', () => {
  it('shows the highest-priority visible session', () => {
    const { arbiter } = harness();
    arbiter.update({ sessionId: 'a', emotionId: '30' }); // thinking
    arbiter.update({ sessionId: 'b', emotionId: '34' }); // error
    expect(arbiter.current()?.emotionId).toBe('34');
  });

  it('ignores headless sessions when choosing what to show', () => {
    const { arbiter } = harness();
    arbiter.update({ sessionId: 'bg', emotionId: '34', headless: true });
    expect(arbiter.current()?.emotionId).toBe('02');
  });

  it('holds a state for the minimum dwell', () => {
    const { arbiter, advance } = harness();
    arbiter.update({ sessionId: 'a', emotionId: '30' });
    arbiter.update({ sessionId: 'a', emotionId: '40' });
    // Still inside the dwell: the first state stays.
    expect(arbiter.current()?.emotionId).toBe('30');
    advance(100);
    expect(arbiter.current()?.emotionId).toBe('40');
  });

  it('lets an urgent event interrupt the dwell', () => {
    const { arbiter } = harness();
    arbiter.update({ sessionId: 'a', emotionId: '30' }); // thinking
    arbiter.update({ sessionId: 'b', emotionId: '34' }); // error outranks it
    expect(arbiter.current()?.emotionId).toBe('34');
  });

  it('queues a less urgent event that arrives during a dwell', () => {
    const { arbiter, advance, applied } = harness();
    arbiter.update({ sessionId: 'a', emotionId: '33' }); // done (60)
    arbiter.update({ sessionId: 'b', emotionId: '50' }); // notifying (48)
    expect(applied).toEqual(['33']);
    advance(100);
    expect(applied).toContain('50');
  });

  it('expires silent sessions and falls back to idle', () => {
    const { arbiter, advance } = harness();
    arbiter.update({ sessionId: 'a', emotionId: '34' });
    expect(arbiter.current()?.emotionId).toBe('34');
    advance(1001);
    arbiter.tick();
    expect(arbiter.current()?.emotionId).toBe('02');
  });

  it('notifies subscribers and unsubscribes', () => {
    const { arbiter } = harness();
    const seen: string[] = [];
    const off = arbiter.subscribe((r) => seen.push(r.emotionId));
    arbiter.update({ sessionId: 'a', emotionId: '10' });
    off();
    arbiter.update({ sessionId: 'a', emotionId: '21' });
    // subscribe() replays the current frame first, so the idle one is in here.
    expect(seen).toEqual(['02', '10']);
  });

  it('remove() releases the screen', () => {
    const { arbiter, advance } = harness();
    arbiter.update({ sessionId: 'a', emotionId: '34' });
    advance(100);
    arbiter.remove('a');
    advance(100);
    expect(arbiter.current()?.emotionId).toBe('02');
  });
});
