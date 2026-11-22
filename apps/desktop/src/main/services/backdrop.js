/**
 * The desktop behind the island, as one still frame.
 *
 * A transparent Electron window has no desktop in its compositing stack: CSS
 * `backdrop-filter` filters what the page itself paints, and the page paints
 * nothing outside the card. That is why the frost skin has always looked like
 * an acrylic sheet — the wallpaper shows through the tint *sharp*, because it
 * was never filtered at all. Blurring the real desktop means photographing it
 * and blurring the photograph; this module owns the photograph.
 *
 * What it does not do is as important as what it does:
 *
 * - **It never throws.** Remote Desktop, a missing screen-recording permission,
 *   a platform without `desktopCapturer`, a capture slower than 2s — all of
 *   them return null. The renderer treats null as "keep the CSS material",
 *   which is the only fallback that cannot produce a black box.
 * - **It never writes or logs the frame.** The image lives in the 500ms cache
 *   below and in the island window's memory. Nothing else in the app ever sees
 *   it, and no log line carries more than an error message.
 * - **It keeps the arithmetic here.** The renderer gets `offset` and `size`
 *   already in CSS pixels, measured against the display the window is on. DPI
 *   changes how much detail the capture carries, never where it lands: the
 *   layer is positioned in DIP, and the browser scales the image into it.
 *
 * Run the pure half without Electron: `node --test test/backdrop.test.mjs`.
 */

/** Reuse a capture for this long: an open, then a resize, is one photograph. */
const DEFAULT_TTL_MS = 500;
/** A stuck `getSources` must not pin the in-flight slot forever. */
const CAPTURE_TIMEOUT_MS = 2000;
/**
 * Longest edge of the capture, in physical pixels.
 *
 * The layer is blurred by 26px and then covered by a ~0.7-alpha tint, so the
 * photograph's detail is thrown away twice. 2560 keeps a 4K display's JPEG
 * around 400 KB of base64 instead of several megabytes, and nothing visible
 * is lost.
 */
const MAX_EDGE = 2560;
/**
 * How far the blurred layer reaches past the panel on every side.
 *
 * The blur samples outside its own box, so the fade has to happen outside the
 * panel's `overflow: hidden` clip or the glass goes pale along all four edges.
 * The stylesheet pads the layer with the same number (`--glass-bleed`); the
 * geometry below subtracts it, and a test keeps the two in step.
 */
const GLASS_BLEED = 24;
const JPEG_QUALITY = 82;

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * Physical pixels to ask `desktopCapturer` for.
 *
 * `display.size` is DIP and `scaleFactor` is the ratio the OS runs that display
 * at, so the product is what the screen actually shows. `desktopCapturer`
 * returns a thumbnail in physical pixels; asking for the DIP size on a 150%
 * display would hand back a picture of two thirds of the screen.
 */
function thumbnailFor(display, maxEdge = MAX_EDGE) {
  const size = display?.size ?? {};
  const factor = Number(display?.scaleFactor);
  const scale = finite(factor) && factor > 0 ? factor : 1;
  const width = Math.max(1, Math.round((Number(size.width) || 1) * scale));
  const height = Math.max(1, Math.round((Number(size.height) || 1) * scale));
  const over = Math.max(width, height) / maxEdge;
  if (!(over > 1)) return { width, height };
  return { width: Math.max(1, Math.round(width / over)), height: Math.max(1, Math.round(height / over)) };
}

/** The display rectangle the renderer's positions are measured against. */
function screenRect(display) {
  const bounds = display?.bounds ?? {};
  const size = display?.size ?? {};
  const factor = Number(display?.scaleFactor);
  return {
    x: Math.round(Number(bounds.x) || 0),
    y: Math.round(Number(bounds.y) || 0),
    width: Math.round(Number(bounds.width) || Number(size.width) || 0),
    height: Math.round(Number(bounds.height) || Number(size.height) || 0),
    scaleFactor: finite(factor) && factor > 0 ? factor : 1,
  };
}

function displayKey(display, screen) {
  return [display?.id ?? '', screen.x, screen.y, screen.width, screen.height].join(':');
}

/**
 * Where the photograph has to sit for the desktop in it to land where the
 * desktop really is.
 *
 * `panel` is the panel's rectangle in CSS pixels inside the window, `win` the
 * window's position on the screen, and `display` the captured display's
 * rectangle — all three in the same DIP space, which is why no scale factor
 * appears here. The layer is `bleed` px wider than the panel on every side, so
 * its origin is that much further out, and the background's offset is the
 * display's origin minus the layer's origin.
 *
 * A second monitor is the case this exists for: its bounds start at, say,
 * x=1920, and the panel's position inside *that* display is what the offset
 * has to measure, not the position on the primary one.
 */
function glassPlacement({ panel, window: win, display, bleed = GLASS_BLEED }) {
  const panelX = (Number(win?.x) || 0) + (Number(panel?.x) || 0);
  const panelY = (Number(win?.y) || 0) + (Number(panel?.y) || 0);
  return {
    x: bleed - (panelX - (Number(display?.x) || 0)),
    y: bleed - (panelY - (Number(display?.y) || 0)),
    width: Number(display?.width) || 0,
    height: Number(display?.height) || 0,
  };
}

/** Whether the cached frame is still the one this request needs. */
function cacheHit(entry, key, at, ttlMs) {
  return Boolean(entry) && entry.key === key && at - entry.at >= 0 && at - entry.at < ttlMs;
}

/** Resolve with `fallback` if `promise` has not settled in time. */
function withTimeout(promise, ms, fallback = null) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  /* The timer is cleared whether the capture settled or the deadline won, so a
     dead capture never leaves a two-second handle behind. */
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** The source that belongs to this display, or the first one when ids differ. */
function pickSource(sources, display) {
  const list = Array.isArray(sources) ? sources : [];
  const usable = list.filter((source) => source && source.thumbnail && !isBlank(source.thumbnail));
  if (!usable.length) return null;
  const id = display?.id == null ? '' : String(display.id);
  return usable.find((source) => String(source.display_id ?? '') === id) ?? usable[0];
}

function isBlank(image) {
  try {
    return typeof image.isEmpty === 'function' ? image.isEmpty() : false;
  } catch {
    return true;
  }
}

/**
 * Photograph one display as a JPEG data URL.
 *
 * JPEG, not PNG: the frame is blurred and tinted, its detail is not kept, and
 * a PNG of a 2560x1440 desktop is 4-8 MB of base64 travelling through IPC and
 * living in the renderer. Drawn through the same layer, nobody can tell.
 */
async function grabScreen(display) {
  let electron = null;
  try {
    electron = require('electron');
  } catch {
    return null;
  }
  const capturer = electron && electron.desktopCapturer;
  if (!capturer || typeof capturer.getSources !== 'function') return null;
  const sources = await capturer.getSources({
    types: ['screen'],
    thumbnailSize: thumbnailFor(display),
    fetchWindowIcons: false,
  });
  const source = pickSource(sources, display);
  if (!source) return null;
  const image = source.thumbnail;
  let bytes = null;
  try {
    bytes = typeof image.toJPEG === 'function' ? image.toJPEG(JPEG_QUALITY) : null;
  } catch {
    return null;
  }
  if (!bytes || !bytes.length) return null;
  return 'data:image/jpeg;base64,' + bytes.toString('base64');
}

/**
 * The capture service: one frame, cached briefly, aligned on demand.
 *
 * `grab`, `now` and `log` are injectable so the whole thing runs in a unit test
 * without Electron and without a screen.
 */
function createBackdrop(options = {}) {
  const ttlMs = finite(options.ttlMs) ? options.ttlMs : DEFAULT_TTL_MS;
  const timeoutMs = finite(options.timeoutMs) ? options.timeoutMs : CAPTURE_TIMEOUT_MS;
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const grab = typeof options.grab === 'function' ? options.grab : grabScreen;
  const log = typeof options.log === 'function' ? options.log : null;

  /** { key, at, dataUrl, screen } — the only copy of the frame outside the renderer. */
  let cached = null;
  /** One capture at a time per display: two opens in the same tick are one photo. */
  let inflight = null;

  async function frameFor(display) {
    const screen = screenRect(display);
    const key = displayKey(display, screen);
    if (cacheHit(cached, key, now(), ttlMs)) return cached;
    if (inflight && inflight.key === key) return inflight.promise;

    const promise = (async () => {
      let dataUrl = null;
      try {
        dataUrl = await withTimeout(grab(display), timeoutMs, null);
      } catch (error) {
        /* A refused or failed capture is a normal answer. Only the message is
           logged; the frame itself never reaches a log line. */
        if (log) log('capture failed: ' + (error && error.message ? error.message : String(error)));
        dataUrl = null;
      }
      if (typeof dataUrl !== 'string' || !dataUrl) return null;
      const frame = { key, at: now(), dataUrl, screen };
      cached = frame;
      return frame;
    })();

    inflight = { key, promise };
    try {
      return await promise;
    } finally {
      if (inflight && inflight.promise === promise) inflight = null;
    }
  }

  /**
   * The payload the island asks for, or null.
   *
   * A failed capture is deliberately not cached: the next open retries. Only
   * successful frames live in the 500ms window.
   */
  async function capture({ display, panel, window: win }) {
    const frame = await frameFor(display);
    if (!frame) return null;
    const placement = glassPlacement({ panel, window: win, display: frame.screen });
    return {
      dataUrl: frame.dataUrl,
      screen: { ...frame.screen },
      capturedAt: frame.at,
      offset: { x: placement.x, y: placement.y },
      size: { width: placement.width, height: placement.height },
    };
  }

  /** Drop the frame: used when the settings switch turns the feature off. */
  function clear() {
    cached = null;
  }

  function cachedAt() {
    return cached ? cached.at : 0;
  }

  return { capture, clear, cachedAt };
}

module.exports = {
  DEFAULT_TTL_MS,
  CAPTURE_TIMEOUT_MS,
  MAX_EDGE,
  GLASS_BLEED,
  thumbnailFor,
  screenRect,
  displayKey,
  glassPlacement,
  cacheHit,
  withTimeout,
  pickSource,
  grabScreen,
  createBackdrop,
};
