import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, '..');
const sourceFile = join(desktopRoot, 'launcher', 'EmojiTotLauncher.cs');

function findCsc() {
  const candidates = [
    process.env.WINDIR && join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    process.env.WINDIR && join(process.env.WINDIR, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? '';
}

export function buildLauncher({ outFile, iconPath = null, buildVersion = null }) {
  const csc = findCsc();
  if (!csc) {
    throw new Error('The Windows .NET Framework compiler was not found (csc.exe)');
  }
  if (!existsSync(sourceFile)) throw new Error('launcher source not found at ' + sourceFile);

  const buildInfoPath = join(desktopRoot, 'build-info.json');
  const buildInfo = existsSync(buildInfoPath)
    ? JSON.parse(readFileSync(buildInfoPath, 'utf8'))
    : { buildVersion: '0.0.0.0' };
  const launcherVersion = String(buildVersion ?? buildInfo.buildVersion ?? '0.0.0.0');
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(launcherVersion)) {
    throw new Error('launcher buildVersion must have exactly four numeric segments');
  }
  const temp = mkdtempSync(join(tmpdir(), 'emojitot-launcher-'));
  try {
    const source = join(temp, 'EmojiTotLauncher.cs');
    const compiled = join(temp, 'EmojiTot.exe');
    const code = readFileSync(sourceFile, 'utf8')
      .replaceAll('__BUILD_VERSION__', launcherVersion);
    writeFileSync(source, code, 'utf8');
    const args = [
      '/nologo',
      '/target:winexe',
      '/platform:x64',
      '/optimize+',
      '/debug-',
      '/reference:System.dll',
      '/reference:System.Core.dll',
      '/reference:System.Windows.Forms.dll',
      '/out:' + compiled,
    ];
    if (iconPath && /\.ico$/i.test(iconPath) && existsSync(iconPath)) {
      const icon = join(temp, 'launcher.ico');
      copyFileSync(iconPath, icon);
      args.push('/win32icon:' + icon);
    }
    args.push(source);
    const result = spawnSync(csc, args, { cwd: temp, stdio: 'inherit', windowsHide: true });
    if (result.status !== 0) {
      throw new Error('launcher compiler exited with code ' + result.status);
    }
    mkdirSync(dirname(outFile), { recursive: true });
    copyFileSync(compiled, outFile);
    return outFile;
  } finally {
    rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  if (outIndex < 0 || !args[outIndex + 1]) {
    console.error('usage: node scripts/build-launcher.mjs --out <EmojiTot.exe> [--icon <icon.ico>]');
    process.exitCode = 1;
  } else {
    const iconIndex = args.indexOf('--icon');
    const output = buildLauncher({
      outFile: resolve(args[outIndex + 1]),
      iconPath: iconIndex >= 0 ? resolve(args[iconIndex + 1]) : null,
    });
    console.log('launcher ' + output);
  }
}
