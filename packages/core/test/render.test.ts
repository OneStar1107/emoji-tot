import { describe, expect, it } from 'vitest';
import { BODY_IDS, FACE_IDS, renderCharacter } from '../src/index.js';

/*
 * The engine renders a pure function of its options, so a still image can be
 * asserted byte for byte — which is the whole reason these tests can be this
 * blunt. Two things they deliberately do not do: hard-code how many bodies or
 * faces exist (that is the constants' job, and a literal here would drift the
 * moment either table grows), and reach for a specific SVG element (the
 * silhouette moved from <circle> to a hand-written <path> and the test should
 * not care which).
 */
describe('renderCharacter', () => {
  it('draws every body in every state', () => {
    let drawn = 0;
    for (const body of BODY_IDS) {
      for (const state of FACE_IDS) {
        const svg = renderCharacter({ body, color: 'black', state, size: 64 });
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg.endsWith('</svg>')).toBe(true);
        expect(svg).toContain('<path');
        drawn += 1;
      }
    }
    // Every combination was visited, not just the first body.
    expect(drawn).toBe(BODY_IDS.length * FACE_IDS.length);
    expect(drawn).toBeGreaterThan(300);
  });

  it('is deterministic', () => {
    const a = renderCharacter({ body: 'circle', color: 'pink', state: 'happy', size: 96 });
    const b = renderCharacter({ body: 'circle', color: 'pink', state: 'happy', size: 96 });
    expect(a).toBe(b);
  });

  it('falls back instead of rendering blank', () => {
    const unknown = renderCharacter({ body: 'circle', color: 'black', state: 'no-such-state', size: 64 });
    const idle = renderCharacter({ body: 'circle', color: 'black', state: 'idle', size: 64 });
    // An unlisted state adopts the idle face rather than drawing an empty box.
    expect(unknown).toBe(idle);
    expect(unknown).toContain('<path');
  });

  it('honours size', () => {
    expect(renderCharacter({ body: 'circle', color: 'black', state: 'idle', size: 240 })).toContain('width="240"');
  });

  it('refuses an unknown body by name', () => {
    expect(() => renderCharacter({ body: 'nope', color: 'black', state: 'idle', size: 64 })).toThrow(
      /Unknown body "nope"/,
    );
  });

  it('keeps the legacy shape alias working', () => {
    const viaShape = renderCharacter({ shape: 'circle', color: 'black', state: 'idle', size: 64 });
    const viaBody = renderCharacter({ body: 'circle', color: 'black', state: 'idle', size: 64 });
    expect(viaShape).toBe(viaBody);
  });
});
