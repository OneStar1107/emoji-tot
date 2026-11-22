import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createFullscreenGuard } from '../src/main/fullscreen-guard.js';

describe('fullscreen confirmation', () => {
  it('ignores one transient screenshot-like sample in either direction', () => {
    const guard = createFullscreenGuard({ hideAfter: 2, showAfter: 2 });
    assert.equal(guard.push(true), null);
    assert.equal(guard.push(true), 'hide');
    assert.equal(guard.push(false), null);
    assert.equal(guard.push(false), 'show');
  });

  it('does not repeat an edge that is already active', () => {
    const guard = createFullscreenGuard({ hideAfter: 2, showAfter: 2 });
    assert.equal(guard.push(true), null);
    assert.equal(guard.push(true), 'hide');
    assert.equal(guard.push(true), null);
    assert.equal(guard.push(false), null);
    assert.equal(guard.push(false), 'show');
    assert.equal(guard.push(false), null);
  });
});
