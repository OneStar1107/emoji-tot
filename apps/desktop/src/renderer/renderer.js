/**
 * The ball: drag it, click it, right-click it, and let the host change its face.
 *
 * Everything here is presentation. What to show arrives already resolved as a
 * state name from the main process — this file never learns what an id means,
 * so the protocol table has exactly one home.
 */
import { faceFor } from './faces.js';
import { castMember } from './vendor/core/index.js';

const pet = document.getElementById('pet');
const bubble = document.getElementById('bubble');
const ball = document.querySelector('emojitot-ball');
const api = window.petAPI;

// Everything below sets properties on the custom element, so it has to exist
// first. Module scripts are ordered, but making the dependency explicit is
// cheaper than debugging a race.
await customElements.whenDefined('emojitot-ball');

let bubbleTimer = null;
let motionPaused = false;

function applyMotionPrefs(next) {
  motionPaused = next?.reduceMotion === true || next?.motion === false;
  ball?.toggleAttribute('paused', motionPaused);
}

api.onPrefs?.(applyMotionPrefs);

/**
 * The bubble only speaks while docked.
 *
 * A pet standing in the middle of the desktop with a label over its head is
 * a widget. Docked at an edge it is out of the way and the bubble becomes the
 * only thing telling you what it is doing, which is when it earns its space.
 */
let bubbleAllowed = false;

function say(text) {
  // The text is the current face even while the bubble is hidden: docking
  // later shows the same expression instead of a stale one, and a probe can
  // read the mapping without forcing the bubble on screen.
  bubble.textContent = text || '';
  if (!text || !bubbleAllowed) {
    bubble.dataset.visible = 'false';
    return;
  }
  bubble.dataset.visible = 'true';
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    bubble.dataset.visible = 'false';
  }, 3400);
}

/*
 * Dragging is done by the main process: the cursor leaves the window almost
 * immediately, so a pointermove handler would lose it. The renderer only says
 * where the grab happened and when it ended.
 */
let dragging = false;
let grabbedAt = null;
let travelled = false;

/*
 * A press only becomes a drag after the pointer moves.
 *
 * Starting the follow loop on pointerdown made a long press send a position
 * every frame while the pointer stood still, which reads as the ball growing
 * until the window clips it. Waiting for 4px of travel keeps a hold a hold.
 */
let dragStarted = false;

pet.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  dragging = true;
  travelled = false;
  dragStarted = false;
  grabbedAt = { x: event.screenX, y: event.screenY };
  pet.setPointerCapture?.(event.pointerId);
});

pet.addEventListener('pointermove', (event) => {
  if (!dragging || !grabbedAt) return;
  const moved = Math.hypot(event.screenX - grabbedAt.x, event.screenY - grabbedAt.y);
  if (moved <= 4) return;
  travelled = true;
  if (!dragStarted) {
    dragStarted = true;
    api.dragStart(grabbedAt);
  }
});

function release() {
  if (!dragging) return;
  dragging = false;
  const wasDragging = dragStarted;
  dragStarted = false;
  if (wasDragging) api.dragEnd();
  // A press that never travelled is a poke, not a drag.
  if (!travelled) api.poke();
}

pet.addEventListener('pointerup', release);
pet.addEventListener('pointercancel', release);
/*
 * The same release, one level up.
 *
 * A drag moves the window out from under the pointer every 16ms. If the page
 * misses the pointerup for any reason — the capture dropped, the window was
 * click-through for one tick, the OS took the button elsewhere — the pet stayed
 * in drag state forever: it kept following the cursor and stopped doing
 * anything else, because "not dragging" is what lets it size itself and change
 * moods again. Listening on the window costs nothing and closes the last gap.
 */
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
window.addEventListener('blur', release);

pet.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  api.openMenu();
});

/*
 * Click-through is decided in the main process, by polling the cursor: the
 * window ignores mouse events, so nothing here would ever hear the pointer
 * arrive. The renderer stays out of it.
 */

/*
 * One face, two windows — and this renderer is only a consumer.
 *
 * The main process owns the current face (state + source + timestamp). It
 * sends the same payload to the ball and to the island; this page paints it
 * and spells it with the fixed kaomoji table. There is deliberately no idle
 * mood timer here: the pet still borrows expressions, but the main process
 * picks them, so both windows cannot be holding different ones.
 */
let faceState = 'idle';

api.onFace((payload) => {
  const state = payload && typeof payload === 'object' ? payload.state : '';
  if (!state) return;
  faceState = state;
  ball.state = state;
  // The bubble is the same face in text: one key, one table entry, no RNG.
  say(faceFor(state));
  // A borrowed mood carries the motion that plays with it; the main process
  // keeps that decision next to the face.
  if (payload.motion) ball.play?.(payload.motion);
});

// The main process picks the action, so a poke and the menu agree on what is
// possible.
api.onAction((action) => {
  if (action === 'bounce') ball.bounce?.(0.5);
  else if (action === 'spin') ball.spin?.(1.5);
  else if (action === 'burst') ball.burst?.(18);
});

/** Switch the character: new paint, new signature face, new signature motion. */
api.onCast((id) => {
  const next = castMember(id);
  if (!next) return;
  ball.cast = id;
  // The face does not move here; the main process broadcasts the resident
  // state again after the cast changes the signature expression pool.
});

api.onSize((px) => {
  // Mid-drag the window is being moved; a size update here would fight the
  // grab and can leave the ball larger than the window.
  if (dragging) return;
  ball.setAttribute('size', String(clampBall(px)));
});

/*
 * Where the bubble goes follows where the ball is.
 *
 * The bubble always takes the side the screen is NOT on: docked to the left
 * edge, the ball's left is off-screen, so the bubble goes at three o'clock.
 * Free-standing, it sits above.
 */
function setBubbleDirection(side) {
  const map = { left: 'right', right: 'left', top: 'down', bottom: 'up' };
  document.body.dataset.dir = map[side] ?? 'up';
}

setBubbleDirection(null);
api.onDock((side) => {
  bubbleAllowed = !!side;
  setBubbleDirection(side ? side.replace('-open', '') : null);
  // Leaving the edge takes the bubble with it, not just its next update.
  if (!bubbleAllowed) bubble.dataset.visible = 'false';
  // Docked, the bubble should say something at once rather than wait for the
  // next mood; an empty bubble beside a tucked pet looks broken.
  else say(faceFor(faceState));
});

if (typeof api.debugState === 'function') {
  api.debugState().then((s) => {
    if (s?.docked) {
      bubbleAllowed = true;
      setBubbleDirection(s.docked.replace('-open', ''));
    }
  }).catch(() => {});
}

// The window is transparent; a frame with no character in it reads as a crash.
// The ball occupies the square below the bubble strip, so the smaller of the
// two dimensions is the one that fits.
/*
 * The ball is sized from the window, but never unbounded.
 *
 * A window that crosses monitors can report a new innerWidth/Height mid-drag;
 * sizing straight from it made the ball grow and stay grown. Clamping to the
 * range the menu offers (48..240) keeps a bad measurement from becoming a
 * giant pet, and the drag guard keeps the size stable while the window moves.
 */
function clampBall(px) {
  return Math.max(48, Math.min(240, Math.round(px)));
}

function fitBall() {
  if (dragging) return;
  // 16px of animation margin plus 88px of bubble room on each side; the
  // window is square and the ball is centred, so both axes agree.
  const room = (16 + 88) * 2;
  const px = clampBall(Math.min(window.innerWidth, window.innerHeight) - room);
  ball.setAttribute('size', String(px));
  document.documentElement.style.setProperty('--ball-size', `${px}px`);
}

window.addEventListener('resize', fitBall);
fitBall();
