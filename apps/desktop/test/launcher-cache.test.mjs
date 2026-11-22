import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { buildLauncher } from '../scripts/build-launcher.mjs';

const WINDOWS_ONLY = { skip: process.platform !== 'win32' };

function findCsc() {
  const candidates = [
    process.env.WINDIR && join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    process.env.WINDIR && join(process.env.WINDIR, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? '';
}

function compileRuntime(outFile) {
  const csc = findCsc();
  assert.ok(csc, 'the Windows .NET Framework compiler is required');
  const sourceDir = mkdtempSync(join(tmpdir(), 'emojitot-test-runtime-'));
  const source = join(sourceDir, 'TestRuntime.cs');
  writeFileSync(
    source,
    `using System;
using System.IO;

internal static class TestRuntime
{
    [STAThread]
    private static int Main()
    {
        string marker = Environment.GetEnvironmentVariable("EMOJITOT_TEST_MARKER");
        string payload = File.ReadAllText(Path.Combine(Environment.CurrentDirectory, "payload.txt"));
        File.WriteAllText(marker, Environment.CurrentDirectory + "|" + payload);
        return 0;
    }
}
`,
    'utf8',
  );
  try {
    const result = spawnSync(
      csc,
      ['/nologo', '/target:exe', '/platform:x64', '/out:' + outFile, source],
      { encoding: 'utf8', windowsHide: true },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(sourceDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

function launch({ launcher, installDir, cacheDir, marker }) {
  return spawnSync(launcher, [], {
    cwd: installDir,
    env: {
      ...process.env,
      EMOJITOT_CACHE_DIR: cacheDir,
      EMOJITOT_TEST_MARKER: marker,
    },
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true,
  });
}

describe('native launcher runtime cache', WINDOWS_ONLY, () => {
  it('honours an isolated cache and removes obsolete runtime builds', () => {
    const root = mkdtempSync(join(tmpdir(), 'emojitot-launcher-cache-'));
    const installDir = join(root, '安装 path');
    const cacheDir = join(root, 'ascii-cache');
    const marker = join(root, 'runtime-marker.txt');
    const launcher = join(installDir, 'EmojiTot.exe');
    try {
      mkdirSync(installDir, { recursive: true });
      mkdirSync(cacheDir, { recursive: true });
      compileRuntime(join(installDir, 'EmojiTotRuntime.exe'));
      writeFileSync(join(installDir, 'payload.txt'), 'current');
      buildLauncher({ outFile: launcher });

      const obsolete = join(cacheDir, 'runtime-obsolete');
      mkdirSync(obsolete);
      writeFileSync(join(obsolete, 'runtime.complete'), 'stale');

      const result = launch({ launcher, installDir, cacheDir, marker });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.equal(existsSync(obsolete), false, 'the obsolete runtime cache should be removed');
      assert.match(readFileSync(marker, 'utf8'), /^.*\|current$/);
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });

  it('rebuilds the cache when the launcher build version changes', () => {
    const root = mkdtempSync(join(tmpdir(), 'emojitot-launcher-version-'));
    const installDir = join(root, '中文安装 path');
    const cacheDir = join(root, 'ascii-cache');
    const marker = join(root, 'runtime-marker.txt');
    const launcher = join(installDir, 'EmojiTot.exe');
    try {
      mkdirSync(installDir, { recursive: true });
      mkdirSync(cacheDir, { recursive: true });
      compileRuntime(join(installDir, 'EmojiTotRuntime.exe'));
      buildLauncher({ outFile: launcher, buildVersion: '1.2.3.4' });
      writeFileSync(join(installDir, 'payload.txt'), 'first');
      assert.equal(
        launch({ launcher, installDir, cacheDir, marker }).status,
        0,
      );
      const firstDirectory = readFileSync(marker, 'utf8').split('|', 1)[0];

      buildLauncher({ outFile: launcher, buildVersion: '1.2.3.5' });
      writeFileSync(join(installDir, 'payload.txt'), 'second');
      assert.equal(
        launch({ launcher, installDir, cacheDir, marker }).status,
        0,
      );
      const [secondDirectory, payload] = readFileSync(marker, 'utf8').split('|');
      assert.notEqual(secondDirectory, firstDirectory);
      assert.equal(payload, 'second');
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });
});
