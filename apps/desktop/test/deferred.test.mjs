import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defer } from '../src/main/deferred.js';

describe('deferred work', () => {
  it('returns a cancel function for the timer it created', () => {
    let scheduled = null;
    let cancelled = null;
    const cancel = defer(
      () => {},
      2500,
      (fn, ms) => {
        scheduled = { fn, ms };
        return 17;
      },
      (handle) => {
        cancelled = handle;
      },
    );

    assert.deepEqual({ ms: scheduled.ms }, { ms: 2500 });
    cancel();
    assert.equal(cancelled, 17);
  });
});
