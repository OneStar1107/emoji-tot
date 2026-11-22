import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { nextBuildInfo } from './build-info-lib.mjs';

describe('four-part local build identity', () => {
  it('increments the fourth segment for repeated builds of the same version', () => {
    const next = nextBuildInfo({ version: '0.8.18', previous: { version: '0.8.18', number: 7 } });
    assert.deepEqual(next, { version: '0.8.18', number: 8, buildVersion: '0.8.18.8' });
  });

  it('starts from one when the public version changes', () => {
    const next = nextBuildInfo({ version: '0.9.0', previous: { version: '0.8.18', number: 42 } });
    assert.deepEqual(next, { version: '0.9.0', number: 1, buildVersion: '0.9.0.1' });
  });

  it('accepts a CI-provided build number without incrementing the local counter', () => {
    const next = nextBuildInfo({
      version: '0.9.0',
      previous: { version: '0.9.0', number: 3 },
      explicitNumber: '51',
    });
    assert.deepEqual(next, { version: '0.9.0', number: 51, buildVersion: '0.9.0.51' });
  });
});
