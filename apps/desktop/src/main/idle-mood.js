/**
 * The idle mood clock — the pet borrowing an expression while nothing happens.
 *
 * The renderer used to own this. It picked a face, painted it, and reported it
 * back so the island could follow; 0.6.3 made the main process the only owner
 * of the face but the clock itself was dropped in that merge, so an idle pet
 * has been stuck on `idle` ever since. This is that rule, moved to the side
 * that owns the face: every 7–16 seconds the pet borrows one resting
 * expression, holds it for 1.8–4.4 seconds and hands it back.
 *
 * Rules carried over from the renderer implementation (0.6.2, renderer.js):
 *
 *   - a shuffled queue instead of a random pick, so two consecutive moods are
 *     never the same and every mood appears once per cycle;
 *   - the wait and the hold are both random, because a fixed beat reads as a
 *     metronome;
 *   - nothing borrows while a higher-priority source is on screen, the pet is
 *     being dragged, or the window is hidden (a mood nobody can see is only a
 *     race waiting to overwrite the next real state).
 *
 * What changed: the pool is the resting set only. The old idle pool also
 * contained the whole emotion group, which meant an idle pet could suddenly
 * look sad or angry for two seconds with nothing having happened. A work
 * statement belongs to an agent status, a media reaction belongs to the media
 * source, and an error face belongs to a failure; this clock may only use the
 * in-between expressions.
 *
 * Clock, timers and randomness are injectable so the unit tests can pin the
 * timing down instead of sleeping through a real minute.
 */

/** The resting expressions the pet may borrow, in table order. */
const IDLE_MOODS = Object.freeze([
  'bored', // 发呆
  'drowsy', // 困倦
  'spacing-out', // 放空
  'curious', // 好奇
  'humming', // 哼歌
]);

/** Every borrow waits 7–16 seconds, measured from the previous borrow. */
const BORROW_MIN_MS = 7000;
const BORROW_SPAN_MS = 9000;

/** A borrowed mood is held for 1.8–4.4 seconds, then handed back. */
const HOLD_MIN_MS = 1800;
const HOLD_SPAN_MS = 2600;

/**
 * @param {{
 *   schedule?: (fn: () => void, ms: number) => unknown,
 *   cancel?: (handle: unknown) => void,
 *   random?: () => number,
 *   pool?: string[],
 *   canBorrow?: () => boolean,
 *   onBorrow?: (state: string) => void,
 *   onReturn?: (state: string) => void,
 * }} [options]
 */
function createIdleMoods(options = {}) {
  const schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle));
  const random = options.random ?? Math.random;
  const pool = Array.isArray(options.pool) && options.pool.length ? options.pool.slice() : IDLE_MOODS.slice();
  const canBorrow = options.canBorrow ?? (() => true);
  const onBorrow = options.onBorrow ?? (() => {});
  const onReturn = options.onReturn ?? (() => {});

  let running = false;
  /** The next-borrow timer. At most one of these exists. */
  let timer = null;
  /** The hold timer for the mood that is on screen. At most one of these. */
  let holdTimer = null;
  /** The state currently borrowed from the pool, or null. */
  let borrowed = null;
  /** Remaining shuffled moods; refilled when empty. */
  let bag = [];
  /** The last borrowed state, so a reshuffle cannot repeat it immediately. */
  let last = '';

  function clearTimer(handle) {
    if (handle != null) cancel(handle);
    return null;
  }

  function refillBag() {
    const next = pool.filter((state) => state !== last);
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    bag = next;
  }

  /** Draw without replacement; null when the pool has nothing new to offer. */
  function pick() {
    if (!bag.length) refillBag();
    // A one-entry pool cannot honour "never twice in a row"; repeating is the
    // lesser failure compared with a clock that never borrows again.
    if (!bag.length) bag = pool.slice();
    if (!bag.length) return null;
    const state = bag.pop();
    last = state;
    return state;
  }

  function release() {
    holdTimer = clearTimer(holdTimer);
    if (!borrowed) return;
    const state = borrowed;
    borrowed = null;
    onReturn(state);
  }

  function armNext() {
    timer = clearTimer(timer);
    timer = schedule(tick, BORROW_MIN_MS + random() * BORROW_SPAN_MS);
  }

  function tick() {
    timer = null;
    if (!running) return;
    let allowed = false;
    try {
      allowed = Boolean(canBorrow());
    } catch {
      allowed = false; // a broken predicate must not stop the clock
    }
    if (!allowed) {
      armNext();
      return;
    }
    const state = pick();
    if (!state) {
      armNext();
      return;
    }
    borrowed = state;
    try {
      onBorrow(state);
    } catch {
      // A throwing consumer must not leave the clock dead.
    }
    holdTimer = schedule(() => {
      holdTimer = null;
      release();
    }, HOLD_MIN_MS + random() * HOLD_SPAN_MS);
    armNext();
  }

  return {
    /** Start ticking. Idempotent. */
    start() {
      if (running) return;
      running = true;
      armNext();
    },
    /** Stop, and hand back a mood that is still on screen. */
    stop() {
      running = false;
      timer = clearTimer(timer);
      release();
    },
    /** Follow the settings switch: off stops the clock, on restarts it. */
    setEnabled(enabled) {
      if (enabled) this.start();
      else this.stop();
    },
    /** Is the clock armed? */
    isRunning: () => running,
    /** Is an expression borrowed right now? */
    isBorrowing: () => borrowed !== null,
    /** The pool, exposed so a test can assert what may be borrowed. */
    pool: () => pool.slice(),
  };
}

module.exports = { createIdleMoods, IDLE_MOODS, BORROW_MIN_MS, BORROW_SPAN_MS, HOLD_MIN_MS, HOLD_SPAN_MS };
