import {
  emotionSegment,
  isOneshotEmotion,
  type EmotionId,
  type SegmentId,
  type StateId,
} from './emotions.js';
import { parseAgentMessageDetailed, type AgentMessage, type ParseFailure } from './parse.js';

export interface ChannelChange {
  emotionId: EmotionId;
  state: StateId;
  /** Whether the change came from an agent message or from the host itself. */
  source: 'agent' | 'host';
}

export interface ChannelEvents {
  /** A new emotion is on screen. */
  change: ChannelChange;
  /** An agent message carried a caption. */
  tips: { text: string; emotionId: EmotionId };
  /** A message could not be read. The character keeps its current face. */
  error: { reason: ParseFailure; input: unknown };
}

export type ChannelListener<K extends keyof ChannelEvents> = (event: ChannelEvents[K]) => void;

export interface EmotionChannel {
  /** Feed a wire message: object, JSON string, bare id or state name. */
  feed(input: unknown): AgentMessage | null;
  /** Set the emotion directly, bypassing parsing. */
  setEmotion(id: EmotionId | StateId | number): AgentMessage | null;
  /** The emotion currently on screen. */
  current(): AgentMessage;
  /** Observe one event kind. Returns an unsubscribe function. */
  on<K extends keyof ChannelEvents>(kind: K, listener: ChannelListener<K>): () => void;
  /** Stop delivering events and drop every listener. */
  dispose(): void;
}

export interface ChannelOptions {
  /** Emotion shown before anything arrives. */
  initial?: EmotionId | StateId;
  /**
   * Whether a rejected message emits `error`. On by default: a host that
   * renders a face should not fail silently. Turn it off for a hook that
   * writes the same malformed line every second.
   */
  reportErrors?: boolean;
  /** Fallback emotion for anything unreadable. Defaults to the initial one. */
  fallback?: EmotionId | StateId;
}

/**
 * A framework-free bridge between a wire protocol and a host.
 *
 * This is the piece Emotion Ball shipped as `handleAIMessage` and Aora Bot
 * ships as the agent channel, reduced to one object: feed it a message, and
 * subscribe to what the character should be doing. It knows nothing about
 * the DOM, so the same instance works in a browser, an Electron main
 * process, a Node relay or a VS Code extension.
 */
export function createEmotionChannel(options: ChannelOptions = {}): EmotionChannel {
  const initial = parseAgentMessageDetailed(options.initial ?? '02');
  const initialMessage: AgentMessage = initial.message ?? { emotionId: '02', state: 'idle' };
  const fallbackId = parseAgentMessageDetailed(options.fallback ?? initialMessage.emotionId).message?.emotionId ?? '02';
  const reportErrors = options.reportErrors !== false;

  let current: AgentMessage = { ...initialMessage };
  const listeners: { [K in keyof ChannelEvents]: Set<ChannelListener<K>> } = {
    change: new Set(),
    tips: new Set(),
    error: new Set(),
  };

  const emit = <K extends keyof ChannelEvents>(kind: K, event: ChannelEvents[K]): void => {
    for (const listener of listeners[kind]) {
      try {
        (listener as ChannelListener<K>)(event);
      } catch {
        // A listener that throws must not stop the others; the face still
        // has to render.
      }
    }
  };

  const apply = (message: AgentMessage, source: 'agent' | 'host'): void => {
    const changed = message.emotionId !== current.emotionId;
    current = message;
    if (changed) emit('change', { emotionId: message.emotionId, state: message.state, source });
    if (message.tips) emit('tips', { text: message.tips, emotionId: message.emotionId });
  };

  return {
    feed(input) {
      const result = parseAgentMessageDetailed(input);
      if (result.message) {
        apply(result.message, 'agent');
        return result.message;
      }
      if (reportErrors) emit('error', { reason: result.reason ?? 'not-object', input });
      // An unreadable message must not blank the face: keep the current one,
      // unless the decade tells us something useful (handled by the parser).
      return { emotionId: fallbackId, state: current.state };
    },
    setEmotion(id) {
      const result = parseAgentMessageDetailed(id);
      if (!result.message) return null;
      apply(result.message, 'host');
      return result.message;
    },
    current() {
      return current;
    },
    on(kind, listener) {
      listeners[kind].add(listener as never);
      return () => {
        listeners[kind].delete(listener as never);
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
export const isEvent = (id: EmotionId): boolean => isOneshotEmotion(id);
/** The decade an id lives in, for grouping in a picker or a log. */
export const segmentOf = (id: EmotionId): SegmentId | null => emotionSegment(id);
