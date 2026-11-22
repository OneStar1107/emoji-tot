/**
 * The real-glass layer's rules, kept out of the page so they can be tested.
 *
 * `backdrop-filter` cannot see a transparent window's desktop, so the glass is
 * a photograph of the screen, blurred and tinted behind the panel
 * (main/services/backdrop.js takes it). This file decides the three things a
 * page can get wrong:
 *
 * 1. **Whether the photograph may be shown.** The frost material with blur on:
 *    the solid and plain skins promise an opaque card, and the blur switch
 *    says "no translucency". The preference is the third gate, and it defaults
 *    to on — the layer is the material the skin was always pretending to be.
 * 2. **How it is placed.** `background-size` is the whole display in CSS
 *    pixels, `background-position` is the display's origin measured from the
 *    layer's — both already computed in the main process, because only it has
 *    the window's screen position and the display's bounds in one space. DPI
 *    never appears: the picture is scaled to the display's CSS size, so a
 *    150% display puts the same desktop element under the same pixel.
 * 3. **What a failure looks like.** Nothing. A null, late or malformed answer
 *    returns null here, and the caller leaves the CSS material alone — no black
 *    box, no empty layer, no layout shift.
 */

/** The materials the photograph belongs to. A solid skin is opaque by contract. */
export const GLASS_SKINS = ['frost'];

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * May the photograph be used with these preferences?
 *
 * @param {object} prefs the island's preference object
 * @returns {boolean}
 */
export function glassAllowed(prefs) {
  if (!prefs || typeof prefs !== 'object') return false;
  if (prefs.glassBackdrop === false) return false;
  if (prefs.blur === false) return false;
  return GLASS_SKINS.includes(prefs.skin ?? 'frost');
}

/**
 * Turn one main-process answer into the three style values the layer needs.
 *
 * Returns null whenever the answer cannot be painted, which is the whole
 * fallback policy: the caller keeps whatever material it already had.
 *
 * @param {object|null} payload `{ dataUrl, offset, size }` from `island:backdrop`
 * @returns {{image: string, position: string, size: string}|null}
 */
export function glassPaint(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const dataUrl = payload.dataUrl;
  /* The prefix is a shape check, not a security boundary: the URL came from
     this app's main process over contextBridge. It does stop a partial or
     truncated answer from being drawn as a blank rectangle. */
  if (typeof dataUrl !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) return null;
  const size = payload.size;
  const offset = payload.offset;
  if (!size || !finite(size.width) || !finite(size.height)) return null;
  if (size.width <= 0 || size.height <= 0) return null;
  if (!offset || !finite(offset.x) || !finite(offset.y)) return null;
  return {
    image: 'url("' + dataUrl + '")',
    position: offset.x + 'px ' + offset.y + 'px',
    size: size.width + 'px ' + size.height + 'px',
  };
}
