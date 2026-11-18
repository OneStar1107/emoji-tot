import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

export function isAsciiPath(value) {
  return !/[^\x00-\x7F]/.test(String(value));
}

export function runtimeCachePath(base, version, key, platform = process.platform) {
  return join(base, `electron-${version}-${key}${platform === 'win32' ? '' : '-' + platform}`);
}

function packageRoot() {
  return dirname(require.resolve('electron'));
}

function cacheBase() {
  const configured = process.env.EMOJITOT_ELECTRON_CACHE;
  const base = configured || join(process.env.LOCALAPPDATA || tmpdir(), 'EmojiTot', 'electron-runtime');
  if (!isAsciiPath(base)) {
    throw new Error(
      'Electron needs an ASCII cache path. Set EMOJITOT_ELECTRON_CACHE to an ASCII-only directory.',
    );
  }
  return base;
}

/**
 * Electron 45 crashes before startup when its executable lives under a
 * non-ASCII path on Windows. Keep the package cache untouched and copy the
 * distribution once into an ASCII user cache before launching it.
 */
export function resolveElectronBinary(options = {}) {
  const root = options.packageRoot ?? packageRoot();
  const distDir = options.distDir ?? join(root, 'dist');
  const executableName =
    options.executableName ??
    (existsSync(join(root, 'path.txt'))
      ? readFileSync(join(root, 'path.txt'), 'utf8').trim()
      : process.platform === 'win32'
        ? 'electron.exe'
        : 'electron');
  const source = join(distDir, executableName);
  if (
    process.platform !== 'win32' ||
    isAsciiPath(source) ||
    options.forceAsciiCache === false
  ) {
    return source;
  }

  const version =
    options.version ??
    JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const key = createHash('sha256')
    .update(realpathSync(distDir))
    .digest('hex')
    .slice(0, 12);
  const base = options.cacheBase ?? cacheBase();
  const cache = runtimeCachePath(base, version, key, process.platform);
  const target = join(cache, executableName);
  if (existsSync(target)) return target;

  mkdirSync(base, { recursive: true });
  const tempRoot = mkdtempSync(join(base, 'copy-'));
  const staging = join(tempRoot, 'dist');
  try {
    console.warn(`[electron] caching ASCII runtime at ${cache}`);
    cpSync(distDir, staging, { recursive: true, verbatimSymlinks: true });
    try {
      renameSync(staging, cache);
    } catch (error) {
      if (!existsSync(target)) throw error;
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
  if (!existsSync(target)) {
    throw new Error('Electron ASCII runtime cache did not produce ' + target);
  }
  return target;
}
