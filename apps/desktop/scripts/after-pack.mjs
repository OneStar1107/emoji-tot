import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { buildLauncher } from './build-launcher.mjs';
import { applyPackagedLauncher } from './packaged-layout.mjs';

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const icon = await context.packager.getIconPath().catch(() => null);
  const launcherPath = join(context.outDir, '.launcher', 'EmojiTot.exe');
  buildLauncher({ outFile: launcherPath, iconPath: icon });
  applyPackagedLauncher({ appOutDir: context.appOutDir, launcherPath });
  /*
   * Some project/virtual drives carry a low mandatory integrity label. A
   * launcher inherited from such a folder cannot create its ASCII runtime
   * cache. Raise the packaged tree to Medium after every Windows pack.
   */
  const integrity = spawnSync(
    'icacls',
    [context.appOutDir, '/setintegritylevel', '(OI)(CI)M', '/T'],
    { stdio: 'ignore', windowsHide: true },
  );
  if (integrity.status !== 0) {
    console.warn('[after-pack] could not raise the app tree to Medium integrity');
  }
}
