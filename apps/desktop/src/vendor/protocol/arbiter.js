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
    error: 80,
    refusing: 70,
    panicked: 66,
    celebrate: 60,
    done: 60,
    surprised: 55,
    satisfied: 52,
    receiving: 50,
    notifying: 48,
    dragging: 46,
    searching: 42,
    loading: 42,
    working: 40,
    busy: 40,
    focused: 40,
    replying: 40,
    writing: 40,
    reading: 40,
    sending: 40,
    uploading: 40,
    composing: 36,
    progress: 34,
    thinking: 30,
    recalling: 29,
    waiting: 28,
    listening: 26,
    resigned: 24,
    'powering-down': 22,
    'powering-off': 22,
    puzzled: 20,
    waking: 15,
    'shake-awake': 15,
    spawning: 15,
    booting: 12,
    tired: 8,
    down: 6,
    'spacing-out': 4,
    dormant: 2,
};
const DEFAULT_ONESHOT_STATES = [
    'celebrate', 'alerting', 'done', 'error', 'panicked', 'surprised', 'receiving', 'notifying', 'refusing', 'waking', 'shake-awake', 'spawning',
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
    /**
     * Events that arrived during a dwell, played when it ends.
     *
     * This used to be a single slot: a second event either replaced the first
     * (when it outranked it) or was dropped (when it did not), so a burst of
     * "done" from one sub-agent and "error" from another lost one of them. It is
     * a sorted list now — highest priority first, arrival order within a
     * priority, nothing overwritten.
     */
    let queue = [];
    let seq = 0;
    let ttlTimer = null;
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
    /** Insert into the play queue: priority desc, arrival order within a priority. */
    const enqueue = (result) => {
        const item = { result, priority: priorityOf(result.state, priority), seq: seq++ };
        let index = queue.findIndex((entry) => entry.priority < item.priority);
        if (index < 0)
            index = queue.length;
        queue.splice(index, 0, item);
    };
    const dequeue = () => {
        const next = queue.shift();
        return next ? next.result : null;
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
            /*
             * An event holds the screen for minDisplayMs, then the next queued event
             * plays. When the queue empties the arbiter re-resolves, so the character
             * returns to the highest-priority *condition* rather than staying on the
             * last event — "done" is a moment, not a mode.
             */
            const pending = dequeue();
            if (pending) {
                apply(pending);
                return;
            }
            const next = resolve();
            /*
             * Stop re-arming when nothing changed.
             *
             * Without this guard an idle arbiter reschedules itself every
             * minDisplayMs forever: apply() always arms a dwell, so a steady state
             * became an endless chain of timers that never published anything.
             */
            if (shown && shown.state === next.state && shown.emotionId === next.emotionId)
                return;
            apply(next);
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
                // Never dropped: the queue keeps every event until it is played.
                enqueue(next);
                return;
            }
            // Urgent, or the screen is free: show it now. Whatever is still queued
            // plays afterwards, in priority order.
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
    /*
     * Expiry on a schedule.
     *
     * sessionTtlMs is what makes a tool with no end-of-session hook eventually
     * let go, but that only works if something sweeps. The interval is a quarter
     * of the TTL so a session cannot outlive it by more than that, and it is
     * unref'd where the platform allows so a forgotten arbiter does not keep a
     * process alive.
     */
    const autoTick = options.autoTick !== false;
    const ttlInterval = Math.max(1000, Math.min(Math.round(sessionTtlMs / 4), 15000));
    const armTtl = () => {
        if (!autoTick)
            return;
        ttlTimer = schedule(() => {
            ttlTimer = null;
            tick();
            armTtl();
        }, ttlInterval);
        ttlTimer?.unref?.();
    };
    publish(idleResult());
    dwellUntil = now();
    armTtl();
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
            queue = [];
            if (ttlTimer != null) {
                cancel(ttlTimer);
                ttlTimer = null;
            }
        },
    };
}
