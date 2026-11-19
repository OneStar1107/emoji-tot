/**
 * The ball: drag it, click it, right-click it, and let the host change its face.
 *
 * Everything here is presentation. What to show arrives already resolved as a
 * state name from the main process — this file never learns what an id means,
 * so the protocol table has exactly one home.
 */
import { faceFor } from './faces.js';
import { castMember, FACE_META } from './vendor/core/index.js';

const pet = document.getElementById('pet');
const bubble = document.getElementById('bubble');
const ball = document.querySelector('emojitot-ball');
const api = window.petAPI;

// Everything below sets properties on the custom element, so it has to exist
// first. Module scripts are ordered, but making the dependency explicit is
// cheaper than debugging a race.
await customElements.whenDefined('emojitot-ball');

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

/** The state the host asked for; a borrowed mood must never outlive it. */
let taskState = 'idle';

api.onState((message) => {
  actionToken += 1;
  if (message.state) {
    taskState = message.state;
    ball.state = taskState;
  }
  const face = faceFor(taskState);
  if (face) say(face);
});

/* What the other window reported — the island has no moods of its own. */
api.onFace((state) => {
  if (!state) return;
  actionToken += 1;
  ball.state = state;
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
    api.reportFace('idle');
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
/*
 * Two pools, because a ball with a job and a ball with nothing to do are not
 * the same character.
 *
 * Idle, it may wear any living or feeling face — that is what makes it feel
 * alive. Busy, it may only wear faces the job itself could produce; a pet that
 * starts giggling mid-task reads as "not actually doing anything".
 */
const IDLE_MOODS = FACE_META
  .filter((m) => m.group !== 'agent' && !['idle', 'sleeping', 'powering-down', 'spawning'].includes(m.id))
  .map((m) => m.id);
const AGENT_MOODS = FACE_META.filter((m) => m.group === 'agent' && m.id !== 'waiting').map((m) => m.id);

/*
 * The member the pet is wearing. Its signature expression leads the mood pool
 * and its signature motion plays when the mood ends, so switching the cast
 * changes behaviour, not just paint.
 */
let member = castMember('tot');

/*
 * A shuffled queue instead of a random pick.
 *
 * Random picks repeat, and a repeat is what makes an idle pet feel scripted.
 * Drawing without replacement from a reshuffled bag guarantees no two
 * consecutive moods are the same, and that every mood appears once per cycle.
 */
let moodBag = [];

function refillBag() {
  const busy = taskState !== 'idle';
  const pool = busy ? AGENT_MOODS : [member?.face, ...IDLE_MOODS].filter(Boolean);
  const unique = [...new Set(pool)].filter((state) => state !== 'idle' && state !== taskState);
  for (let i = unique.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  moodBag = unique;
}

function nextMood() {
  if (!moodBag.length) refillBag();
  return moodBag.pop();
}
let moodTimer = null;

function scheduleMood() {
  clearTimeout(moodTimer);
  moodTimer = window.setTimeout(() => {
    /*
     * A running task owns the face.
     *
     * With a job in flight the ball only borrows other *agent* states — never
     * a feeling. Sadness or delight in the middle of a task is a lie about
     * what is happening; another agent state is just a change of activity.
     */
    if (!document.hidden && !dragging) {
      const mood = nextMood();
      const token = ++actionToken;
      ball.state = mood;
      /*
       * Say it out loud: the island cannot invent a mood of its own, so an
       * unannounced borrow here is exactly the drift the user saw.
       */
      api.reportFace(mood);
      const face = faceFor(mood);
      if (face) say(face);
      // A little motion with the expression, or it reads as a freeze-frame.
      const motion = member?.motion ?? 'bounce';
      if (Math.random() < 0.7) ball.play?.(motion);
      // Every hold is a different length; a fixed beat turns into a metronome.
      const hold = 1800 + Math.random() * 2600;
      window.setTimeout(() => {
        if (token !== actionToken) return;
        // Snap straight back to whatever the host asked for: the borrowed mood
        // is a guest, the task state is the resident.
        ball.state = taskState;
        api.reportFace(taskState);
        ball.play?.(motion);
      }, hold);
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
  api.reportFace('idle');
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
  else say(faceFor(ball.state) || faceFor(taskState));
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