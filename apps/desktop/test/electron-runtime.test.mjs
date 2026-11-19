import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { isAsciiPath, runtimeCachePath } from '../scripts/electron-runtime.mjs';

describe('Electron runtime path compatibility', () => {
  it('detects non-ASCII executable paths', () => {
    assert.equal(isAsciiPath('C:/Users/example/app/electron.exe'), true);
    assert.equal(isAsciiPath('E:/项目/EmojiTot/electron.exe'), false);
  });

  // The platform is spelled out instead of read from process.platform: the
  // off-Windows suffix is real behaviour, and asserting only the win32 shape
  // against whatever machine runs the tests failed on Linux CI.
  it('builds a stable ASCII cache path outside the project', () => {
    assert.equal(
      runtimeCachePath('C:/Cache', '45.3.4', 'abc123', 'win32'),
      join('C:/Cache', 'electron-45.3.4-abc123'),
    );
  });

  it('keeps the platform in the folder name off Windows', () => {
    assert.equal(
      runtimeCachePath('C:/Cache', '45.3.4', 'abc123', 'linux'),
      join('C:/Cache', 'electron-45.3.4-abc123-linux'),
    );
  });
});
