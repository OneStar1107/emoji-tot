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
export declare function createSpring(value?: number, target?: number): SpringState;
/**
 * Advance a spring by `dt` seconds.
 *
 * `frequency` controls how quickly it reaches the target and `damping` controls
 * overshoot. Values near 1 settle without visible bounce; lower values give the
 * character more rubber.
 */
export declare function stepSpring(spring: SpringState, dt: number, frequency: number, damping: number): void;
/** Normalize a spring into 0…1 progress for UI meters. */
export declare function springProgress(value: number, from?: number, to?: number): number;
