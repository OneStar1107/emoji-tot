import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { isAsciiPath, runtimeCachePath } from '../scripts/electron-runtime.mjs';

describe('Electron runtime path compatibility', () => {
  it('detects non-ASCII executable paths', () => {
    assert.equal(isAsciiPath('C:/Users/example/app/electron.exe'), true);
    assert.equal(isAsciiPath('E:/项目/EmojiTot/electron.exe'), false);
  });

  it('builds a stable ASCII cache path outside the project', () => {
    assert.equal(
      runtimeCachePath('C:/Cache', '45.3.4', 'abc123', process.platform),
      join('C:/Cache', 'electron-45.3.4-abc123'),
    );
  });
});
