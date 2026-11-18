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
  isEmotionId,
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
