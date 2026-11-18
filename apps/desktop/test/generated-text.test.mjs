import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGeneratedText } from '../../../scripts/generated-text.mjs';

describe('generated documentation comparison', () => {
  it('treats LF and CRLF versions of the same generated file as equal', () => {
    const lf = '# title\n\nline\n';
    const crlf = '# title\r\n\r\nline\r\n';
    assert.equal(normalizeGeneratedText(crlf), normalizeGeneratedText(lf));
  });

  it('still notices a content change', () => {
    assert.notEqual(
      normalizeGeneratedText('old\r\n'),
      normalizeGeneratedText('new\n'),
    );
  });
});
