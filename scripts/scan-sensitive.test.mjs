import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { emailAllowed, parseReleaseCandidates } from './scan-sensitive.mjs';

describe('sensitive scan: release-candidate inventory', () => {
  it('combines tracked, staged, and untracked paths from Git output', () => {
    const output = 'tracked.md\0staged.png\0untracked.png\0';
    assert.deepEqual(parseReleaseCandidates(output), [
      'tracked.md',
      'staged.png',
      'untracked.png',
    ]);
  });

  it('normalizes separators and removes duplicate paths', () => {
    const output = 'docs\\capture.png\0docs/capture.png\0';
    assert.deepEqual(parseReleaseCandidates(output), ['docs/capture.png']);
  });
});

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
