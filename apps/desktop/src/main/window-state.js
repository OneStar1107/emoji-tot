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

function sameDisplayId(left, right) {
  if (left == null || right == null) return false;
  return String(left) === String(right);
}

module.exports = { passThroughFor, sameDisplayId };
