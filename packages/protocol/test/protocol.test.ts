import { describe, expect, it } from 'vitest';
import {
  EMOTIONS,
  EMOTION_IDS,
  EMOTION_SEGMENTS,
  IDLE_EMOTION_ID,
  SEGMENT_FALLBACK,
  emotionIdForState,
  emotionSegment,
  isOneshotEmotion,
  isStateId,
  normaliseId,
  parseAgentMessage,
  parseAgentMessageDetailed,
  resolveEmotionId,
  stateForEmotion,
} from '../src/index.js';
import { createEmotionChannel } from '../src/channel.js';

describe('table', () => {
  it('has unique, two-digit ids in the declared segments', () => {
    const seen = new Set<string>();
    for (const def of EMOTIONS) {
      expect(def.id).toMatch(/^\d{2}$/);
      expect(seen.has(def.id)).toBe(false);
      seen.add(def.id);
      const seg = emotionSegment(def.id);
      expect(seg).not.toBeNull();
      const n = Number(def.id);
      const range = EMOTION_SEGMENTS.find((s) => s.id === seg)!.range;
      expect(n).toBeGreaterThanOrEqual(range[0]);
      expect(n).toBeLessThanOrEqual(range[1]);
    }
    expect(EMOTION_IDS.length).toBe(EMOTIONS.length);
  });

  it('maps every state to an id and back', () => {
    const states = new Set(EMOTIONS.map((d) => d.state));
    for (const state of states) {
      const id = emotionIdForState(state);
      expect(resolveEmotionId(id)).toBe(id);
      expect(stateForEmotion(id)).toBe(state);
    }
  });

  it('has a usable fallback for every segment', () => {
    // A fallback may sit in another decade on purpose: an unknown feeling
    // degrades to idle rather than to some other feeling.
    for (const seg of EMOTION_SEGMENTS) {
      const fallback = SEGMENT_FALLBACK[seg.id];
      expect(resolveEmotionId(fallback)).toBe(fallback);
      expect(isStateId(stateForEmotion(fallback))).toBe(true);
    }
  });

  it('treats done / error / surprised as events', () => {
    expect(isOneshotEmotion('33')).toBe(true);
    expect(isOneshotEmotion('34')).toBe(true);
    expect(isOneshotEmotion('13')).toBe(true);
    expect(isOneshotEmotion('32')).toBe(false);
  });
});

describe('normaliseId', () => {
  it('pads single digits and trims', () => {
    expect(normaliseId(3)).toBe('03');
    expect(normaliseId('3')).toBe('03');
    expect(normaliseId(' 03 ')).toBe('03');
    expect(normaliseId('34')).toBe('34');
  });
});

describe('stateForEmotion', () => {
  it('resolves known ids', () => {
    expect(stateForEmotion('00')).toBe('sleeping');
    expect(stateForEmotion('34')).toBe('error');
    expect(stateForEmotion(33)).toBe('done');
  });

  it('falls back inside the segment for unknown ids', () => {
    // A newer protocol's lifecycle id degrades to idle, not to a feeling.
    expect(stateForEmotion('09')).toBe('dragging');
    expect(stateForEmotion('28')).toBe(stateForEmotion(SEGMENT_FALLBACK.feeling));
    expect(stateForEmotion('58')).toBe(stateForEmotion(SEGMENT_FALLBACK.signalling));
  });

  it('never throws on junk', () => {
    for (const junk of [null, undefined, '', 'abc', '999', '-1', '3.5', {} as unknown as string]) {
      expect(() => stateForEmotion(junk as never)).not.toThrow();
      expect(isStateId(stateForEmotion(junk as never))).toBe(true);
    }
  });
});

describe('parseAgentMessage', () => {
  it('accepts the documented shapes', () => {
    expect(parseAgentMessage('{"emotion":34}')?.state).toBe('error');
    expect(parseAgentMessage({ emotionId: 33 })?.state).toBe('done');
    expect(parseAgentMessage({ emotion: '14' })?.emotionId).toBe('14');
    expect(parseAgentMessage({ state: 'thinking' })?.emotionId).toBe('30');
    expect(parseAgentMessage('13')?.state).toBe('surprised');
    expect(parseAgentMessage('thinking')?.emotionId).toBe('30');
    expect(parseAgentMessage(' 03 ')?.emotionId).toBe('03');
  });

  it('carries tips and hud through', () => {
    const m = parseAgentMessage({ emotionId: '32', tips: '正在读取文件', hud: { kind: 'progress', value: 0.4 } });
    expect(m?.tips).toBe('正在读取文件');
    expect(m?.hud?.kind).toBe('progress');
  });

  it('returns null for malformed input', () => {
    for (const input of ['', '   ', '{', 'null', '[]', 42, true, { nope: 1 }]) {
      expect(parseAgentMessage(input)).toBeNull();
    }
  });

  it('explains why a message was rejected', () => {
    expect(parseAgentMessageDetailed('').reason).toBe('empty');
    expect(parseAgentMessageDetailed('{oops').reason).toBe('bad-json');
    expect(parseAgentMessageDetailed({ foo: 1 }).reason).toBe('no-id');
    expect(parseAgentMessageDetailed('abc').reason).toBe('unknown-id');
  });
});

describe('createEmotionChannel', () => {
  it('reports changes, tips and errors', () => {
    const channel = createEmotionChannel({ initial: '02' });
    const changes: string[] = [];
    const tips: string[] = [];
    const errors: string[] = [];
    channel.on('change', (e) => changes.push(e.emotionId));
    channel.on('tips', (e) => tips.push(e.text));
    channel.on('error', (e) => errors.push(e.reason));

    channel.feed('{"emotionId":"34","tips":"失败了"}');
    channel.feed('nonsense');
    channel.feed('34'); // same id, no second change

    expect(changes).toEqual(['34']);
    expect(tips).toEqual(['失败了']);
    expect(errors).toEqual(['unknown-id']);
    expect(channel.current().state).toBe('error');
  });

  it('keeps the current face when a message cannot be read', () => {
    const channel = createEmotionChannel({ initial: '30' });
    channel.feed({ bad: true });
    expect(channel.current().emotionId).toBe('30');
  });

  it('stops delivering after dispose', () => {
    const channel = createEmotionChannel();
    let count = 0;
    channel.on('change', () => count++);
    channel.feed('10');
    channel.dispose();
    channel.feed('21');
    expect(count).toBe(1);
  });
});
