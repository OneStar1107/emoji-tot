/**
 * Where the tray panel goes.
 *
 * The panel is a real window, so it does not inherit the OS's menu placement:
 * the tray icon's own rectangle is the anchor, and the panel goes on the side
 * of it with room — above the icon for a bottom taskbar, below it for a top
 * one. Everything here is in DIP screen coordinates, the same space
 * BrowserWindow.setBounds() and screen.getDisplayMatching() use.
 *
 * Kept free of Electron so the arithmetic is testable with node --test
 * (apps/desktop/test/tray-menu.test.mjs).
 */

/** Space between the tray icon and the panel. */
const GAP = 8;
/** Distance from a work-area edge, so the panel never sits flush against it. */
const EDGE = 8;
/** Inset used when there is no tray rectangle to anchor to. */
const CORNER = 12;

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/** Bottom-right of the work area: the fallback for a platform that does not
 * report a tray rectangle, and the one place a menu is always reachable. */
function corner(size, area) {
  return {
    x: Math.round(area.x + area.width - CORNER - size.width),
    y: Math.round(area.y + area.height - CORNER - size.height),
  };
}

/**
 * The top-left corner for the panel.
 *
 * @param {{x:number,y:number,width:number,height:number}|null} anchor tray icon
 * @param {{width:number,height:number}} size panel size
 * @param {{x:number,y:number,width:number,height:number}} area display work area
 * @returns {{x:number,y:number}}
 */
function placePanel(anchor, size, area) {
  if (!anchor || !(anchor.width > 0) || !(anchor.height > 0)) return corner(size, area);

  const left = area.x + EDGE;
  const right = area.x + area.width - EDGE - size.width;
  const top = area.y + EDGE;
  const bottom = area.y + area.height - EDGE - size.height;

  const x = clamp(anchor.x + anchor.width / 2 - size.width / 2, left, right);

  const above = anchor.y - GAP - size.height;
  const below = anchor.y + anchor.height + GAP;
  const fitsAbove = above >= top;
  const fitsBelow = below <= bottom;
  // A bottom taskbar puts the icon in the lower half of the screen, a top one
  // in the upper half; that is the same question as "which side has room".
  const iconInUpperHalf = anchor.y + anchor.height / 2 < area.y + area.height / 2;
  let y;
  if (fitsAbove && fitsBelow) y = iconInUpperHalf ? below : above;
  else if (fitsAbove) y = above;
  else if (fitsBelow) y = below;
  else y = iconInUpperHalf ? bottom : top;

  return { x: Math.round(clamp(x, left, right)), y: Math.round(clamp(y, top, bottom)) };
}

module.exports = { placePanel, GAP, EDGE, CORNER };
