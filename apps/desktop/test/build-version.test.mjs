import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveBuildVersion } from '../src/main/build-version.js';

describe('runtime build version', () => {
  it('shows the generated four-part build identity', () => {
    assert.equal(
      resolveBuildVersion('0.8.18', { version: '0.8.18', buildVersion: '0.8.18.37' }),
      '0.8.18.37',
    );
  });

  it('falls back to the package version for development launches or stale metadata', () => {
    assert.equal(resolveBuildVersion('0.8.18', null), '0.8.18');
    assert.equal(
      resolveBuildVersion('0.8.18', { version: '0.8.17', buildVersion: '0.8.17.9' }),
      '0.8.18',
    );
  });
});
