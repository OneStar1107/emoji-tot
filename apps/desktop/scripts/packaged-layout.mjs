import { copyFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export const LAUNCHER_NAME = 'EmojiTot.exe';
export const RUNTIME_NAME = 'EmojiTotRuntime.exe';

/**
 * Keep the public executable name stable for shortcuts and the installer,
 * while moving Electron itself to a separate binary the wrapper can launch.
 */
export function applyPackagedLauncher({ appOutDir, launcherPath }) {
  const product = join(appOutDir, LAUNCHER_NAME);
  const runtime = join(appOutDir, RUNTIME_NAME);
  if (!existsSync(product)) {
    throw new Error('packaged Electron executable not found at ' + product);
  }
  if (!existsSync(launcherPath)) {
    throw new Error('compiled launcher not found at ' + launcherPath);
  }
  if (existsSync(runtime)) {
    throw new Error('runtime executable already exists at ' + runtime);
  }
  renameSync(product, runtime);
  copyFileSync(launcherPath, product);
}
