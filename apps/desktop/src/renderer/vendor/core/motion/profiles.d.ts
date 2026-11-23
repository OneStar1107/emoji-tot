/**
 * How each face behaves when it is alive.
 *
 * A face says what Tot looks like; a profile says how that face settles,
 * breathes, looks around and blinks. The table is intentionally compositional:
 * families provide a safe baseline and only the states with a distinct acting
 * idea receive overrides.
 */
import { type EyeStyle } from '../face.js';
export type GazeMode = 'center' | 'wander' | 'up' | 'down' | 'scan' | 'pointer';
export interface MotionProfile {
    energy: number;
    breath: number;
    sway: number;
    lift: number;
    tilt: number;
    eyeHold: number;
    blinkMin: number;
    blinkMax: number;
    gaze: GazeMode;
    eyes: readonly EyeStyle[];
    signal: 'none' | 'orbit' | 'scan' | 'progress' | 'spark';
}
export declare function motionProfile(state: string): MotionProfile;
