import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  auditRuntimePlan,
  removeStagedAuditRuntime,
  stageAsciiAuditRuntime,
} from '../scripts/audit-runtime.mjs';

describe('UI audit runtime staging', () => {
  it('leaves an ASCII executable where it is', () => {
    const plan = auditRuntimePlan('C:\\EmojiTot\\EmojiTot.exe', 'win32');
    assert.equal(plan.needsStage, false);
    assert.equal(plan.exe, 'C:\\EmojiTot\\EmojiTot.exe');
  });

  it('stages a Windows executable whose path contains non-ASCII characters', () => {
    const plan = auditRuntimePlan('C:\\项目\\EmojiTot\\EmojiTot.exe', 'win32');
    assert.equal(plan.needsStage, true);
  });

  it('copies the whole distribution and returns an ASCII executable path', () => {
    const testRoot = mkdtempSync(join(tmpdir(), 'emojitot-runtime-test-'));
    const source = join(testRoot, '项目', 'EmojiTot');
    const stageBase = join(testRoot, 'staging');
    mkdirSync(source, { recursive: true });
    mkdirSync(stageBase, { recursive: true });
    writeFileSync(join(source, 'EmojiTot.exe'), 'fixture executable');
    writeFileSync(join(source, 'resources.pak'), 'fixture resource');

    let staged = null;
    try {
      staged = stageAsciiAuditRuntime(join(source, 'EmojiTot.exe'), {
        baseDir: stageBase,
        platform: 'win32',
      });
      assert.equal(staged.staged, true);
      assert.match(staged.exe, /^[\x00-\x7F]+$/);
      assert.equal(readFileSync(staged.exe, 'utf8'), 'fixture executable');
      assert.equal(readFileSync(join(staged.stagingDir, 'resources.pak'), 'utf8'), 'fixture resource');
    } finally {
      if (staged?.stagingDir) removeStagedAuditRuntime(staged);
      rmSync(testRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
    assert.equal(staged ? existsSync(staged.stagingDir) : false, false);
  });
});

describe('desktop packaging runtime', () => {
  it('uses the installed Electron distribution instead of downloading it again', () => {
    const desktopRoot = fileURLToPath(new URL('..', import.meta.url));
    const pkg = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8'));
    const electronBinary =
      process.platform === 'win32'
        ? 'electron.exe'
        : process.platform === 'darwin'
          ? 'Electron.app/Contents/MacOS/Electron'
          : 'electron';
    assert.equal(pkg.build.electronDist, 'node_modules/electron/dist');
    assert.equal(existsSync(resolve(desktopRoot, pkg.build.electronDist, electronBinary)), true);
  });
});
