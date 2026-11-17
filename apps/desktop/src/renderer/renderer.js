/**
 * The ball: drag it, click it, right-click it, and let the host change its face.
 *
 * Everything here is presentation. What to show arrives already resolved as a
 * state name from the main process — this file never learns what an id means,
 * so the protocol table has exactly one home.
 */
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
 * The window is click-through until the pointer is on the ball.
 *
 * Coordinates are checked against the circle rather than the element box: the
 * window is taller than the ball to make room for the bubble, and the corners
 * of a square hit area would steal clicks from the desktop behind them.
 */
let overBall = false;

window.addEventListener('pointermove', (event) => {
  const box = pet.getBoundingClientRect();
  const diameter = box.height - 46;
  const cx = box.width / 2;
  const cy = 46 + diameter / 2;
  const inside = Math.hypot(event.clientX - cx, event.clientY - cy) <= diameter / 2;
  if (inside !== overBall) {
    overBall = inside;
    api.pointerOver(inside);
  }
});

window.addEventListener('pointerleave', () => {
  if (!overBall) return;
  overBall = false;
  api.pointerOver(false);
});

api.onState((message) => {
  if (message.state) ball.state = message.state;
  if (message.tips) say(message.tips);
});

// The main process picks the action, so a poke and the menu agree on what is
// possible.
api.onAction((action) => {
  if (action === 'bounce') ball.bounce?.(0.5);
  else if (action === 'spin') ball.spin?.(1.5);
  else if (action === 'burst') ball.burst?.(18);
});

api.onSize((px) => {
  ball.setAttribute('size', String(px));
});

// The window is transparent; a frame with no character in it reads as a crash.
// The ball occupies the square below the bubble strip, so the smaller of the
// two dimensions is the one that fits.
function fitBall() {
  const px = Math.max(32, Math.min(window.innerWidth, window.innerHeight - 46));
  ball.setAttribute('size', String(px));
}

window.addEventListener('resize', fitBall);
fitBall();
