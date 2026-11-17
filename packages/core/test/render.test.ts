import { describe, expect, it } from 'vitest';
import { FACES, SHAPE_IDS, renderCharacter } from '../src/index.js';

describe('renderCharacter', () => {
  it('draws every shape in every state', () => {
    const states = Object.keys(FACES);
    for (const shape of SHAPE_IDS) {
      for (const state of states) {
        const svg = renderCharacter({ shape, color: 'black', state, size: 64 });
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg.endsWith('</svg>')).toBe(true);
        expect(svg).toContain('<path');
      }
    }
    expect(SHAPE_IDS.length * states.length).toBeGreaterThan(300);
  });

  it('is deterministic', () => {
    const a = renderCharacter({ shape: 'circle', color: 'pink', state: 'happy', size: 96 });
    const b = renderCharacter({ shape: 'circle', color: 'pink', state: 'happy', size: 96 });
    expect(a).toBe(b);
  });

  it('falls back instead of rendering blank', () => {
    const svg = renderCharacter({ shape: 'circle', color: 'black', state: 'no-such-state', size: 64 });
    expect(svg).toContain('<circle');
    expect(svg).toContain('<path');
  });

  it('honours size', () => {
    expect(renderCharacter({ shape: 'circle', color: 'black', state: 'idle', size: 240 })).toContain('width="240"');
  });

  it('refuses an unknown shape by name', () => {
    expect(() => renderCharacter({ shape: 'nope', color: 'black', state: 'idle', size: 64 })).toThrow(/Unknown shape/);
  });
});
