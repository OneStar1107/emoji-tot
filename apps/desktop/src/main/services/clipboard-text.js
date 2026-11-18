/** Electron clipboard reads must be strings; a broken source is treated as empty. */
function readClipboardText(read) {
  try {
    const value = read();
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

module.exports = { readClipboardText };
