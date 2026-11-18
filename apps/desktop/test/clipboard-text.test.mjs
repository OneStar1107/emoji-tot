import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readClipboardText } = require('../src/main/services/clipboard-text.js');

describe('clipboard text boundary', () => {
  it('accepts strings and rejects non-string clipboard values', () => {
    assert.equal(readClipboardText(() => 'hello'), 'hello');
    assert.equal(readClipboardText(() => Buffer.from('hello')), '');
    assert.equal(readClipboardText(() => ({ text: 'hello' })), '');
  });

  it('turns a clipboard read failure into empty text', () => {
    assert.equal(readClipboardText(() => { throw new Error('busy'); }), '');
  });
});
