import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
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

/**
 * Copy a directory tree with primitive fs calls instead of `fs.cpSync`.
 *
 * On Windows, `cpSync` aborts the whole Node process with STATUS_STACK_BUFFER_OVERRUN
 * (0xC0000409 / exit -1073740791) when the *source* path contains non-ASCII
 * characters — exactly the case for a checkout under `E:\项目\...` being staged
 * into an ASCII Electron cache. A readdir/lstat/copyFile walk avoids that libuv
 * code path entirely and works for ASCII sources too.
 *
 * `destination` is created when missing; existing contents are left in place.
 * Both callers stage into a freshly-created temp directory, so this function
 * never needs a recursive delete and never touches anything outside the
 * staging directory the caller owns. Symlinks are reproduced verbatim from
 * their link target (matching `cpSync({ verbatimSymlinks: true })`), so a link
 * to a directory is not followed and cannot recurse forever.
 */
export function copyDirectorySync(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    // lstat, not stat: keep symlinks visible as symlinks even on Windows,
    // where a junction would otherwise be reported as a directory.
    const stat = lstatSync(from);
    if (stat.isSymbolicLink()) {
      symlinkSync(readlinkSync(from), to);
    } else if (stat.isDirectory()) {
      copyDirectorySync(from, to);
    } else if (stat.isFile()) {
      copyFileSync(from, to);
    }
    // Sockets, FIFOs and device nodes do not occur in an Electron dist or a
    // packed app; skipping them keeps the copy deterministic and portable.
  }
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
    copyDirectorySync(distDir, staging);
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
