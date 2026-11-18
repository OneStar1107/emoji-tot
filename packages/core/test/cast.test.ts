import { describe, expect, it } from 'vitest';
import {
  BODY_IDS,
  CAST,
  CAST_IDS,
  COLOR_IDS,
  FACE_IDS,
  FAMILIES,
  MOTIONS,
  TRAIT_IDS,
  breed,
  castMember,
} from '../src/index.js';

/*
 * The cast is data, and data drifts. A member naming a body that was renamed,
 * or a trait that was never added to the trait table, renders as a plain ball
 * with no warning — this file is what makes that a test failure instead.
 */
describe('cast data', () => {
  it('has a unique id per member', () => {
    expect(new Set(CAST_IDS).size).toBe(CAST_IDS.length);
  });

  it('names only bodies that exist', () => {
    for (const member of CAST) {
      expect(BODY_IDS, member.id + ' body').toContain(member.body);
    }
  });

  it('names only colours that exist', () => {
    for (const member of CAST) {
      expect(COLOR_IDS, member.id + ' color').toContain(member.color);
    }
  });

  it('names only faces that exist', () => {
    for (const member of CAST) {
      expect(FACE_IDS, member.id + ' face').toContain(member.face);
    }
  });

  it('names only motions that exist', () => {
    for (const member of CAST) {
      expect(MOTIONS as readonly string[], member.id + ' motion').toContain(member.motion);
    }
  });

  it('names only families that exist', () => {
    const ids = FAMILIES.map((family) => family.id);
    for (const member of CAST) {
      expect(ids, member.id + ' family').toContain(member.family);
    }
  });

  it('names only traits that exist', () => {
    for (const member of CAST) {
      for (const trait of member.traits) {
        expect(TRAIT_IDS, member.id + ' trait').toContain(trait);
      }
    }
  });

  it('keeps the trait the RAW table declares', () => {
    // The seventh column used to be dropped on the floor, so every member
    // rendered trairless and breed() had nothing to inherit.
    expect(castMember('xingxing')?.traits).toEqual(['starfield']);
    expect(castMember('lizi')?.traits).toEqual(['leaf']);
    expect(castMember('xinbao')?.traits).toEqual(['blush']);
    expect(castMember('tot')?.traits).toEqual([]);
    const withTraits = CAST.filter((member) => member.traits.length > 0);
    expect(withTraits.length).toBeGreaterThan(0);
  });

  it('has at most one trait per member', () => {
    for (const member of CAST) {
      expect(member.traits.length, member.id).toBeLessThanOrEqual(1);
    }
  });
});

describe('breed', () => {
  const a = castMember('lizi');
  const b = castMember('xingxing');

  it('can inherit a trait from either parent', () => {
    const seen = new Set();
    for (let seed = 0; seed < 24; seed += 1) {
      const child = breed(a!, b!, seed);
      expect(child.traits.length).toBeLessThanOrEqual(1);
      for (const trait of child.traits) {
        expect(TRAIT_IDS).toContain(trait);
        seen.add(trait);
      }
    }
    // Seeds 0,3,6… take from a; seeds 1,4,7… take from b.
    expect(seen.has('leaf')).toBe(true);
    expect(seen.has('starfield')).toBe(true);
  });

  it('produces a complete genome every time', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const child = breed(a!, b!, seed);
      expect(BODY_IDS).toContain(child.body);
      expect(COLOR_IDS).toContain(child.color);
      expect(FACE_IDS).toContain(child.face);
      expect(MOTIONS as readonly string[]).toContain(child.motion);
      expect(FAMILIES.map((family) => family.id)).toContain(child.family);
    }
  });

  it('is deterministic for one seed', () => {
    expect(breed(a!, b!, 7)).toEqual(breed(a!, b!, 7));
  });
});
