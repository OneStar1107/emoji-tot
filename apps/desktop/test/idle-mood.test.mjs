/**
 * The idle mood clock, pinned to a fake clock.
 *
 * What the user sees is a pet that comes alive when nothing is happening: a
 * resting expression borrowed every 7–16 seconds and given back after 1.8–4.4.
 * These tests replace the wall clock and the timers so the bounds can be
 * asserted exactly, without waiting through a minute of real time.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { FACE_META } from '../src/renderer/vendor/core/index.js';

const require = createRequire(import.meta.url);
const {
  createIdleMoods,
  IDLE_MOODS,
  BORROW_MIN_MS,
  BORROW_SPAN_MS,
  HOLD_MIN_MS,
  HOLD_SPAN_MS,
} = require('../src/main/idle-mood.js');
const { createFaceBus } = require('../src/main/face-bus.js');

/** A deterministic clock: scheduled callbacks only run when advanced. */
function createClock() {
  let now = 0;
  let seq = 0;
  let peak = 0;
  const timers = new Map();
  const schedule = (fn, ms) => {
    const id = ++seq;
    timers.set(id, { at: now + Math.max(0, ms), fn });
    peak = Math.max(peak, timers.size);
    return id;
  };
  const cancel = (id) => {
    timers.delete(id);
  };
  return {
    now: () => now,
    schedule,
    cancel,
    pending: () => timers.size,
    peak: () => peak,
    /** Run every callback due inside the window, earliest first, then land on its end. */
    advance(ms) {
      const target = now + ms;
      for (;;) {
        let due = null;
        for (const [id, timer] of timers) {
          if (timer.at > target) continue;
          if (!due || timer.at < due.timer.at || (timer.at === due.timer.at && id < due.id)) {
            due = { id, timer };
          }
        }
        if (!due) break;
        timers.delete(due.id);
        now = due.timer.at;
        due.timer.fn();
      }
      now = target;
    },
  };
}

/** A seeded PRNG, so the sequence is repeatable across runs. */
function seeded(seed = 1) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function record(clock) {
  const events = [];
  return {
    events,
    onBorrow: (state) => events.push({ kind: 'borrow', state, at: clock.now() }),
    onReturn: (state) => events.push({ kind: 'return', state, at: clock.now() }),
  };
}

describe('idle moods: timing contract', () => {
  it('borrows every 7–16s and holds each mood 1.8–4.4s', () => {
    const clock = createClock();
    const log = record(clock);
    const idle = createIdleMoods({
      schedule: clock.schedule,
      cancel: clock.cancel,
      random: seeded(7),
      onBorrow: log.onBorrow,
      onReturn: log.onReturn,
    });
    idle.start();
    clock.advance(180_000);
    clock.advance(5_000); // let the last hold finish inside the window

    const borrows = log.events.filter((event) => event.kind === 'borrow');
    assert.ok(borrows.length >= 8, 'a three-minute idle stretch borrows repeatedly');

    // Every borrow is followed by its return, in order, and the gap between
    // two borrows is the interval the user feels.
    for (let i = 0; i < borrows.length; i += 1) {
      const borrow = borrows[i];
      const next = log.events[log.events.indexOf(borrow) + 1];
      assert.ok(next, 'a borrow must be followed by a return');
      assert.equal(next.kind, 'return', 'the clock never borrows twice in a row');
      assert.equal(next.state, borrow.state, 'the same expression is handed back');
      const hold = next.at - borrow.at;
      assert.ok(
        hold >= HOLD_MIN_MS && hold <= HOLD_MIN_MS + HOLD_SPAN_MS,
        'hold ' + hold + 'ms is outside ' + HOLD_MIN_MS + '–' + (HOLD_MIN_MS + HOLD_SPAN_MS) + 'ms',
      );
      if (i > 0) {
        const gap = borrow.at - borrows[i - 1].at;
        assert.ok(
          gap >= BORROW_MIN_MS && gap <= BORROW_MIN_MS + BORROW_SPAN_MS,
          'gap ' + gap + 'ms is outside ' + BORROW_MIN_MS + '–' + (BORROW_MIN_MS + BORROW_SPAN_MS) + 'ms',
        );
      }
    }
  });

  it('draws without replacement, so two moods in a row never match', () => {
    const clock = createClock();
    const log = record(clock);
    const idle = createIdleMoods({
      schedule: clock.schedule,
      cancel: clock.cancel,
      random: seeded(11),
      onBorrow: log.onBorrow,
      onReturn: log.onReturn,
    });
    idle.start();
    clock.advance(120_000);
    const states = log.events.filter((event) => event.kind === 'borrow').map((event) => event.state);
    assert.ok(states.length >= 6);
    for (let i = 1; i < states.length; i += 1) {
      assert.notEqual(states[i], states[i - 1], 'a repeat reads as scripted');
    }
    // A full cycle visits every pool member once.
    const firstCycle = states.slice(0, IDLE_MOODS.length);
    assert.deepEqual([...firstCycle].sort(), [...IDLE_MOODS].sort());
  });
});

describe('idle moods: the pool', () => {
  it('only borrows resting expressions, never agent / media / error faces', () => {
    // The examples from the product brief.
    for (const state of ['bored', 'drowsy', 'spacing-out', 'curious', 'humming']) {
      assert.ok(IDLE_MOODS.includes(state), state + ' must stay borrowable');
    }
    const meta = new Map(FACE_META.map((face) => [face.id, face]));
    for (const state of IDLE_MOODS) {
      assert.ok(meta.has(state), state + ' is not a face the engine can draw');
      const group = meta.get(state).group;
      assert.notEqual(group, 'agent', state + ' is a work state, not a resting one');
      assert.ok(
        !['alerting', 'error', 'focused', 'surprised', 'puzzled'].includes(state),
        state + ' belongs to a media reaction or a failure',
      );
    }
  });
});

describe('idle moods: priority and switches', () => {
  it('never borrows while a higher-priority source is on screen', () => {
    const clock = createClock();
    const log = record(clock);
    let allowed = false;
    const idle = createIdleMoods({
      schedule: clock.schedule,
      cancel: clock.cancel,
      random: () => 0,
      canBorrow: () => allowed,
      onBorrow: log.onBorrow,
      onReturn: log.onReturn,
    });
    idle.start();
    clock.advance(60_000);
    assert.equal(log.events.length, 0, 'a manual / agent / media state owns the face');
    assert.equal(clock.pending(), 1, 'the clock keeps waiting instead of dying');

    allowed = true;
    clock.advance(BORROW_MIN_MS); // random() is pinned to 0: borrow exactly on the floor
    assert.equal(log.events.filter((event) => event.kind === 'borrow').length, 1);

    // Priority returns mid-hold: the hold ends on its own timer, then the clock
    // waits and must not borrow again while the face is owned elsewhere.
    clock.advance(HOLD_MIN_MS);
    assert.equal(log.events.filter((event) => event.kind === 'return').length, 1);
    allowed = false;
    clock.advance(60_000);
    assert.equal(
      log.events.filter((event) => event.kind === 'borrow').length,
      1,
      'no second borrow while the face is owned',
    );
    assert.equal(clock.pending(), 1, 'one waiting timer, not a growing pile');
  });

  it('stops borrowing when the switch is turned off and hands the mood back', () => {
    const clock = createClock();
    const log = record(clock);
    const idle = createIdleMoods({
      schedule: clock.schedule,
      cancel: clock.cancel,
      random: seeded(5),
      onBorrow: log.onBorrow,
      onReturn: log.onReturn,
    });
    idle.setEnabled(true);
    clock.advance(8_000); // first borrow at 7s, hold still running
    assert.equal(log.events.filter((event) => event.kind === 'borrow').length, 1);

    idle.setEnabled(false);
    assert.equal(log.events.filter((event) => event.kind === 'return').length, 1, 'the held mood is released');
    assert.equal(clock.pending(), 0, 'no timer is left behind');
    clock.advance(60_000);
    assert.equal(log.events.filter((event) => event.kind === 'borrow').length, 1, 'off means off');
  });

  it('survives 100 cycles without leaking a timer', () => {
    const clock = createClock();
    const log = record(clock);
    const idle = createIdleMoods({
      schedule: clock.schedule,
      cancel: clock.cancel,
      random: seeded(13),
      onBorrow: log.onBorrow,
      onReturn: log.onReturn,
    });
    idle.start();
    for (let i = 0; i < 100; i += 1) {
      clock.advance(20_000);
      assert.ok(clock.pending() <= 2, 'only the next borrow and the current hold may be armed');
    }
    assert.ok(log.events.filter((event) => event.kind === 'borrow').length >= 100, 'the clock kept going');
    idle.stop();
    assert.equal(clock.pending(), 0, 'stop clears both timers');
    assert.ok(clock.peak() <= 2, 'never more than two live timers at once');
  });
});

describe('idle moods: the face bus contract', () => {
  it('publishes as the lowest-priority source and never stomps a higher one', () => {
    const clock = createClock();
    const bus = createFaceBus();
    let high = false;
    const idle = createIdleMoods({
      schedule: clock.schedule,
      cancel: clock.cancel,
      random: () => 0,
      canBorrow: () => !high,
      onBorrow: (state) => bus.set(state, 'mood', { motion: 'bounce' }),
      onReturn: () => {
        if (bus.current().source === 'mood') bus.set('idle', 'mood');
      },
    });
    const seen = [];
    bus.attach((payload) => seen.push({ state: payload.state, source: payload.source, motion: payload.motion }));

    idle.start();
    clock.advance(BORROW_MIN_MS);

    const borrowed = bus.current();
    assert.equal(borrowed.source, 'mood', 'the borrow goes through the one face bus');
    assert.ok(IDLE_MOODS.includes(borrowed.state), 'only the resting pool reaches the bus');
    assert.equal(borrowed.motion, 'bounce', 'the presentation rides along with the face');

    // A manual preview / agent status / media emotion arrives mid-hold.
    high = true;
    bus.set('working', 'state');
    clock.advance(HOLD_MIN_MS + 2_000);
    assert.equal(bus.current().state, 'working', 'the borrowed mood must not overwrite the real state');
    assert.equal(bus.current().source, 'state');

    // Once the real state clears, the clock comes back — as a mood, then idle.
    high = false;
    bus.set('idle', 'state');
    clock.advance(8_000); // one more borrow lands, holds and returns inside this window
    assert.ok(
      seen.some((payload) => payload.source === 'mood' && IDLE_MOODS.includes(payload.state)),
      'a real borrow reaches the bus once the higher source clears',
    );
    assert.equal(bus.current().source, 'mood', 'the return travels on the same source');
    assert.equal(bus.current().state, 'idle', 'the resident idle face is restored');
  });
});