import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function patched(request) {
  if (request === 'electron') {
    return { app: { getPath: () => process.cwd() } };
  }
  return originalLoad.apply(this, arguments);
};
const { parsePresence } = require('../src/main/services/agent-presence.js');

describe('agent process presence', () => {
  it('turns the watcher counts into booleans without exposing command lines', () => {
    assert.deepEqual(
      parsePresence('{"dsh":0,"claude":2,"codex":1}'),
      { dsh: false, claude: true, codex: true },
    );
  });

  it('ignores malformed or partial watcher output', () => {
    assert.equal(parsePresence('not json'), null);
    assert.equal(parsePresence('{"dsh":1}'), null);
  });
});
