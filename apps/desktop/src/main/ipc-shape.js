/**
 * Payload shape checks for IPC, with no Electron dependency.
 *
 * Split out from ipc-guard.js so a unit test can exercise the rules without
 * starting an Electron process. Everything here is a pure function of its
 * argument; the guard file only adds the parts that need a live webContents.
 */

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !ArrayBuffer.isView(value);

const isString = (value, max = 2048) => typeof value === 'string' && value.length <= max;
const isBool = (value) => typeof value === 'boolean';
const isNumber = (value, min = -Infinity, max = Infinity) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const isId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
const oneOf = (value, allowed) => allowed.includes(value);

/** Cheap size estimate that understands the binary payloads we actually send. */
function byteSize(value, depth = 0) {
  if (value == null) return 0;
  if (typeof value === 'string') return value.length * 2;
  if (typeof value === 'number' || typeof value === 'boolean') return 8;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (Array.isArray(value)) return value.reduce((total, item) => total + byteSize(item, depth + 1), 0);
  if (typeof value === 'object' && depth < 4) {
    return Object.values(value).reduce((total, item) => total + byteSize(item, depth + 1), 0);
  }
  return 8;
}

/** A payload that must be exactly { action: <one of …>, data?: object }. */
const actionPayload = (actions) => (payload) => {
  if (!isPlainObject(payload)) return undefined;
  if (!oneOf(payload.action, actions)) return undefined;
  if (payload.data !== undefined && !isPlainObject(payload.data)) return undefined;
  return { action: payload.action, data: payload.data ?? {} };
};

/* ------------------------------------------------------------ field checks */

const SHELF_BUFFER_LIMIT = 8 * 1024 * 1024;
const BUS_LIMIT = 64 * 1024;

/** The service bus: which actions each local service accepts. */
const LOCAL_ACTIONS = {
  focus: ['start', 'pause', 'resume', 'stop', 'skip', 'restart'],
  health: ['drink', 'stand', 'reset', 'resetWater', 'resetStand'],
  todo: ['add', 'toggle', 'remove', 'update', 'clearDone'],
  shelf: ['add', 'addBuffer', 'open', 'reveal', 'remove'],
  clipboard: ['copy', 'togglePin', 'remove', 'clear', 'clearUnpinned'],
  messenger: ['activate'],
};

/**
 * `local:do` is the one bus the island drives; this is its allowlist.
 *
 * The shape check runs before the handler, so a service or action that is not
 * listed never reaches a branch — which is what stops a page from calling
 * something that happens to be added later.
 */
const checkLocal = (payload) => {
  if (!isPlainObject(payload)) return undefined;
  const allowed = LOCAL_ACTIONS[payload.service];
  if (!allowed || !oneOf(payload.action, allowed)) return undefined;
  if (payload.data !== undefined && !isPlainObject(payload.data)) return undefined;
  const data = payload.data ?? {};
  if (payload.action === 'addBuffer') {
    if (byteSize(data.bytes) > SHELF_BUFFER_LIMIT) return undefined;
    if (!isString(data.name, 255)) return undefined;
    return { service: payload.service, action: payload.action, data };
  }
  if (byteSize(payload) > BUS_LIMIT) return undefined;
  return { service: payload.service, action: payload.action, data };
};

const checkPoint = (point) => {
  if (!isPlainObject(point)) return undefined;
  if (!isNumber(point.x, -100000, 100000) || !isNumber(point.y, -100000, 100000)) return undefined;
  return { x: point.x, y: point.y };
};

const checkBox = (box) => {
  if (!isPlainObject(box)) return undefined;
  if (!isNumber(box.w, 1, 10000) || !isNumber(box.h, 1, 10000)) return undefined;
  return { w: Math.round(box.w), h: Math.round(box.h) };
};

module.exports = {
  isPlainObject,
  isString,
  isBool,
  isNumber,
  isId,
  oneOf,
  byteSize,
  actionPayload,
  checkLocal,
  checkPoint,
  checkBox,
  LOCAL_ACTIONS,
  SHELF_BUFFER_LIMIT,
  BUS_LIMIT,
};
