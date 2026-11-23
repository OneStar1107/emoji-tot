/**
 * A small critically-damped-capable spring.
 *
 * This is used for continuous character motion, not general-purpose easing.
 * Large frames are split into bounded substeps so a background tab returning
 * after half a second still produces the same gentle settle instead of one
 * enormous Euler jump.
 */
export interface SpringState {
  value: number;
  velocity: number;
  target: number;
}

const MAX_STEP = 1 / 120;
const MAX_FRAME = 0.5;

export function createSpring(value = 0, target = value): SpringState {
  return { value, velocity: 0, target };
}

/**
 * Advance a spring by `dt` seconds.
 *
 * `frequency` controls how quickly it reaches the target and `damping` controls
 * overshoot. Values near 1 settle without visible bounce; lower values give the
 * character more rubber.
 */
export function stepSpring(
  spring: SpringState,
  dt: number,
  frequency: number,
  damping: number,
): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const frame = Math.min(dt, MAX_FRAME);
  const steps = Math.max(1, Math.ceil(frame / MAX_STEP));
  const step = frame / steps;

  for (let i = 0; i < steps; i += 1) {
    const acceleration =
      -2 * damping * frequency * spring.velocity -
      frequency * frequency * (spring.value - spring.target);
    spring.velocity += acceleration * step;
    spring.value += spring.velocity * step;
  }

  if (!Number.isFinite(spring.value) || !Number.isFinite(spring.velocity)) {
    spring.value = spring.target;
    spring.velocity = 0;
    return;
  }

  if (
    Math.abs(spring.value - spring.target) < 0.00005 &&
    Math.abs(spring.velocity) < 0.00005
  ) {
    spring.value = spring.target;
    spring.velocity = 0;
  }
}

/** Normalize a spring into 0…1 progress for UI meters. */
export function springProgress(value: number, from = 0, to = 1): number {
  if (from === to) return value === to ? 1 : 0;
  return Math.min(1, Math.max(0, (value - from) / (to - from)));
}
