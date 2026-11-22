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

import { createPortableExecutable } from '../scripts/portable-launcher.mjs';

const WINDOWS_ONLY = { skip: process.platform !== 'win32' };

function findCsc() {
  const candidates = [
    process.env.WINDIR && join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    process.env.WINDIR && join(process.env.WINDIR, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? '';
}

function compilePayload(outFile) {
  const csc = findCsc();
  assert.ok(csc, 'the Windows .NET Framework compiler is required');
  const sourceDir = mkdtempSync(join(tmpdir(), 'emojitot-test-payload-'));
  const source = join(sourceDir, 'TestPayload.cs');
  writeFileSync(
    source,
    `using System;
using System.IO;

internal static class TestPayload
{
    [STAThread]
    private static int Main(string[] args)
    {
        string marker = Environment.GetEnvironmentVariable("EMOJITOT_TEST_MARKER");
        string text = string.Join("|", args) + "\\n" + Environment.CurrentDirectory;
        File.WriteAllText(marker, text);
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

describe('non-ASCII portable wrapper', WINDOWS_ONLY, () => {
  it('extracts and runs its embedded payload from an ASCII cache', async () => {
    const root = mkdtempSync(join(tmpdir(), 'emojitot-portable-wrapper-'));
    const installDir = join(root, '中文 portable');
    const cacheDir = join(root, 'ascii-cache');
    const payload = join(root, 'portable-payload.exe');
    const wrapper = join(installDir, 'EmojiTot.portable.exe');
    const marker = join(root, 'payload-marker.txt');
    try {
      mkdirSync(installDir, { recursive: true });
      mkdirSync(cacheDir, { recursive: true });
      compilePayload(payload);
      writeFileSync(payload, Buffer.concat([readFileSync(payload), Buffer.from('payload-tail')]));
      await createPortableExecutable({
        payloadFile: payload,
        outFile: wrapper,
        buildVersion: '1.2.3.4',
      });

      const result = spawnSync(wrapper, ['--probe', '中文 参数'], {
        cwd: installDir,
        env: {
          ...process.env,
          EMOJITOT_PORTABLE_CACHE_DIR: cacheDir,
          EMOJITOT_TEST_MARKER: marker,
        },
        encoding: 'utf8',
        timeout: 30000,
        windowsHide: true,
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(readFileSync(marker, 'utf8'), /^--probe\|中文 参数/);
      assert.ok(
        readFileSync(marker, 'utf8').includes(cacheDir),
        'the embedded payload should run from the isolated ASCII cache',
      );
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });
});
