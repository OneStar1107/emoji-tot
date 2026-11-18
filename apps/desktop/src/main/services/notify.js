/**
 * One place that decides whether a notification is allowed to appear.
 *
 * Every service used to construct its own Notification. With two switches in
 * settings — the master toggle and "show body" — a single entry point is what
 * keeps them honest, instead of five copies of the same check.
 */
const { Notification } = require('electron');
const { readPrefs } = require('../paths');

function notify(title, body = '', options = {}) {
  const prefs = readPrefs();
  const config = prefs.notify ?? {};
  if (config.system === false) return false;
  const text = config.body === false ? '' : body;
  try {
    new Notification({ title: String(title), body: String(text), ...options }).show();
    return true;
  } catch {
    return false;
  }
}

module.exports = { notify };
