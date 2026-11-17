"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IDLE_STATE = exports.DEFAULT_PRIORITY = void 0;
exports.createArbiter = createArbiter;
const emotions_js_1 = require("./emotions.js");
Object.defineProperty(exports, "IDLE_STATE", { enumerable: true, get: function () { return emotions_js_1.IDLE_STATE; } });
/**
 * Default priorities. Errors and refusals beat everything because they need a
 * human; completion beats ongoing work because it is the result; ongoing work
 * beats idling. States not listed fall back to 0.
 */
exports.DEFAULT_PRIORITY = {
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
const DEFAULT_ONESHOT_STATES = [
    'celebrate', 'alerting', 'surprised', 'receiving', 'notifying', 'refusing', 'waking', 'spawning',
];
const priorityOf = (state, table) => table[state] ?? 0;
function createArbiter(options = {}) {
    const now = options.now ?? (() => Date.now());
    const schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    const cancel = options.cancel ?? ((handle) => clearTimeout(handle));
    const minDisplayMs = options.minDisplayMs ?? 900;
    const sessionTtlMs = options.sessionTtlMs ?? 120_000;
    const priority = { ...exports.DEFAULT_PRIORITY, ...options.priority };
    const idleEmotionId = options.idleEmotionId ?? emotions_js_1.IDLE_EMOTION_ID;
    const oneshotStates = new Set(options.oneshot ?? DEFAULT_ONESHOT_STATES);
    const sessions = new Map();
    const listeners = new Set();
    let shown = null;
    let dwellUntil = 0;
    let timer = null;
    /** Events that arrived during a dwell, played when it ends. */
    let queued = null;
    const idleResult = () => ({
        state: (0, emotions_js_1.stateForEmotion)(idleEmotionId),
        emotionId: idleEmotionId,
    });
    const resolve = () => {
        let best = null;
        let bestScore = -1;
        for (const [sessionId, session] of sessions) {
            if (session.headless)
                continue;
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
    const publish = (result) => {
        // `shown` starts as the idle frame: a host that mounts a character
        // before any session reports in still has something to draw.
        const changed = shown == null
            || shown.emotionId !== result.emotionId
            || shown.tips !== result.tips
            || shown.hud !== result.hud;
        shown = result;
        if (!changed)
            return;
        options.onApply?.(result);
        for (const listener of listeners) {
            try {
                listener(result);
            }
            catch {
                // A listener that throws must not break arbitration.
            }
        }
    };
    const clearTimer = () => {
        if (timer != null) {
            cancel(timer);
            timer = null;
        }
    };
    /** Show a result now and start a dwell; anything already queued is kept. */
    const apply = (result) => {
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
    const update = (update) => {
        const emotionId = update.emotionId
            ?? (update.state ? (0, emotions_js_1.emotionIdForState)(update.state) : null);
        if (!emotionId)
            return;
        const state = update.state ?? (0, emotions_js_1.stateForEmotion)(emotionId);
        sessions.set(update.sessionId, {
            state,
            emotionId,
            headless: update.headless === true,
            lastSeen: now(),
            ...(update.tips ? { tips: update.tips } : {}),
            ...(update.hud ? { hud: update.hud } : {}),
        });
        const next = {
            state,
            emotionId,
            sessionId: update.sessionId,
            ...(update.tips ? { tips: update.tips } : {}),
            ...(update.hud ? { hud: update.hud } : {}),
        };
        // A headless session is tracked (so `resolve` can see it) but never
        // takes the screen, not even with an event.
        if (update.headless)
            return;
        const isEvent = oneshotStates.has(state) || (0, emotions_js_1.isOneshotEmotion)(emotionId);
        const inDwell = now() < dwellUntil;
        if (shown && shown.emotionId === next.emotionId && shown.sessionId === next.sessionId)
            return;
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
        if (inDwell)
            return;
        apply(next);
    };
    const tick = () => {
        const cutoff = now() - sessionTtlMs;
        let expired = false;
        for (const [id, session] of sessions) {
            if (session.lastSeen < cutoff) {
                sessions.delete(id);
                expired = true;
            }
        }
        if (!expired)
            return;
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
            if (now() >= dwellUntil)
                apply(resolve());
        },
        tick,
        resolve,
        current: () => shown,
        sessions: () => sessions,
        subscribe(listener) {
            listeners.add(listener);
            if (shown)
                listener(shown);
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
