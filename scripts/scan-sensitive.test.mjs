import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { emailAllowed } from './scan-sensitive.mjs';

describe('sensitive scan: published contact addresses', () => {
  it('allows the project contact address that the README intentionally publishes', () => {
    assert.equal(emailAllowed('hyx110702@163.com'), true);
  });

  it('still allows the existing generic documentation addresses', () => {
    assert.equal(emailAllowed('you@example.com'), true);
    assert.equal(emailAllowed('noreply@github.com'), true);
  });

  it('flags an unrelated personal address', () => {
    assert.equal(emailAllowed(['alice', 'private-mail.test'].join('@')), false);
  });
});
