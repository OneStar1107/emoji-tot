"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAgentMessage = parseAgentMessage;
exports.parseAgentMessageDetailed = parseAgentMessageDetailed;
const emotions_js_1 = require("./emotions.js");
/**
 * Parse the wire form of a message.
 *
 * Accepted shapes, as an object or a JSON string of one:
 *
 * ```json
 * { "emotionId": "34", "tips": "步骤失败" }
 * { "emotionId": 33 }
 * { "state": "thinking" }
 * ```
 *
 * A bare id or state name (`"34"`, `"thinking"`) is accepted too, because a
 * shell hook emitting `echo 34` should not need to quote JSON.
 *
 * Returns `null` for malformed input instead of throwing, for the same
 * reason `stateForEmotion` never throws. Callers decide whether to log.
 */
function parseAgentMessage(input) {
    let raw = input;
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed)
            return null;
        if (trimmed.startsWith('{')) {
            try {
                raw = JSON.parse(trimmed);
            }
            catch {
                return null;
            }
        }
        else {
            const id = (0, emotions_js_1.resolveEmotionId)(trimmed);
            return id ? { emotionId: id, state: (0, emotions_js_1.stateForEmotion)(id) } : null;
        }
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return null;
    const m = raw;
    const candidate = m.emotionId ?? m.emotion ?? m.state;
    if (candidate == null || (typeof candidate !== 'string' && typeof candidate !== 'number')) {
        return null;
    }
    const emotionId = (0, emotions_js_1.resolveEmotionId)(candidate);
    if (!emotionId)
        return null;
    const message = { emotionId, state: (0, emotions_js_1.stateForEmotion)(emotionId) };
    if (m.tips != null && m.tips !== '')
        message.tips = String(m.tips);
    if (m.hud != null && typeof m.hud === 'object' && !Array.isArray(m.hud)) {
        message.hud = m.hud;
    }
    return message;
}
/**
 * `parseAgentMessage` with the reason a message was rejected.
 *
 * A host that shows a face to a user wants to know whether a silent failure
 * means "the agent said nothing" (`empty`) or "the agent said something we
 * could not read" (`bad-json`, `unknown-id`), because only the second is
 * worth a warning.
 */
function parseAgentMessageDetailed(input) {
    if (input == null || (typeof input === 'string' && !input.trim())) {
        return { ok: false, message: null, reason: 'empty' };
    }
    let candidate = input;
    if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (trimmed.startsWith('{')) {
            try {
                candidate = JSON.parse(trimmed);
            }
            catch {
                return { ok: false, message: null, reason: 'bad-json' };
            }
        }
    }
    if (typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)) {
        const m = candidate;
        if (m.emotionId == null && m.emotion == null && m.state == null) {
            return { ok: false, message: null, reason: 'no-id' };
        }
    }
    const message = parseAgentMessage(input);
    if (message)
        return { ok: true, message };
    const probe = typeof candidate === 'string' ? (0, emotions_js_1.normaliseId)(candidate.trim()) : '';
    const reason = probe && !(0, emotions_js_1.emotionSegment)(probe) ? 'unknown-id' : 'not-object';
    return { ok: false, message: null, reason };
}
