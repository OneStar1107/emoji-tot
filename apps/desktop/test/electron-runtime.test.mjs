import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  copyDirectorySync,
  isAsciiPath,
  runtimeCachePath,
} from '../scripts/electron-runtime.mjs';

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

describe('ASCII runtime directory copy', () => {
  /*
   * `fs.cpSync` hard-crashes Node on Windows when the source path is
   * non-ASCII, so the staging copy must stay on primitive fs calls. The old
   * failure killed the whole test process rather than failing an assertion,
   * so this fixture deliberately keeps a Chinese directory in the source.
   */
  it('copies nested files out of a non-ASCII source tree', () => {
    const testRoot = mkdtempSync(join(tmpdir(), 'emojitot-copy-test-'));
    try {
      const source = join(testRoot, '项目', 'EmojiTot', 'dist');
      const destination = join(testRoot, 'ascii-cache', 'dist');
      mkdirSync(join(source, 'locales', 'zh-CN'), { recursive: true });
      writeFileSync(join(source, 'electron.exe'), 'fixture executable');
      writeFileSync(join(source, 'resources.pak'), 'fixture resource');
      writeFileSync(join(source, 'locales', 'zh-CN', '名字.pak'), '嵌套中文 fixture');

      assert.equal(isAsciiPath(source), false, 'the source must stay non-ASCII');
      assert.equal(existsSync(destination), false, 'the destination starts empty');

      copyDirectorySync(source, destination);

      assert.equal(readFileSync(join(destination, 'electron.exe'), 'utf8'), 'fixture executable');
      assert.equal(readFileSync(join(destination, 'resources.pak'), 'utf8'), 'fixture resource');
      assert.equal(
        readFileSync(join(destination, 'locales', 'zh-CN', '名字.pak'), 'utf8'),
        '嵌套中文 fixture',
      );
      assert.ok(lstatSync(join(destination, 'locales')).isDirectory());
    } finally {
      rmSync(testRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
    assert.equal(existsSync(testRoot), false);
  });

  it('preserves symlinks verbatim when the platform allows creating them', () => {
    const testRoot = mkdtempSync(join(tmpdir(), 'emojitot-copy-symlink-test-'));
    try {
      const source = join(testRoot, '项目', 'dist');
      const destination = join(testRoot, 'ascii-cache', 'dist');
      mkdirSync(source, { recursive: true });
      writeFileSync(join(source, 'target.pak'), 'symlink target');
      try {
        symlinkSync('target.pak', join(source, 'link.pak'), 'file');
      } catch (error) {
        // Windows needs Developer Mode / SeCreateSymbolicLinkPrivilege to make
        // symlinks; skip this optional case instead of failing the suite.
        if (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'UNKNOWN') return;
        throw error;
      }

      copyDirectorySync(source, destination);

      const copiedLink = join(destination, 'link.pak');
      assert.equal(lstatSync(copiedLink).isSymbolicLink(), true);
      assert.equal(readlinkSync(copiedLink), 'target.pak');
      assert.equal(readFileSync(copiedLink, 'utf8'), 'symlink target');
    } finally {
      rmSync(testRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});
