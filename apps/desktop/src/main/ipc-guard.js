/**
 * One gate in front of every renderer → main message.
 *
 * Three things are checked, in this order, and a request that fails any of
 * them never reaches its handler:
 *
 * 1. **Which window sent it.** A webContents id is recorded when the window is
 *    created, and the frame URL is checked as well, so a message relayed from
 *    an iframe or a navigated page is refused even if the id is right.
 * 2. **How big it is.** A dragged-in file arrives as bytes; without a ceiling a
 *    page could hand the main process hundreds of megabytes to write.
 * 3. **What shape it is.** Each channel states the fields it accepts; anything
 *    else is dropped rather than copied into prefs.json or a service call.
 *
 * The guard deliberately returns null instead of throwing: a refused message
 * from a stale page should not surface as an unhandled rejection in the main
 * process, and the renderer already treats a null answer as "nothing changed".
 */

const { ipcMain } = require('electron');
const shape = require('./ipc-shape');
const { frameMatches } = require('./ipc-frame');

/** webContents id → which window it is. */
const claims = new Map();

/** Remember a window so it is allowed to call guarded channels. */
function claim(role, webContents) {
  if (!webContents) return;
  claims.set(webContents.id, role);
  webContents.once('destroyed', () => claims.delete(webContents.id));
}

function roleOf(event) {
  try {
    return claims.get(event.sender.id) ?? null;
  } catch {
    return null;
  }
}

function frameOf(event) {
  try {
    return String(event.senderFrame?.url ?? '');
  } catch {
    // A frame that has already gone away.
    return '';
  }
}

const DEFAULT_MAX_BYTES = 64 * 1024;

/** Refusals are logged once per channel per reason, not per message. */
const reported = new Set();
function refuse(channel, reason, role) {
  const key = channel + ':' + reason;
  if (reported.has(key)) return;
  reported.add(key);
  console.warn('[ipc] refused', channel, 'from', role ?? 'unknown', '—', reason);
}

/**
 * Wrap a handler with the three checks.
 *
 * `roles` is the only required option. `check` receives the raw payload and
 * returns the value the handler should get, or undefined to refuse; `maxBytes`
 * defaults to 64 KB.
 */
function guardedHandle(channel, roles, handler, options = {}) {
  const { check, maxBytes = DEFAULT_MAX_BYTES } = options;
  ipcMain.handle(channel, (event, payload) => {
    const role = roleOf(event);
    if (!role || !roles.includes(role)) {
      refuse(channel, 'sender', role);
      return null;
    }
    const frame = frameOf(event);
    if (!frameMatches(role, frame)) {
      refuse(channel, 'frame', role);
      return null;
    }
    if (shape.byteSize(payload) > maxBytes) {
      refuse(channel, 'size', role);
      return null;
    }
    if (check) {
      const normalized = check(payload);
      if (normalized === undefined) {
        refuse(channel, 'shape', role);
        return null;
      }
      return handler(normalized, event);
    }
    return handler(payload, event);
  });
}

/** The same gate for one-way messages (send, not invoke). */
function guardedSend(channel, roles, handler, options = {}) {
  const { check, maxBytes = DEFAULT_MAX_BYTES } = options;
  ipcMain.on(channel, (event, payload) => {
    const role = roleOf(event);
    if (!role || !roles.includes(role)) {
      refuse(channel, 'sender', role);
      return;
    }
    const frame = frameOf(event);
    if (!frameMatches(role, frame)) {
      refuse(channel, 'frame', role);
      return;
    }
    if (shape.byteSize(payload) > maxBytes) {
      refuse(channel, 'size', role);
      return;
    }
    const value = check ? check(payload) : payload;
    if (value === undefined) {
      refuse(channel, 'shape', role);
      return;
    }
    handler(value, event);
  });
}

/**
 * Send to a renderer that may already be gone.
 *
 * Closing a window while the main process is still pushing is normal — the
 * five-second poll, the battery tick, the media watcher all outlive a closed
 * window by a few milliseconds. `webContents.send` on a disposed frame logs
 * "Render frame was disposed before WebFrameMain could be accessed", which is
 * noise that hides real errors.
 */
function safeSend(target, channel, payload) {
  if (!target) return false;
  const contents = target.webContents && typeof target.webContents.send === 'function' ? target.webContents : target;
  if (!contents || typeof contents.send !== 'function') return false;
  if (typeof contents.isDestroyed === 'function' && contents.isDestroyed()) return false;
  try {
    contents.send(channel, payload);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  safeSend,
  claim,
  roleOf,
  frameOf,
  guardedHandle,
  guardedSend,
  ...shape,
};
