import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DEFAULT_CAST, normalizeCastId } = require('../src/main/cast-state.js');

const CAST_IDS = ['tot', 'pear', 'star', 'moon'];

describe('cast state', () => {
  it('defaults to Tot', () => {
    assert.equal(DEFAULT_CAST, 'tot');
    assert.equal(normalizeCastId(undefined, CAST_IDS), 'tot');
    assert.equal(normalizeCastId('', CAST_IDS), 'tot');
    assert.equal(normalizeCastId('   ', CAST_IDS), 'tot');
  });

  it('keeps known members and normalizes stale values to Tot', () => {
    assert.equal(normalizeCastId('star', CAST_IDS), 'star');
    assert.equal(normalizeCastId('  moon  ', CAST_IDS), 'moon');
    assert.equal(normalizeCastId('removed-member', CAST_IDS), 'tot');
    assert.equal(normalizeCastId(42, CAST_IDS), 'tot');
  });

  it('still resolves Tot to Tot when the engine table is unavailable', () => {
    assert.equal(normalizeCastId('tot'), 'tot');
    assert.equal(normalizeCastId('star'), 'tot');
  });
});
