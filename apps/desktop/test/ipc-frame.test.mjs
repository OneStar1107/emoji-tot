import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { frameMatches } from '../src/main/ipc-frame.js';

describe('IPC sender frames', () => {
  it('accepts only the local page assigned to that role', () => {
    assert.equal(
      frameMatches('island', 'file:///C:/app/renderer/island.html'),
      true,
    );
    assert.equal(
      frameMatches('island', 'file:///C:/app/renderer/settings.html'),
      false,
    );
  });

  it('rejects an empty or foreign frame', () => {
    assert.equal(frameMatches('island', ''), false);
    assert.equal(
      frameMatches('island', 'https://example.com/renderer/island.html'),
      false,
    );
  });
});
