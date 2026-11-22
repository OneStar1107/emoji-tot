import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { isAsciiPath } from './electron-runtime.mjs';

/**
 * Electron 45 exits before its main process can run when the executable path
 * contains non-ASCII characters on Windows. A development launch already
 * copies the runtime to an ASCII cache; this gives the packed-app audit the
 * same behavior so a repository under `E:\项目\...` can still be tested.
 */
export function auditRuntimePlan(exePath, platform = process.platform) {
  const exe = resolve(exePath);
  return {
    exe,
    needsStage: platform === 'win32' && !isAsciiPath(exe),
  };
}

export function stageAsciiAuditRuntime(exePath, options = {}) {
  const platform = options.platform ?? process.platform;
  const plan = auditRuntimePlan(exePath, platform);
  if (!plan.needsStage) {
    return { exe: plan.exe, stagingDir: null, staged: false };
  }
  if (!existsSync(plan.exe)) {
    throw new Error('packed EmojiTot.exe not found at ' + plan.exe);
  }

  const baseDir = resolve(options.baseDir ?? process.env.EMOJITOT_UI_AUDIT_CACHE ?? tmpdir());
  if (!isAsciiPath(baseDir)) {
    throw new Error(
      'the UI audit staging directory must be ASCII-only. Set EMOJITOT_UI_AUDIT_CACHE ' +
      'to an ASCII path before retrying. Current: ' + baseDir,
    );
  }

  mkdirSync(baseDir, { recursive: true });
  const stagingDir = mkdtempSync(join(baseDir, 'emojitot-ui-runtime-'));
  try {
    cpSync(dirname(plan.exe), stagingDir, { recursive: true, force: true });
    const exe = join(stagingDir, basename(plan.exe));
    if (!existsSync(exe)) {
      throw new Error('copied app did not produce ' + exe);
    }
    return { exe, stagingDir, staged: true, sourceExe: plan.exe };
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    throw error;
  }
}

export function removeStagedAuditRuntime(runtime) {
  if (!runtime?.stagingDir) return;
  rmSync(runtime.stagingDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
