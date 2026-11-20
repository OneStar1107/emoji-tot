/**
 * Pure window-preference decisions.
 *
 * The pointer tells us where the cursor is. The preference tells us whether
 * pointer-driven pass-through is allowed at all. Keeping them separate stops
 * a 60 ms poll from overwriting an explicit user setting.
 */

function passThroughFor(enabled, pointerInside) {
  return Boolean(enabled) && !Boolean(pointerInside);
}

/*
 * A live drag owns the mouse.
 *
 * Dragging is done by moving the window towards the cursor every 16 ms, so the
 * grab point lags a few pixels behind it. Judged on that lag the ball test says
 * "the cursor left the ball" and hands the mouse back to the desktop — which
 * takes the pointerup away from the page. The page then never reports drag:end
 * and the ball follows the cursor forever, with no way to let go. A drag
 * answers this question before the pointer or the preference get to.
 */
function passThroughWhileDragging(dragging, enabled, pointerInside) {
  if (dragging) return false;
  return passThroughFor(enabled, pointerInside);
}

function sameDisplayId(left, right) {
  if (left == null || right == null) return false;
  return String(left) === String(right);
}

module.exports = { passThroughFor, passThroughWhileDragging, sameDisplayId };
