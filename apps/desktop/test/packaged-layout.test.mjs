import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  applyPackagedLauncher,
  LAUNCHER_NAME,
  RUNTIME_NAME,
} from '../scripts/packaged-layout.mjs';

describe('packaged launcher layout', () => {
  it('renames Electron to the runtime and installs the wrapper at the product path', () => {
    const root = mkdtempSync(join(tmpdir(), 'emojitot-packaged-layout-'));
    const launcher = join(root, 'compiled-launcher.exe');
    writeFileSync(join(root, LAUNCHER_NAME), 'electron runtime');
    writeFileSync(launcher, 'native launcher');
    try {
      applyPackagedLauncher({ appOutDir: root, launcherPath: launcher });
      assert.equal(readFileSync(join(root, RUNTIME_NAME), 'utf8'), 'electron runtime');
      assert.equal(readFileSync(join(root, LAUNCHER_NAME), 'utf8'), 'native launcher');
      assert.equal(existsSync(launcher), true, 'the build source is copied, not moved');
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});
