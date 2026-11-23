import { describe, expect, it } from 'vitest';
import {
  EYE_POLYGONS,
  FACE_IDS,
  createCharacterStateMachine,
  createSpring,
  eyePolygonsFor,
  morphPolygon,
  motionProfile,
  stepSpring,
} from '../src/index.js';

describe('spring motion', () => {
  it('converges to its target without producing non-finite values', () => {
    const spring = createSpring(0, 1);
    for (let i = 0; i < 600; i += 1) stepSpring(spring, 1 / 120, 18, 1);
    expect(Number.isFinite(spring.value)).toBe(true);
    expect(Number.isFinite(spring.velocity)).toBe(true);
    expect(spring.value).toBeCloseTo(1, 3);
    expect(spring.velocity).toBeCloseTo(0, 2);
  });

  it('substeps a visibly delayed frame instead of exploding', () => {
    const spring = createSpring(0, 1);
    stepSpring(spring, 0.5, 18, 1);
    expect(Number.isFinite(spring.value)).toBe(true);
    expect(Math.abs(spring.value)).toBeLessThanOrEqual(2);
  });
});

describe('polygon eyes', () => {
  it('uses one stable vertex count for every eye topology', () => {
    const counts = Object.values(EYE_POLYGONS).map((polygon) => polygon.length);
    expect(new Set(counts).size).toBe(1);
    expect(counts[0]).toBeGreaterThanOrEqual(12);
  });

  it('gives every face two polygons that can morph directly', () => {
    for (const state of FACE_IDS) {
      const [left, right] = eyePolygonsFor(state);
      expect(left).toHaveLength(right.length);
      expect(left.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
      expect(right.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    }
  });

  it('interpolates endpoints exactly and the midpoint by hand', () => {
    const square = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ] as const;
    const offset = [
      [2, 2],
      [4, 2],
      [4, 4],
      [2, 4],
    ] as const;
    expect(morphPolygon(square, offset, 0)).toEqual(square);
    expect(morphPolygon(square, offset, 1)).toEqual(offset);
    expect(morphPolygon(square, offset, 0.5)).toEqual([
      [1, 1],
      [3, 1],
      [3, 3],
      [1, 3],
    ]);
  });
});

describe('character state machine', () => {
  it('records a transition only when the state really changes', () => {
    const machine = createCharacterStateMachine('idle');
    expect(machine.transition('happy', 'operator', 100)).toBe(true);
    expect(machine.transition('happy', 'duplicate', 120)).toBe(false);
    expect(machine.transition('thinking', 'emotion:30', 180)).toBe(true);
    expect(machine.snapshot()).toMatchObject({
      state: 'thinking',
      previous: 'happy',
      changedAt: 180,
    });
    expect(machine.snapshot().history.map((entry) => entry.state)).toEqual(['happy', 'thinking']);
  });

  it('returns to a known state without inventing an empty previous value', () => {
    const machine = createCharacterStateMachine('idle');
    machine.transition('happy', 'operator', 10);
    machine.reset('idle', 20);
    expect(machine.snapshot().previous).toBe('happy');
    expect(machine.snapshot().history.at(-1)?.reason).toBe('reset');
  });
});

describe('motion profiles', () => {
  it('covers every drawable face with finite motion values and an eye playlist', () => {
    for (const state of FACE_IDS) {
      const profile = motionProfile(state);
      expect(profile.eyes.length).toBeGreaterThan(0);
      for (const value of [
        profile.energy,
        profile.breath,
        profile.sway,
        profile.lift,
        profile.tilt,
        profile.eyeHold,
        profile.blinkMin,
        profile.blinkMax,
      ]) {
        expect(Number.isFinite(value), state).toBe(true);
      }
      expect(profile.blinkMax).toBeGreaterThanOrEqual(profile.blinkMin);
    }
  });

  it('falls back to idle motion for an unknown state', () => {
    expect(motionProfile('not-a-state')).toEqual(motionProfile('idle'));
  });
});
