/**
 * Display names for peripherals whose PnP model name is not the name the
 * vendor shows in its own software.
 *
 * This mapping is deliberately finite. A device name is hardware identity, not
 * prose, so unknown products fall back to the OS-provided name rather than
 * being machine-translated or guessed.
 */

const CHINESE_NAMES = Object.freeze({
  'ROG AZOTH': 'ROG 夜魔',
  'ROG GLADIUS III WIRELESS AIMPOINT': 'ROG 战刃 3 无线 AimPoint',
});

function currentLocale() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || '';
  } catch {
    return '';
  }
}

function isChineseLocale(locale) {
  const normalized = String(locale ?? '').replaceAll('_', '-').toLowerCase();
  return normalized === 'zh' || normalized.startsWith('zh-');
}

function localizeDeviceName(name, locale = currentLocale()) {
  const original = String(name ?? '');
  if (!isChineseLocale(locale)) return original;
  return CHINESE_NAMES[original.trim().toUpperCase()] || original;
}

module.exports = {
  currentLocale,
  isChineseLocale,
  localizeDeviceName,
};
