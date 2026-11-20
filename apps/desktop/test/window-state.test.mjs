/**
 * Window preferences should not depend on incidental runtime state.
 *
 * The pointer watcher describes where the cursor is; it does not own the
 * user's decision about whether clicks may pass through at all.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  passThroughFor,
  passThroughWhileDragging,
  sameDisplayId,
} from '../src/main/window-state.js';

describe('window preferences', () => {
  it('keeps click-through off when the user disabled it', () => {
    assert.equal(passThroughFor(false, true), false);
    assert.equal(passThroughFor(false, false), false);
  });

  it('passes through only outside the character when enabled', () => {
    assert.equal(passThroughFor(true, true), false);
    assert.equal(passThroughFor(true, false), true);
  });

  it('matches numeric and persisted string display ids', () => {
    assert.equal(sameDisplayId(42, 42), true);
    assert.equal(sameDisplayId(42, '42'), true);
    assert.equal(sameDisplayId('42', 42), true);
    assert.equal(sameDisplayId(42, '43'), false);
    assert.equal(sameDisplayId(42, null), false);
  });

  /*
   * The regression this exists for: the ball would not let go.
   *
   * Mid-drag the window follows the cursor, so the grab point lags a few pixels
   * and the ball test says "outside". Passing clicks through there takes the
   * pointerup away from the page, which never reports drag:end — the ball then
   * follows the cursor forever. Whatever the pointer says, a drag keeps the
   * window opaque to the mouse.
   */
  it('never passes clicks through while a drag is live', () => {
    assert.equal(passThroughWhileDragging(true, true, true), false);
    assert.equal(passThroughWhileDragging(true, true, false), false);
    assert.equal(passThroughWhileDragging(true, false, false), false);
  });

  it('falls back to the pointer and the preference when nothing is dragged', () => {
    assert.equal(passThroughWhileDragging(false, true, true), false);
    assert.equal(passThroughWhileDragging(false, true, false), true);
    assert.equal(passThroughWhileDragging(false, false, false), false);
  });
});
