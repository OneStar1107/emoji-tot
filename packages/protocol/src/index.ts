/**
 * @emojibot-studio/protocol
 *
 * The two-digit emotion protocol, its parser, a multi-session arbiter and an
 * event bridge. No DOM, no runtime dependencies: the same code runs in a
 * browser, an Electron main process, a Node relay or a VS Code extension.
 *
 * The ids and their decade semantics come from Emotion Ball; the state
 * vocabulary and the arbitration rules follow Aora Bot. See NOTICE.md.
 */

export {
  EMOTIONS,
  EMOTION_IDS,
  EMOTION_SEGMENTS,
  SEGMENT_FALLBACK,
  IDLE_EMOTION_ID,
  IDLE_STATE,
  emotionSegment,
  emotionIdForState,
  getEmotion,
  isOneshotEmotion,
  isStateId,
  normaliseId,
  resolveEmotionId,
  stateForEmotion,
} from './emotions.js';
export type { EmotionDef, EmotionId, Segment, SegmentId, StateId } from './emotions.js';

export { parseAgentMessage, parseAgentMessageDetailed } from './parse.js';
export type { AgentMessage, HudSpec, ParseFailure, ParseResult } from './parse.js';

export { createArbiter, DEFAULT_PRIORITY } from './arbiter.js';
export type { Arbiter, ArbiterOptions, ArbiterResult, ArbiterSession, ArbiterUpdate } from './arbiter.js';

export { createEmotionChannel, isEvent, segmentOf } from './channel.js';
export type { ChannelChange, ChannelEvents, ChannelListener, ChannelOptions, EmotionChannel } from './channel.js';
