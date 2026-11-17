/**
 * The ball: drag it, click it, right-click it, and let the host change its face.
 *
 * Everything here is presentation. What to show arrives already resolved as a
 * state name from the main process — this file never learns what an id means,
 * so the protocol table has exactly one home.
 */
import { faceFor } from './faces.js';

const pet = document.getElementById('pet');
const bubble = document.getElementById('bubble');
const ball = document.querySelector('aora-bot');
const api = window.petAPI;

// Everything below sets properties on the custom element, so it has to exist
// first. Module scripts are ordered, but making the dependency explicit is
// cheaper than debugging a race.
await customElements.whenDefined('aora-bot');

let bubbleTimer = null;

function say(text) {
  if (!text) {
    bubble.dataset.visible = 'false';
    return;
  }
  bubble.textContent = text;
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

pet.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  dragging = true;
  travelled = false;
  grabbedAt = { x: event.screenX, y: event.screenY };
  pet.setPointerCapture?.(event.pointerId);
  api.dragStart(grabbedAt);
});

pet.addEventListener('pointermove', (event) => {
  if (!dragging || !grabbedAt) return;
  if (Math.hypot(event.screenX - grabbedAt.x, event.screenY - grabbedAt.y) > 4) travelled = true;
});

function release() {
  if (!dragging) return;
  dragging = false;
  api.dragEnd();
  // A press that never travelled is a poke, not a drag.
  if (!travelled) api.poke();
}

pet.addEventListener('pointerup', release);
pet.addEventListener('pointercancel', release);

pet.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  api.openMenu();
});

/*
 * Click-through is decided in the main process, by polling the cursor: the
 * window ignores mouse events, so nothing here would ever hear the pointer
 * arrive. The renderer stays out of it.
 */

/** A counter so a late timer cannot overwrite a state that just arrived. */
let actionToken = 0;

api.onState((message) => {
  actionToken += 1;
  if (message.state) ball.state = message.state;
  // Kaomoji first: the bubble speaks the same language as the face.
  const face = faceFor(message.state, message.tips);
  if (face) say(face);
});

// The main process picks the action, so a poke and the menu agree on what is
// possible.
api.onAction((action) => {
  const token = ++actionToken;
  if (action === 'bounce') ball.bounce?.(0.5);
  else if (action === 'spin') ball.spin?.(1.5);
  else if (action === 'burst') ball.burst?.(18);

  // A poke is a moment, not a condition: once it has played, the face goes
  // back to waiting. Without this the ball kept whatever expression the poke
  // happened to land on.
  window.setTimeout(() => {
    if (token !== actionToken) return;
    ball.state = 'idle';
  }, 1700);
});

/*
 * Left alone, it does something now and then.
 *
 * A desktop pet that only reacts is furniture. This is deliberately slow and
 * only runs while idle, so it reads as a breath rather than a notification.
 */
let lastAntic = Date.now();
window.setInterval(() => {
  if (document.hidden) return;
  if (ball.state !== 'idle') {
    lastAntic = Date.now();
    return;
  }
  if (Date.now() - lastAntic < 24000) return;
  lastAntic = Date.now();
  const roll = Math.random();
  if (roll < 0.45) ball.bounce?.(0.3);
  else if (roll < 0.75) ball.spin?.(1);
  else {
    ball.state = 'curious';
    window.setTimeout(() => {
      if (ball.state === 'curious') ball.state = 'idle';
    }, 2400);
  }
}, 8000);

api.onSize((px) => {
  ball.setAttribute('size', String(px));
});

/*
 * While docked the bubble has to grow inward, or it would be the part that
 * hangs off the screen.
 */
api.onDock((side) => {
  if (side) document.body.dataset.docked = side;
  else delete document.body.dataset.docked;
});

if (typeof api.debugState === 'function') {
  api.debugState().then((s) => {
    if (s?.docked) document.body.dataset.docked = s.docked.startsWith('left') ? 'left' : 'right';
  }).catch(() => {});
}

// The window is transparent; a frame with no character in it reads as a crash.
// The ball occupies the square below the bubble strip, so the smaller of the
// two dimensions is the one that fits.
function fitBall() {
  // 16px of margin on each side plus the bubble strip, matching the CSS.
  const px = Math.max(32, Math.min(window.innerWidth - 32, window.innerHeight - 46 - 32));
  ball.setAttribute('size', String(px));
}

window.addEventListener('resize', fitBall);
fitBall();
