"use strict";
/**
 * The two-digit emotion protocol.
 *
 * An agent speaks in ids, not in state names: a shell hook can emit
 * `{"emotionId":"34"}` without knowing what the character on the other end
 * calls an error, and a later version can rename a state without breaking
 * every script written against it.
 *
 * The digits are grouped by decade, so a receiver that has never seen an id
 * can still tell what kind of thing it is:
 *
 * - `00`–`09` lifecycle: asleep, waking, idle, powering down.
 * - `10`–`29` feelings.
 * - `30`–`49` agent work: thinking, searching, replying, done, error.
 * - `50`–`59` signalling: alerts and notifications aimed at the user.
 *
 * The numbering is this project's own contract: a decade is a group, the
 * forever; new ids fill gaps inside a decade so the two-digit budget holds.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isOneshotEmotion = exports.getEmotion = exports.SEGMENT_FALLBACK = exports.IDLE_STATE = exports.IDLE_EMOTION_ID = exports.EMOTION_IDS = exports.EMOTIONS = exports.EMOTION_SEGMENTS = void 0;
exports.normaliseId = normaliseId;
exports.isEmotionId = isEmotionId;
exports.emotionSegment = emotionSegment;
exports.isStateId = isStateId;
exports.stateForEmotion = stateForEmotion;
exports.emotionIdForState = emotionIdForState;
exports.resolveEmotionId = resolveEmotionId;
exports.EMOTION_SEGMENTS = [
    { id: 'lifecycle', range: [0, 9], name: { en: 'Lifecycle', zh: '生命周期' } },
    { id: 'feeling', range: [10, 29], name: { en: 'Feeling', zh: '情绪' } },
    { id: 'agent', range: [30, 49], name: { en: 'Agent work', zh: '代理工作' } },
    { id: 'signalling', range: [50, 59], name: { en: 'Signalling', zh: '提示' } },
];
exports.EMOTIONS = [
    // Lifecycle
    { id: '00', state: 'sleeping', name: { en: 'Sleeping', zh: '睡眠' } },
    { id: '01', state: 'waking', name: { en: 'Waking', zh: '唤醒' }, oneshot: true },
    { id: '02', state: 'idle', name: { en: 'Idle', zh: '待机' } },
    { id: '03', state: 'curious', name: { en: 'Curious', zh: '好奇' } },
    { id: '04', state: 'spacing-out', name: { en: 'Spacing out', zh: '发呆' } },
    { id: '05', state: 'booting', name: { en: 'Booting', zh: '加载苏醒' } },
    { id: '06', state: 'dormant', name: { en: 'Dormant', zh: '休眠' } },
    { id: '07', state: 'shake-awake', name: { en: 'Shake awake', zh: '抖动唤醒' }, oneshot: true },
    { id: '08', state: 'spawning', name: { en: 'Spawning', zh: '登场' }, oneshot: true },
    { id: '09', state: 'dragging', name: { en: 'Dragging', zh: '拖拽' } },
    // Feeling
    { id: '10', state: 'happy', name: { en: 'Happy', zh: '开心' } },
    { id: '11', state: 'puzzled', name: { en: 'Puzzled', zh: '疑惑' } },
    { id: '12', state: 'down', name: { en: 'Down', zh: '失落' } },
    { id: '13', state: 'surprised', name: { en: 'Surprised', zh: '惊讶' }, oneshot: true },
    { id: '14', state: 'shy', name: { en: 'Shy', zh: '害羞' } },
    { id: '15', state: 'tired', name: { en: 'Tired', zh: '疲惫' } },
    { id: '16', state: 'focused', name: { en: 'Focused', zh: '专注' } },
    { id: '17', state: 'panicked', name: { en: 'Panicked', zh: '慌张' } },
    { id: '18', state: 'resigned', name: { en: 'Resigned', zh: '无奈' } },
    { id: '19', state: 'satisfied', name: { en: 'Satisfied', zh: '满意' } },
    { id: '20', state: 'confused', name: { en: 'Confused', zh: '困惑' } },
    { id: '21', state: 'angry', name: { en: 'Angry', zh: '生气' } },
    { id: '22', state: 'excited', name: { en: 'Excited', zh: '兴奋' } },
    { id: '23', state: 'laughing', name: { en: 'Laughing', zh: '大笑' } },
    { id: '24', state: 'playful', name: { en: 'Playful', zh: '调皮' } },
    { id: '25', state: 'celebrate', name: { en: 'Celebrating', zh: '庆祝' }, oneshot: true },
    { id: '26', state: 'bouncing', name: { en: 'Bouncing', zh: '弹跳' } },
    { id: '27', state: 'humming', name: { en: 'Humming', zh: '哼歌' } },
    // Agent work
    { id: '30', state: 'thinking', name: { en: 'Thinking', zh: '思考中' } },
    { id: '31', state: 'receiving', name: { en: 'Receiving', zh: '接收任务' }, oneshot: true },
    { id: '32', state: 'busy', name: { en: 'Busy', zh: '处理中' } },
    { id: '33', state: 'done', name: { en: 'Done', zh: '任务完成' }, oneshot: true },
    { id: '34', state: 'error', name: { en: 'Error', zh: '出错' }, oneshot: true },
    { id: '35', state: 'listening', name: { en: 'Listening', zh: '等待输入' } },
    { id: '36', state: 'loading', name: { en: 'Loading', zh: '联网加载' } },
    { id: '37', state: 'recalling', name: { en: 'Recalling', zh: '复述回忆' } },
    { id: '38', state: 'refusing', name: { en: 'Refusing', zh: '拒绝/受限' }, oneshot: true },
    { id: '39', state: 'replying', name: { en: 'Replying', zh: '输出回复' } },
    { id: '40', state: 'searching', name: { en: 'Searching', zh: '检索资料' } },
    { id: '41', state: 'powering-off', name: { en: 'Powering off', zh: '停止终止' } },
    { id: '42', state: 'reading', name: { en: 'Reading', zh: '阅读' } },
    { id: '43', state: 'writing', name: { en: 'Writing', zh: '写入' } },
    { id: '44', state: 'sending', name: { en: 'Sending', zh: '发送' } },
    { id: '45', state: 'uploading', name: { en: 'Uploading', zh: '上传' } },
    { id: '46', state: 'dictating', name: { en: 'Dictating', zh: '语音输入' } },
    { id: '47', state: 'progress', name: { en: 'Progress', zh: '进度' } },
    { id: '48', state: 'waiting', name: { en: 'Waiting', zh: '等待' } },
    { id: '49', state: 'orbit', name: { en: 'Orbiting', zh: '环绕' } },
    // Signalling
    { id: '50', state: 'notifying', name: { en: 'Notifying', zh: '通知' }, oneshot: true },
    { id: '51', state: 'radar', name: { en: 'Scanning', zh: '扫描' } },
    { id: '52', state: 'messaging', name: { en: 'Messaging', zh: '消息' } },
];
exports.EMOTION_IDS = exports.EMOTIONS.map((d) => d.id);
const BY_ID = new Map(exports.EMOTIONS.map((d) => [d.id, d]));
/**
 * The canonical id for each state: the lowest id that maps to it. Several ids
 * share a state ("Tired" and "Dormant" both drowse), so the reverse mapping
 * has to pick one.
 */
const STATE_TO_ID = new Map();
for (const d of exports.EMOTIONS)
    if (!STATE_TO_ID.has(d.state))
        STATE_TO_ID.set(d.state, d.id);
exports.IDLE_EMOTION_ID = '02';
exports.IDLE_STATE = 'idle';
/**
 * Fallback chain for unknown ids, by segment. An id the receiver does not
 * recognise still says which decade it belongs to, and that is enough to
 * pick a reasonable stand-in rather than snapping to idle.
 */
exports.SEGMENT_FALLBACK = {
    lifecycle: '02',
    feeling: '02',
    agent: '32',
    signalling: '50',
};
/**
 * A protocol id: one or two ASCII digits, nothing else.
 *
 * This used to be "whatever parseInt makes of it", which quietly accepted
 * `'3.5'` (→ 3, lifecycle), `'58abc'` (→ 58, signalling) and a 200-character
 * string whose prefix happened to be numeric. An id that is not a
 * two-digit number is not an id, and every caller now gets null for it
 * instead of a plausible-looking wrong segment.
 */
function parseId(value) {
    if (typeof value === 'number') {
        if (!Number.isInteger(value) || value < 0 || value > 99)
            return null;
        return String(value).padStart(2, '0');
    }
    const text = String(value ?? '').trim();
    if (!/^\d{1,2}$/.test(text))
        return null;
    return text.padStart(2, '0');
}
/** Accept `3`, `'3'`, `'03'`, `' 03 '` as the same id. */
function normaliseId(id) {
    return parseId(id) ?? String(id ?? '').trim();
}
/** True only for a real two-digit protocol id. */
function isEmotionId(value) {
    return parseId(value) !== null;
}
function emotionSegment(id) {
    const key = parseId(id);
    if (!key)
        return null;
    const n = Number(key);
    for (const seg of exports.EMOTION_SEGMENTS) {
        if (n >= seg.range[0] && n <= seg.range[1])
            return seg.id;
    }
    return null;
}
const getEmotion = (id) => {
    const key = id == null ? null : parseId(id);
    return key ? BY_ID.get(key) ?? null : null;
};
exports.getEmotion = getEmotion;
const isOneshotEmotion = (id) => (0, exports.getEmotion)(id)?.oneshot === true;
exports.isOneshotEmotion = isOneshotEmotion;
function isStateId(value) {
    return STATE_TO_ID.has(value);
}
/**
 * Resolve an id to the state a character should adopt.
 *
 * Exact match first, then the segment fallback, then idle. Never throws: the
 * channel is fed by other people's scripts, and a bad id must degrade
 * gracefully rather than take the character down.
 */
function stateForEmotion(id) {
    if (id == null)
        return exports.IDLE_STATE;
    const key = parseId(id);
    // Not an id at all: no segment fallback, because there is no segment.
    if (!key)
        return exports.IDLE_STATE;
    const exact = BY_ID.get(key);
    if (exact)
        return exact.state;
    const seg = emotionSegment(key);
    return seg ? (BY_ID.get(exports.SEGMENT_FALLBACK[seg])?.state ?? exports.IDLE_STATE) : exports.IDLE_STATE;
}
/** The canonical id for a state — what a host should emit for it. */
function emotionIdForState(state) {
    return STATE_TO_ID.get(state) ?? exports.IDLE_EMOTION_ID;
}
/**
 * Resolve either form of address to an id: a two-digit protocol id, or a
 * state name. Returns `null` for anything that is neither.
 */
function resolveEmotionId(value) {
    if (value == null)
        return null;
    const s = String(value).trim();
    if (!s)
        return null;
    if (isStateId(s))
        return emotionIdForState(s);
    const key = parseId(s);
    if (!key)
        return null;
    if (BY_ID.has(key))
        return key;
    const seg = emotionSegment(key);
    return seg ? exports.SEGMENT_FALLBACK[seg] : null;
}
