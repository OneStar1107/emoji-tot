import {
  emotionIdForState,
  isOneshotEmotion,
  stateForEmotion,
  IDLE_EMOTION_ID,
  IDLE_STATE,
  type EmotionId,
  type StateId,
} from './emotions.js';
import type { HudSpec } from './parse.js';

/**
 * Multi-session state arbitration.
 *
 * One character, several sources: a coding agent with three sub-agents, or a
 * chat window and a background job. Each reports its own state; the arbiter
 * decides what the character shows. Four rules:
 *
 * 1. **Priority.** Among visible sessions the highest-priority state wins.
 *    One session erroring while three work shows the error.
 * 2. **Minimum dwell.** A state holds the screen for `minDisplayMs` before it
 *    can be replaced. Without it a burst of tool events makes the face
 *    flicker; with it every expression lands and is read.
 * 3. **Events vs conditions.** A one-shot id ("done", "error") is an event
 *    and is never dropped: if it arrives during a dwell it is queued and
 *    played when the dwell ends. A continuous state is a condition: when its
 *    dwell ends the arbiter re-resolves, because the situation may have moved
 *    on.
 * 4. **Expiry.** A session silent for `sessionTtlMs` is forgotten, so a tool
 *    with no end-of-session hook cannot pin the character forever.
 *
 * Pure logic; the clock and timers are injectable so tests can run it
 * deterministically.
 */

export interface ArbiterUpdate {
  sessionId: string;
  /** Either form of address. */
  state?: StateId;
  emotionId?: EmotionId;
  tips?: string;
  hud?: HudSpec;
  /** Tracked but never displayed: background work must not take over the face. */
  headless?: boolean;
}

export interface ArbiterResult {
  state: StateId;
  emotionId: EmotionId;
  tips?: string;
  hud?: HudSpec;
  sessionId?: string;
}

export interface ArbiterSession {
  state: StateId;
  emotionId: EmotionId;
  tips?: string;
  hud?: HudSpec;
  headless: boolean;
  lastSeen: number;
}

export interface ArbiterOptions {
  /** Called whenever the displayed state changes. */
  onApply?: (result: ArbiterResult) => void;
  /** Dwell before a state may be replaced. Default 900 ms. */
  minDisplayMs?: number;
  /** Priority overrides, by state. Higher wins. */
  priority?: Partial<Record<StateId, number>>;
  /** Override which states are events. Defaults to the protocol's one-shot ids. */
  oneshot?: readonly StateId[];
  /** Forget a session after this long without an update. Default 120 s. */
  sessionTtlMs?: number;
  /** What to show when no session is visible. */
  idleEmotionId?: EmotionId;
  /** Injectable clock and timers. */
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

export interface Arbiter {
  update(update: ArbiterUpdate): void;
  remove(sessionId: string): void;
  /** Expire stale sessions and re-resolve. */
  tick(): void;
  /** What the sessions say right now, ignoring dwell. */
  resolve(): ArbiterResult;
  /** What is actually being shown. */
  current(): ArbiterResult | null;
  sessions(): ReadonlyMap<string, ArbiterSession>;
  /** Observe the displayed state. Fires immediately if there is one. */
  subscribe(listener: (result: ArbiterResult) => void): () => void;
  dispose(): void;
}

/**
 * Default priorities. Errors and refusals beat everything because they need a
 * human; completion beats ongoing work because it is the result; ongoing work
 * beats idling. States not listed fall back to 0.
 */
export const DEFAULT_PRIORITY: Partial<Record<StateId, number>> = {
  alerting: 80,
  refusing: 70,
  celebrate: 60,
  surprised: 55,
  receiving: 50,
  notifying: 48,
  dragging: 46,
  searching: 42,
  loading: 42,
  working: 40,
  writing: 40,
  reading: 40,
  sending: 40,
  uploading: 40,
  composing: 36,
  progress: 34,
  thinking: 30,
  waiting: 28,
  listening: 26,
  'powering-down': 22,
  waking: 15,
  spawning: 15,
};

const DEFAULT_ONESHOT_STATES: readonly StateId[] = [
  'celebrate', 'alerting', 'surprised', 'receiving', 'notifying', 'refusing', 'waking', 'spawning',
];

const priorityOf = (state: StateId, table: Partial<Record<StateId, number>>): number =>
  table[state] ?? 0;

export function createArbiter(options: ArbiterOptions = {}): Arbiter {
  const now = options.now ?? (() => Date.now());
  const schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const minDisplayMs = options.minDisplayMs ?? 900;
  const sessionTtlMs = options.sessionTtlMs ?? 120_000;
  const priority = { ...DEFAULT_PRIORITY, ...options.priority };
  const idleEmotionId = options.idleEmotionId ?? IDLE_EMOTION_ID;
  const oneshotStates = new Set<StateId>(options.oneshot ?? DEFAULT_ONESHOT_STATES);

  const sessions = new Map<string, ArbiterSession>();
  const listeners = new Set<(result: ArbiterResult) => void>();

  let shown: ArbiterResult | null = null;
  let dwellUntil = 0;
  let timer: unknown = null;
  /** Events that arrived during a dwell, played when it ends. */
  let queued: ArbiterResult | null = null;

  const idleResult = (): ArbiterResult => ({
    state: stateForEmotion(idleEmotionId),
    emotionId: idleEmotionId,
  });

  const resolve = (): ArbiterResult => {
    let best: ArbiterResult | null = null;
    let bestScore = -1;
    for (const [sessionId, session] of sessions) {
      if (session.headless) continue;
      const score = priorityOf(session.state, priority);
      if (score > bestScore) {
        bestScore = score;
        best = {
          state: session.state,
          emotionId: session.emotionId,
          sessionId,
          ...(session.tips ? { tips: session.tips } : {}),
          ...(session.hud ? { hud: session.hud } : {}),
        };
      }
    }
    return best ?? idleResult();
  };

  const publish = (result: ArbiterResult): void => {
    // `shown` starts as the idle frame: a host that mounts a character
    // before any session reports in still has something to draw.

    const changed = shown == null
      || shown.emotionId !== result.emotionId
      || shown.tips !== result.tips
      || shown.hud !== result.hud;
    shown = result;
    if (!changed) return;
    options.onApply?.(result);
    for (const listener of listeners) {
      try {
        listener(result);
      } catch {
        // A listener that throws must not break arbitration.
      }
    }
  };

  const clearTimer = (): void => {
    if (timer != null) {
      cancel(timer);
      timer = null;
    }
  };

  /** Show a result now and start a dwell; anything already queued is kept. */
  const apply = (result: ArbiterResult): void => {
    clearTimer();
    publish(result);
    dwellUntil = now() + minDisplayMs;
    timer = schedule(() => {
      timer = null;
      const pending = queued;
      queued = null;
      if (pending) {
        apply(pending);
        return;
      }
      apply(resolve());
    }, minDisplayMs);
  };

  const update = (update: ArbiterUpdate): void => {
    const emotionId = update.emotionId
      ?? (update.state ? emotionIdForState(update.state) : null);
    if (!emotionId) return;

    const state = update.state ?? stateForEmotion(emotionId);
    sessions.set(update.sessionId, {
      state,
      emotionId,
      headless: update.headless === true,
      lastSeen: now(),
      ...(update.tips ? { tips: update.tips } : {}),
      ...(update.hud ? { hud: update.hud } : {}),
    });

    const next: ArbiterResult = {
      state,
      emotionId,
      sessionId: update.sessionId,
      ...(update.tips ? { tips: update.tips } : {}),
      ...(update.hud ? { hud: update.hud } : {}),
    };

    // A headless session is tracked (so `resolve` can see it) but never
    // takes the screen, not even with an event.
    if (update.headless) return;

    const isEvent = oneshotStates.has(state) || isOneshotEmotion(emotionId);
    const inDwell = now() < dwellUntil;
    if (shown && shown.emotionId === next.emotionId && shown.sessionId === next.sessionId) return;

    if (isEvent) {
      // Events are never dropped. An event more urgent than what is on screen
      // interrupts the dwell — a failure must be seen now, not 900 ms later.
      // Anything else waits its turn, so a burst of tool events cannot make
      // the face flicker.
      const shownPriority = shown ? priorityOf(shown.state, priority) : -1;
      const urgent = priorityOf(state, priority) > shownPriority;
      if (inDwell && !urgent) {
        if (!queued || priorityOf(queued.state, priority) <= priorityOf(state, priority)) {
          queued = next;
        }
        return;
      }
      apply(next);
      return;
    }

    if (inDwell) return;
    apply(next);
  };

  const tick = (): void => {
    const cutoff = now() - sessionTtlMs;
    let expired = false;
    for (const [id, session] of sessions) {
      if (session.lastSeen < cutoff) {
        sessions.delete(id);
        expired = true;
      }
    }
    if (!expired) return;
    // A session disappearing is a condition ending, not a new event: it does
    // not need to wait for the dwell, or the face would keep showing work
    // that is no longer happening.
    apply(resolve());
  };

  publish(idleResult());
  dwellUntil = now();

  return {
    update,
    remove(sessionId) {
      sessions.delete(sessionId);
      if (now() >= dwellUntil) apply(resolve());
    },
    tick,
    resolve,
    current: () => shown,
    sessions: () => sessions,
    subscribe(listener) {
      listeners.add(listener);
      if (shown) listener(shown);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      clearTimer();
      sessions.clear();
      listeners.clear();
      shown = null;
      queued = null;
    },
  };
}

/** Default idle state, re-exported for hosts that need it without the table. */
export { IDLE_STATE };
