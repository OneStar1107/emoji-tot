"use strict";
/**
 * @emojitot/protocol
 *
 * The two-digit emotion protocol, its parser, a multi-session arbiter and an
 * event bridge. No DOM, no runtime dependencies: the same code runs in a
 * browser, an Electron main process, a Node relay or a VS Code extension.
 *
 * The two-digit ids are this project's own contract; the state
 * vocabulary and the arbitration rules are defined here.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.segmentOf = exports.isEvent = exports.createEmotionChannel = exports.DEFAULT_PRIORITY = exports.createArbiter = exports.parseAgentMessageDetailed = exports.parseAgentMessage = exports.stateForEmotion = exports.resolveEmotionId = exports.normaliseId = exports.isStateId = exports.isOneshotEmotion = exports.isEmotionId = exports.getEmotion = exports.emotionIdForState = exports.emotionSegment = exports.IDLE_STATE = exports.IDLE_EMOTION_ID = exports.SEGMENT_FALLBACK = exports.EMOTION_SEGMENTS = exports.EMOTION_IDS = exports.EMOTIONS = void 0;
var emotions_js_1 = require("./emotions.js");
Object.defineProperty(exports, "EMOTIONS", { enumerable: true, get: function () { return emotions_js_1.EMOTIONS; } });
Object.defineProperty(exports, "EMOTION_IDS", { enumerable: true, get: function () { return emotions_js_1.EMOTION_IDS; } });
Object.defineProperty(exports, "EMOTION_SEGMENTS", { enumerable: true, get: function () { return emotions_js_1.EMOTION_SEGMENTS; } });
Object.defineProperty(exports, "SEGMENT_FALLBACK", { enumerable: true, get: function () { return emotions_js_1.SEGMENT_FALLBACK; } });
Object.defineProperty(exports, "IDLE_EMOTION_ID", { enumerable: true, get: function () { return emotions_js_1.IDLE_EMOTION_ID; } });
Object.defineProperty(exports, "IDLE_STATE", { enumerable: true, get: function () { return emotions_js_1.IDLE_STATE; } });
Object.defineProperty(exports, "emotionSegment", { enumerable: true, get: function () { return emotions_js_1.emotionSegment; } });
Object.defineProperty(exports, "emotionIdForState", { enumerable: true, get: function () { return emotions_js_1.emotionIdForState; } });
Object.defineProperty(exports, "getEmotion", { enumerable: true, get: function () { return emotions_js_1.getEmotion; } });
Object.defineProperty(exports, "isEmotionId", { enumerable: true, get: function () { return emotions_js_1.isEmotionId; } });
Object.defineProperty(exports, "isOneshotEmotion", { enumerable: true, get: function () { return emotions_js_1.isOneshotEmotion; } });
Object.defineProperty(exports, "isStateId", { enumerable: true, get: function () { return emotions_js_1.isStateId; } });
Object.defineProperty(exports, "normaliseId", { enumerable: true, get: function () { return emotions_js_1.normaliseId; } });
Object.defineProperty(exports, "resolveEmotionId", { enumerable: true, get: function () { return emotions_js_1.resolveEmotionId; } });
Object.defineProperty(exports, "stateForEmotion", { enumerable: true, get: function () { return emotions_js_1.stateForEmotion; } });
var parse_js_1 = require("./parse.js");
Object.defineProperty(exports, "parseAgentMessage", { enumerable: true, get: function () { return parse_js_1.parseAgentMessage; } });
Object.defineProperty(exports, "parseAgentMessageDetailed", { enumerable: true, get: function () { return parse_js_1.parseAgentMessageDetailed; } });
var arbiter_js_1 = require("./arbiter.js");
Object.defineProperty(exports, "createArbiter", { enumerable: true, get: function () { return arbiter_js_1.createArbiter; } });
Object.defineProperty(exports, "DEFAULT_PRIORITY", { enumerable: true, get: function () { return arbiter_js_1.DEFAULT_PRIORITY; } });
var channel_js_1 = require("./channel.js");
Object.defineProperty(exports, "createEmotionChannel", { enumerable: true, get: function () { return channel_js_1.createEmotionChannel; } });
Object.defineProperty(exports, "isEvent", { enumerable: true, get: function () { return channel_js_1.isEvent; } });
Object.defineProperty(exports, "segmentOf", { enumerable: true, get: function () { return channel_js_1.segmentOf; } });
