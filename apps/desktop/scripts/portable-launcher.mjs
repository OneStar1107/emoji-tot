import { spawnSync } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(scriptDir, '..');
const sourceFile = join(desktopRoot, 'launcher', 'EmojiTotPortableLauncher.cs');
export const PORTABLE_MAGIC = 'EMOJITOT_PORTABLE_PAYLOAD_V1';
export const PORTABLE_LENGTH_DIGITS = 20;

function findCsc() {
  const candidates = [
    process.env.WINDIR && join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    process.env.WINDIR && join(process.env.WINDIR, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? '';
}

async function makeIcon(pngPath, destination) {
  const { default: sharp } = await import('sharp');
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = await Promise.all(
    sizes.map((size) => sharp(pngPath).resize(size, size).png().toBuffer()),
  );
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((image, index) => {
    const at = 6 + index * 16;
    const size = sizes[index];
    header.writeUInt8(size >= 256 ? 0 : size, at);
    header.writeUInt8(size >= 256 ? 0 : size, at + 1);
    header.writeUInt8(0, at + 2);
    header.writeUInt8(0, at + 3);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(image.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += image.length;
  });
  writeFileSync(destination, Buffer.concat([header, ...images]));
}

export async function createPortableExecutable({
  payloadFile,
  outFile,
  buildVersion,
  iconPath = null,
}) {
  const csc = findCsc();
  if (!csc) {
    throw new Error('The Windows .NET Framework compiler was not found (csc.exe)');
  }
  if (!existsSync(sourceFile)) throw new Error('portable launcher source not found at ' + sourceFile);
  if (!existsSync(payloadFile)) throw new Error('portable payload not found at ' + payloadFile);
  const version = String(buildVersion ?? '');
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('portable buildVersion must have exactly four numeric segments');
  }

  const temp = mkdtempSync(join(tmpdir(), 'emojitot-portable-launcher-'));
  const source = join(temp, 'EmojiTotPortableLauncher.cs');
  const compiled = join(temp, 'EmojiTotPortable.exe');
  const partial = outFile + '.partial';
  try {
    const code = readFileSync(sourceFile, 'utf8').replaceAll('__BUILD_VERSION__', version);
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
    if (iconPath && existsSync(iconPath)) {
      const icon = join(temp, 'portable.ico');
      await makeIcon(iconPath, icon);
      args.push('/win32icon:' + icon);
    }
    args.push(source);
    const result = spawnSync(csc, args, {
      cwd: temp,
      encoding: 'utf8',
      windowsHide: true,
    });
    if (result.status !== 0) {
      throw new Error('portable launcher compiler exited with code ' + result.status + ': ' + (result.stderr || result.stdout));
    }

    const payloadSize = statSync(payloadFile).size;
    const trailer = Buffer.from(
      PORTABLE_MAGIC + '\n' + String(payloadSize).padStart(PORTABLE_LENGTH_DIGITS, '0') + '\n',
      'ascii',
    );
    const { createReadStream } = await import('node:fs');
    await pipeline(
      async function* writeParts() {
        yield readFileSync(compiled);
        for await (const chunk of createReadStream(payloadFile)) yield chunk;
        yield trailer;
      },
      createWriteStream(partial),
    );
    rmSync(outFile, { force: true });
    renameSync(partial, outFile);
    return outFile;
  } catch (error) {
    rmSync(partial, { force: true });
    throw error;
  } finally {
    rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
