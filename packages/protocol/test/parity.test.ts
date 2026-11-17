/**
 * Parity with the upstream protocol.
 *
 * This package reimplements the two-digit protocol so it can ship with no
 * runtime dependency on the engine. That makes divergence the main risk: an
 * upstream id changes and our table silently disagrees.
 *
 * When `@aora-bot/engine` is installed (it is a devDependency), these tests
 * compare the two tables row by row. If upstream is not installed they skip,
 * which keeps the package testable on its own.
 */
import { describe, expect, it } from 'vitest';
import { EMOTIONS, EMOTION_SEGMENTS } from '../src/index.js';

type UpstreamDef = { id: string; state: string; oneshot?: boolean };
type UpstreamModule = {
  EMOTIONS: readonly UpstreamDef[];
  EMOTION_SEGMENTS: readonly { id: string; range: readonly [number, number] }[];
};

let upstream: UpstreamModule | null = null;
try {
  upstream = (await import('@aora-bot/engine/agent')) as unknown as UpstreamModule;
} catch {
  upstream = null;
}

const whenUpstream = upstream?.EMOTIONS?.length ? describe : describe.skip;

whenUpstream('parity with @aora-bot/engine', () => {
  it('uses the same ids, in the same order', () => {
    const theirs = upstream!.EMOTIONS.map((d) => d.id);
    expect(EMOTIONS.map((d) => d.id)).toEqual(theirs);
  });

  it('maps every id to the same state', () => {
    const ours = new Map(EMOTIONS.map((d) => [d.id, d.state]));
    for (const def of upstream!.EMOTIONS) {
      expect(ours.get(def.id), `id ${def.id}`).toBe(def.state);
    }
  });

  it('agrees on which ids are events', () => {
    const ours = new Map(EMOTIONS.map((d) => [d.id, d.oneshot === true]));
    for (const def of upstream!.EMOTIONS) {
      expect(ours.get(def.id), `id ${def.id}`).toBe(def.oneshot === true);
    }
  });

  it('agrees on the segment boundaries', () => {
    expect(EMOTION_SEGMENTS.map((s) => [s.id, s.range])).toEqual(
      upstream!.EMOTION_SEGMENTS.map((s) => [s.id, s.range]),
    );
  });
});
