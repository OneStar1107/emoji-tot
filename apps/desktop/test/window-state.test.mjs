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
});
