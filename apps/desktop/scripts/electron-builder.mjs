#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { runBuildInfo } from '../../../scripts/build-info.mjs';
import { createPortableExecutable } from './portable-launcher.mjs';
import { signReleaseFiles } from './sign-release-files.mjs';

const require = createRequire(import.meta.url);
const cli = require.resolve('electron-builder/cli.js');
const info = runBuildInfo();
const releaseDir = join(process.cwd(), '..', '..', 'release');
const internalPortable = join(
  releaseDir,
  'EmojiTot.' + info.buildVersion + '.portable.internal.exe',
);
const publicPortable = join(
  releaseDir,
  'EmojiTot.Portable.exe',
);
const env = { ...process.env, BUILD_NUMBER: String(info.number) };
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
  windowsHide: true,
});

child.on('error', (error) => {
  console.error('[electron-builder] ' + error.message);
  process.exitCode = 1;
});
child.on('close', async (code, signal) => {
  if (signal) {
    console.error('[electron-builder] exited with signal ' + signal);
    process.exitCode = 1;
    return;
  }
  if (code !== 0) {
    process.exitCode = code ?? 1;
    return;
  }
  if (existsSync(internalPortable)) {
    try {
      await createPortableExecutable({
        payloadFile: internalPortable,
        outFile: publicPortable,
        buildVersion: info.buildVersion,
        iconPath: join(process.cwd(), 'assets', 'icon-256.png'),
      });
      rmSync(internalPortable);
      if (await signReleaseFiles([publicPortable])) {
        console.log('[electron-builder] signed the public portable launcher');
      }
      const integrity = spawnSync(
        'icacls',
        [publicPortable, '/setintegritylevel', 'M'],
        { stdio: 'ignore', windowsHide: true },
      );
      if (integrity.status !== 0) {
        console.warn('[electron-builder] could not raise the portable artifact to Medium integrity');
      }
    } catch (error) {
      console.error('[electron-builder] portable wrapper failed: ' + error.message);
      process.exitCode = 1;
      return;
    }
  }
  process.exitCode = 0;
});
