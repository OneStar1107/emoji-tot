/**
 * One face, two windows.
 *
 * The face used to be invented in the ball renderer and reported back through
 * the main process. Both windows then relayed whatever the other one said, so
 * a report that arrived after the next change repainted the island with a face
 * the ball no longer wore — the drift the user saw.
 *
 * Here the main process owns the only face: a state, where it came from and
 * when it changed. Every change is one payload sent to every subscriber; a
 * subscriber that arrives late is handed the current value at once, which is
 * what a reloaded or reconnected window needs. Nothing in this file imports
 * Electron, so the ordering and reconnect guarantees can be tested without
 * starting the app.
 */

/** A face name is a protocol state, never a payload: clip it to something sane. */
const MAX_STATE_LENGTH = 32;

/**
 * @param {{ now?: () => number }} [options] injectable clock, for tests.
 */
function createFaceBus({ now = Date.now } = {}) {
  let current = { state: 'idle', source: 'boot', at: now(), seq: 0 };
  const subscribers = new Set();

  const snapshot = () => ({ ...current });

  function publish() {
    const payload = snapshot();
    for (const subscriber of subscribers) {
      try {
        subscriber(payload);
      } catch {
        /* A dead window must not stop the other one from painting. */
      }
    }
    return payload;
  }

  return {
    /** The face both windows should be wearing right now. */
    current: snapshot,

    /**
     * Publish a new face.
     *
     * Returns null for anything that is not a state string. An identical
     * state from the same source is not a change and is not broadcast again.
     * `extra` carries presentation that belongs to the same change (the
     * motion that plays with a borrowed mood); it can never override the
     * identity fields.
     */
    set(state, source = 'host', extra = null) {
      const next = typeof state === 'string' ? state.trim().slice(0, MAX_STATE_LENGTH) : '';
      if (!next) return null;
      if (next === current.state && source === current.source) return snapshot();
      current = { state: next, source, at: now(), seq: current.seq + 1 };
      if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
        for (const [key, value] of Object.entries(extra)) {
          if (key === 'state' || key === 'source' || key === 'at' || key === 'seq') continue;
          if (value === undefined) continue;
          current[key] = value;
        }
      }
      return publish();
    },

    /**
     * Attach a renderer. The current value is delivered immediately — before
     * this call returns — so a page that just reloaded paints the same face
     * the other window is already wearing instead of waiting for a change.
     * The returned function detaches the subscriber.
     */
    attach(subscriber) {
      if (typeof subscriber !== 'function') return () => {};
      subscribers.add(subscriber);
      subscriber(snapshot());
      return () => subscribers.delete(subscriber);
    },

    /**
     * Re-deliver the current face without it being a change.
     *
     * A renderer that finished loading after a broadcast missed it; resending
     * the snapshot is how it catches up. Sequence and timestamp do not move.
     */
    resend() {
      return publish();
    },
  };
}

module.exports = { createFaceBus, MAX_STATE_LENGTH };
