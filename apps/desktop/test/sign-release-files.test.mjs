import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';

import { signingConfigFromEnv } from '../scripts/sign-release-files.mjs';

describe('release signing configuration', () => {
  it('is disabled when no certificate is configured', () => {
    assert.equal(signingConfigFromEnv({}), null);
  });

  it('accepts a local certificate path', () => {
    const root = mkdtempSync(join(tmpdir(), 'emojitot-signing-'));
    const certificate = join(root, 'certificate.pfx');
    try {
      writeFileSync(certificate, 'test');
      const config = signingConfigFromEnv({
        WIN_CSC_LINK: certificate,
        WIN_CSC_KEY_PASSWORD: 'secret',
      });
      assert.equal(config.certificateFile, certificate);
      assert.equal(config.certificatePassword, 'secret');
      assert.deepEqual(config.hashes, ['sha256']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts a file URL', () => {
    const root = mkdtempSync(join(tmpdir(), 'emojitot-signing-url-'));
    const certificate = join(root, 'certificate.pfx');
    try {
      writeFileSync(certificate, 'test');
      const config = signingConfigFromEnv({ CSC_LINK: pathToFileURL(certificate).href });
      assert.equal(config.certificateFile, certificate);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
