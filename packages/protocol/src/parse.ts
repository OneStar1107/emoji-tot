import {
  emotionSegment,
  normaliseId,
  resolveEmotionId,
  stateForEmotion,
  type EmotionId,
  type StateId,
} from './emotions.js';

/** A dial the host may draw beside the character. Validated by the host, not here. */
export interface HudSpec {
  kind: string;
  value?: number;
  text?: string;
  [key: string]: unknown;
}

/** A parsed agent message: a state to adopt, an optional caption and an optional dial. */
export interface AgentMessage {
  emotionId: EmotionId;
  state: StateId;
  /** Free text the host may show beside the character. */
  tips?: string;
  /**
   * A dial to draw in the ring outside the body. Passed through untouched:
   * a message that also says something about the state is still worth
   * delivering even when its HUD is unusable.
   */
  hud?: HudSpec;
}

/**
 * Parse the wire form of a message.
 *
 * Accepted shapes, as an object or a JSON string of one:
 *
 * ```json
 * { "emotionId": "34", "tips": "步骤失败" }
 * { "aoraBotId": 33 }
 * { "state": "thinking" }
 * ```
 *
 * A bare id or state name (`"34"`, `"thinking"`) is accepted too, because a
 * shell hook emitting `echo 34` should not need to quote JSON.
 *
 * Returns `null` for malformed input instead of throwing, for the same
 * reason `stateForEmotion` never throws. Callers decide whether to log.
 */
export function parseAgentMessage(input: unknown): AgentMessage | null {
  let raw: unknown = input;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{')) {
      try {
        raw = JSON.parse(trimmed);
      } catch {
        return null;
      }
    } else {
      const id = resolveEmotionId(trimmed);
      return id ? { emotionId: id, state: stateForEmotion(id) } : null;
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const m = raw as Record<string, unknown>;
  const candidate = m.aoraBotId ?? m.emotionId ?? m.emotion ?? m.state;
  if (candidate == null || (typeof candidate !== 'string' && typeof candidate !== 'number')) {
    return null;
  }

  const emotionId = resolveEmotionId(candidate);
  if (!emotionId) return null;

  const message: AgentMessage = { emotionId, state: stateForEmotion(emotionId) };
  if (m.tips != null && m.tips !== '') message.tips = String(m.tips);
  if (m.hud != null && typeof m.hud === 'object' && !Array.isArray(m.hud)) {
    message.hud = m.hud as HudSpec;
  }
  return message;
}

export type ParseFailure = 'empty' | 'not-object' | 'no-id' | 'unknown-id' | 'bad-json';

export interface ParseResult {
  ok: boolean;
  message: AgentMessage | null;
  /** Why parsing failed; the host decides whether to surface it. */
  reason?: ParseFailure;
}

/**
 * `parseAgentMessage` with the reason a message was rejected.
 *
 * A host that shows a face to a user wants to know whether a silent failure
 * means "the agent said nothing" (`empty`) or "the agent said something we
 * could not read" (`bad-json`, `unknown-id`), because only the second is
 * worth a warning.
 */
export function parseAgentMessageDetailed(input: unknown): ParseResult {
  if (input == null || (typeof input === 'string' && !input.trim())) {
    return { ok: false, message: null, reason: 'empty' };
  }
  let candidate: unknown = input;
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (trimmed.startsWith('{')) {
      try {
        candidate = JSON.parse(trimmed);
      } catch {
        return { ok: false, message: null, reason: 'bad-json' };
      }
    }
  }
  if (typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)) {
    const m = candidate as Record<string, unknown>;
    if (m.aoraBotId == null && m.emotionId == null && m.emotion == null && m.state == null) {
      return { ok: false, message: null, reason: 'no-id' };
    }
  }
  const message = parseAgentMessage(input);
  if (message) return { ok: true, message };
  const probe = typeof candidate === 'string' ? normaliseId(candidate.trim()) : '';
  const reason: ParseFailure = probe && !emotionSegment(probe) ? 'unknown-id' : 'not-object';
  return { ok: false, message: null, reason };
}
