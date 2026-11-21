/**
 * Media signals as emotions, and the one place that decides which emotion wins.
 *
 * Two jobs, both pure and both testable without Electron:
 *
 * 1. **Mapping.** A media snapshot (playing / live / paused / failed), the
 *    foreground game and an agent's status are translated into protocol
 *    emotion ids. The table is the contract; callers never pick ids by hand.
 * 2. **Priority.** Manual previews outrank agent state, agent state outranks
 *    media, media outranks idling — and whatever is showing holds for at
 *    least `minDisplayMs` before anything may replace it, so a one-second
 *    track change cannot strobe the face.
 *
 * The clock and the timer are injectable so the unit tests can run this
 * deterministically instead of sleeping for two real seconds.
 */

const MEDIA_EMOTION = Object.freeze({
    playing: '10', // Happy
    live: '13', // Surprised: a stream that never ends is a different thing
    game: '16', // Focused
    paused: '02', // Idle
    error: '11', // Puzzled
});

const AGENT_EMOTION = Object.freeze({
    running: '30', // Thinking
    done: '33', // Done
    error: '34', // Error
});

/** Where a source sits; higher wins. Idling is the zero case, not a source. */
const TIER = Object.freeze({ manual: 3, agent: 2, media: 1 });

const DEFAULT_IDLE = '02';

/**
 * A media snapshot, as one emotion id (or null when there is nothing to say).
 *
 * A live stream is told apart by its duration: the media service reports 0 for
 * a stream with no end, and a normal track always knows how long it is. A game
 * wins over audio because it is what the person is looking at.
 */
function mediaEmotion(snapshot = {}, options = {}) {
    const { enabled = true } = options;
    if (!enabled) return null;
    if (snapshot.error) return MEDIA_EMOTION.error;
    if (snapshot.game) return MEDIA_EMOTION.game;
    if (!snapshot.active) return null;
    if (snapshot.playing && Number(snapshot.duration) === 0) return MEDIA_EMOTION.live;
    if (snapshot.playing) return MEDIA_EMOTION.playing;
    return MEDIA_EMOTION.paused;
}

/** An agent status word (running / done / error) as an emotion id. */
function agentEmotion(status) {
    return AGENT_EMOTION[status] ?? null;
}

function isEmotionId(value) {
    return typeof value === 'string' && /^\d{2}$/.test(value);
}

/**
 * The priority + dwell gate.
 *
 * `set` is level-triggered: a source keeps its emotion until it sets another
 * or clears. `resolve` is therefore always "the highest tier that has
 * something to say", not "the last event". Events do not need special
 * handling here; the protocol arbiter above this already queues them.
 */
function createEmotionDirector(options = {}) {
    const now = options.now ?? (() => Date.now());
    const schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    const cancel = options.cancel ?? ((handle) => clearTimeout(handle));
    const minDisplayMs = Number.isFinite(options.minDisplayMs) ? options.minDisplayMs : 2000;
    const idleEmotionId = options.idleEmotionId ?? DEFAULT_IDLE;
    const onApply = options.onApply;

    const sources = new Map();
    let shown = null;
    let timer = null;

    const resolve = () => {
        let best = null;
        for (const [source, entry] of sources) {
            if (!entry.emotionId) continue;
            if (!best || TIER[source] > TIER[best.source]) best = { source, ...entry };
        }
        return best ?? { source: 'idle', emotionId: idleEmotionId };
    };

    const apply = (next) => {
        shown = { ...next, at: now() };
        onApply?.({ emotionId: shown.emotionId, source: shown.source, ...(shown.tips ? { tips: shown.tips } : {}) });
    };

    const evaluate = () => {
        if (timer != null) {
            cancel(timer);
            timer = null;
        }
        const next = resolve();
        if (!shown) {
            apply(next);
            return;
        }
        if (next.emotionId === shown.emotionId) {
            // Same face from a stronger source: keep the dwell, take the label.
            shown.source = next.source;
            if (next.tips) shown.tips = next.tips;
            return;
        }
        const wait = shown.at + minDisplayMs - now();
        if (wait <= 0) {
            apply(next);
            return;
        }
        timer = schedule(() => {
            timer = null;
            evaluate();
        }, wait);
    };

    return {
        /**
         * Publish one source's emotion. `tips` is the bubble text the agent
         * sent with it; it travels only while that source is on screen.
         */
        set(source, emotionId, tips = '') {
            if (!(source in TIER)) throw new Error('unknown emotion source: ' + source);
            if (!isEmotionId(emotionId)) throw new Error('emotion id must be two digits: ' + emotionId);
            const entry = tips ? { emotionId, tips } : { emotionId };
            sources.set(source, entry);
            evaluate();
        },
        clear(source) {
            if (!(source in TIER)) throw new Error('unknown emotion source: ' + source);
            if (sources.delete(source)) evaluate();
        },
        /** What the sources say right now, ignoring dwell. */
        resolve,
        /** What is on screen. */
        current() {
            return shown ? { ...shown } : null;
        },
        /** Forget everything and put the idle face back immediately. */
        reset() {
            if (timer != null) {
                cancel(timer);
                timer = null;
            }
            sources.clear();
            shown = null;
            evaluate();
        },
    };
}

module.exports = { MEDIA_EMOTION, AGENT_EMOTION, mediaEmotion, agentEmotion, createEmotionDirector };
