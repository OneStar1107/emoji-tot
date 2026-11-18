import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nextAgentMtime } from '../src/main/agent-file.js';

describe('agent status files', () => {
  it('retries the same mtime after a partial write', () => {
    assert.equal(nextAgentMtime(10, 20, null), 10);
  });

  it('accepts a successfully parsed update', () => {
    assert.equal(nextAgentMtime(10, 20, { status: 'running' }), 20);
  });
});
