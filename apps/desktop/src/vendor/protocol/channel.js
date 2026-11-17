"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.segmentOf = exports.isEvent = void 0;
exports.createEmotionChannel = createEmotionChannel;
const emotions_js_1 = require("./emotions.js");
const parse_js_1 = require("./parse.js");
/**
 * A framework-free bridge between a wire protocol and a host.
 *
 * This is the piece Emotion Ball shipped as `handleAIMessage` and Aora Bot
 * ships as the agent channel, reduced to one object: feed it a message, and
 * subscribe to what the character should be doing. It knows nothing about
 * the DOM, so the same instance works in a browser, an Electron main
 * process, a Node relay or a VS Code extension.
 */
function createEmotionChannel(options = {}) {
    const initial = (0, parse_js_1.parseAgentMessageDetailed)(options.initial ?? '02');
    const initialMessage = initial.message ?? { emotionId: '02', state: 'idle' };
    const fallbackId = (0, parse_js_1.parseAgentMessageDetailed)(options.fallback ?? initialMessage.emotionId).message?.emotionId ?? '02';
    const reportErrors = options.reportErrors !== false;
    let current = { ...initialMessage };
    const listeners = {
        change: new Set(),
        tips: new Set(),
        error: new Set(),
    };
    const emit = (kind, event) => {
        for (const listener of listeners[kind]) {
            try {
                listener(event);
            }
            catch {
                // A listener that throws must not stop the others; the face still
                // has to render.
            }
        }
    };
    const apply = (message, source) => {
        const changed = message.emotionId !== current.emotionId;
        current = message;
        if (changed)
            emit('change', { emotionId: message.emotionId, state: message.state, source });
        if (message.tips)
            emit('tips', { text: message.tips, emotionId: message.emotionId });
    };
    return {
        feed(input) {
            const result = (0, parse_js_1.parseAgentMessageDetailed)(input);
            if (result.message) {
                apply(result.message, 'agent');
                return result.message;
            }
            if (reportErrors)
                emit('error', { reason: result.reason ?? 'not-object', input });
            // An unreadable message must not blank the face: keep the current one,
            // unless the decade tells us something useful (handled by the parser).
            return { emotionId: fallbackId, state: current.state };
        },
        setEmotion(id) {
            const result = (0, parse_js_1.parseAgentMessageDetailed)(id);
            if (!result.message)
                return null;
            apply(result.message, 'host');
            return result.message;
        },
        current() {
            return current;
        },
        on(kind, listener) {
            listeners[kind].add(listener);
            return () => {
                listeners[kind].delete(listener);
            };
        },
        dispose() {
            listeners.change.clear();
            listeners.tips.clear();
            listeners.error.clear();
        },
    };
}
/** Whether an id is a moment rather than a condition. Convenience re-export. */
const isEvent = (id) => (0, emotions_js_1.isOneshotEmotion)(id);
exports.isEvent = isEvent;
/** The decade an id lives in, for grouping in a picker or a log. */
const segmentOf = (id) => (0, emotions_js_1.emotionSegment)(id);
exports.segmentOf = segmentOf;
