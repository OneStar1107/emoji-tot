import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  SHIPPING_PACKAGE_FILES,
  syncPackageVersions,
} from './package-version-lib.mjs';

describe('workspace package versions', () => {
  it('sets every shipping package to the public application version', () => {
    const root = mkdtempSync(join(tmpdir(), 'emojitot-package-versions-'));
    const files = SHIPPING_PACKAGE_FILES;
    try {
      for (const file of files) {
        const path = join(root, file);
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, JSON.stringify({ name: file, version: '0.0.1' }, null, 2) + '\n');
      }
      syncPackageVersions({ rootDir: root, version: '0.9.0', files });
      for (const file of files) {
        assert.equal(JSON.parse(readFileSync(join(root, file), 'utf8')).version, '0.9.0');
      }
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});
