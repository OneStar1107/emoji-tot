import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

/**
 * electron-builder signs the app, uninstaller and NSIS installer, but the
 * public portable launcher is assembled after its portable payload. That
 * final assembly changes the file, so it needs one more signature.
 */
export function signingConfigFromEnv(env = process.env) {
  const link = env.WIN_CSC_LINK || env.CSC_LINK || '';
  if (!link) return null;
  const certificateFile = link.startsWith('file:') ? fileURLToPath(link) : link;
  if (!existsSync(certificateFile)) {
    console.warn(
      '[electron-builder] portable signing skipped: CSC_LINK is not a local certificate file',
    );
    return null;
  }
  return {
    certificateFile,
    certificatePassword: env.WIN_CSC_KEY_PASSWORD || env.CSC_KEY_PASSWORD || '',
    description: 'EmojiTot',
    website: 'https://onestar1107.github.io/emoji-tot/',
    hashes: ['sha256'],
  };
}

export async function signReleaseFiles(files, env = process.env) {
  const options = signingConfigFromEnv(env);
  if (!options) return false;
  const missing = files.filter((file) => !existsSync(file));
  if (missing.length > 0) {
    throw new Error('Cannot sign missing release file(s): ' + missing.join(', '));
  }
  const builderRequire = createRequire(require.resolve('electron-builder/package.json'));
  const { sign } = builderRequire('@electron/windows-sign');
  await sign({ files, ...options });
  return true;
}
