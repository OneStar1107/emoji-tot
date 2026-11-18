/**
 * Small wrapper around Electron's safeStorage.
 *
 * Two services store secrets (AI keys, mail passwords); both used to grow their
 * own encrypt/decrypt pair, which is one place too many for the "is the OS
 * keyring available" question. The "plain:" prefix marks the fallback so it is
 * visible that the value is not encrypted, instead of pretending.
 */
const { safeStorage } = require('electron');

function encrypt(text) {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return 'v1:' + safeStorage.encryptString(String(text)).toString('base64');
    }
  } catch {
    // fall through
  }
  return 'plain:' + Buffer.from(String(text), 'utf8').toString('base64');
}

function decrypt(value) {
  try {
    if (typeof value !== 'string') return '';
    if (value.startsWith('v1:')) return safeStorage.decryptString(Buffer.from(value.slice(3), 'base64'));
    if (value.startsWith('plain:')) return Buffer.from(value.slice(6), 'base64').toString('utf8');
  } catch {
    // A profile that moved machines, or a rotated keychain entry.
  }
  return '';
}

module.exports = { encrypt, decrypt };
