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
const ball = document.querySelector('emojibot-ball');
const api = window.petAPI;

// Everything below sets properties on the custom element, so it has to exist
// first. Module scripts are ordered, but making the dependency explicit is
// cheaper than debugging a race.
await customElements.whenDefined('emojibot-ball');

let bubbleTimer = null;

/**
 * The bubble only speaks while docked.
 *
 * A pet standing in the middle of the desktop with a label over its head is
 * a widget. Docked at an edge it is out of the way and the bubble becomes the
 * only thing telling you what it is doing, which is when it earns its space.
 */
let bubbleAllowed = false;

function say(text) {
  if (!text || !bubbleAllowed) {
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
  const face = faceFor(message.state);
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
 * Left alone, it lives.
 *
 * The resting face is idle, but a pet that only ever rests is a screensaver.
 * Every 7–16 seconds it borrows one expression from a pool, holds it for a
 * couple of seconds, then goes back to idle — and the next borrow never
 * repeats the last one. Timers are chained rather than fixed so the rhythm
 * does not turn into a metronome.
 */
const GENERIC_MOODS = ['curious', 'happy', 'bored', 'excited', 'playful', 'proud', 'shy', 'humming', 'surprised', 'confused'];

/*
 * The member the pet is wearing. Its signature expression leads the mood pool
 * and its signature motion plays when the mood ends, so switching the cast
 * changes behaviour, not just paint.
 */
let member = castMember('bot');
let lastMood = null;
let moodTimer = null;

function scheduleMood() {
  clearTimeout(moodTimer);
  moodTimer = window.setTimeout(() => {
    if (!document.hidden && ball.state === 'idle' && !dragging) {
      const pool = [member?.face, ...GENERIC_MOODS.filter((m) => m !== member?.face)].filter((m) => m && m !== lastMood);
      const mood = pool[Math.floor(Math.random() * pool.length)];
      lastMood = mood;
      const token = ++actionToken;
      ball.state = mood;
      const face = faceFor(mood);
      if (face) say(face);
      // A little motion with the expression, or it reads as a freeze-frame.
      const motion = member?.motion ?? 'bounce';
      if (Math.random() < 0.7) ball.play?.(motion);
      window.setTimeout(() => {
        if (token !== actionToken) return;
        ball.state = 'idle';
        ball.play?.(motion);
      }, 2400 + Math.random() * 1600);
    }
    scheduleMood();
  }, 7000 + Math.random() * 9000);
}

scheduleMood();

/** Switch the character: new paint, new signature face, new signature motion. */
api.onCast((id) => {
  const next = castMember(id);
  if (!next) return;
  member = next;
  ball.cast = id;
  ball.state = 'idle';
});

api.onSize((px) => {
  ball.setAttribute('size', String(px));
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
function fitBall() {
  // 16px of animation margin plus 88px of bubble room on each side; the
  // window is square and the ball is centred, so both axes agree.
  const room = (16 + 88) * 2;
  const px = Math.max(32, Math.min(window.innerWidth, window.innerHeight) - room);
  ball.setAttribute('size', String(px));
  document.documentElement.style.setProperty('--ball-size', `${px}px`);
}

window.addEventListener('resize', fitBall);
fitBall();