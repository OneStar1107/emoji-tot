/**
 * How each face behaves when it is alive.
 *
 * A face says what Tot looks like; a profile says how that face settles,
 * breathes, looks around and blinks. The table is intentionally compositional:
 * families provide a safe baseline and only the states with a distinct acting
 * idea receive overrides.
 */
import { FACES, faceFor, faceMeta, type EyeStyle } from '../face.js';

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

type ProfilePatch = Partial<MotionProfile>;
type Family = 'life' | 'emotion' | 'agent';

const FAMILY_BASE: Record<Family, MotionProfile> = {
  life: {
    energy: 0.22,
    breath: 0.018,
    sway: 0.7,
    lift: 0.5,
    tilt: 1.2,
    eyeHold: 7200,
    blinkMin: 4200,
    blinkMax: 9000,
    gaze: 'wander',
    eyes: ['pill', 'dot'],
    signal: 'none',
  },
  emotion: {
    energy: 0.48,
    breath: 0.025,
    sway: 1.5,
    lift: 1.2,
    tilt: 2.4,
    eyeHold: 3400,
    blinkMin: 2800,
    blinkMax: 6200,
    gaze: 'wander',
    eyes: ['dot', 'arc'],
    signal: 'none',
  },
  agent: {
    energy: 0.42,
    breath: 0.022,
    sway: 1.1,
    lift: 1,
    tilt: 1.8,
    eyeHold: 2600,
    blinkMin: 3000,
    blinkMax: 6500,
    gaze: 'scan',
    eyes: ['dot', 'wide'],
    signal: 'progress',
  },
};

const OVERRIDES: Record<string, ProfilePatch> = {
  idle: { energy: 0.16, breath: 0.014, sway: 0.55, eyeHold: 9000, blinkMin: 5200, blinkMax: 10500, eyes: ['pill', 'dot'] },
  sleeping: { energy: 0.04, breath: 0.034, sway: 0.2, lift: 3.2, blinkMin: 0, blinkMax: 0, gaze: 'down', eyes: ['closed'], signal: 'none' },
  waking: { energy: 0.65, breath: 0.03, lift: -1.5, eyeHold: 1100, eyes: ['wide', 'half', 'pill'] },
  drowsy: { energy: 0.08, breath: 0.026, lift: 2.4, blinkMin: 0, blinkMax: 0, eyes: ['arc', 'half'] },
  'powering-off': { energy: 0.04, breath: 0.012, lift: 2.1, blinkMin: 0, blinkMax: 0, eyes: ['closed', 'line'] },
  booting: { energy: 0.32, breath: 0.02, eyeHold: 1700, gaze: 'scan', eyes: ['dot', 'wide', 'pill'] },
  'shake-awake': { energy: 0.8, breath: 0.04, sway: 3.1, eyeHold: 1300, eyes: ['wide', 'dot'] },
  spawning: { energy: 0.6, breath: 0.035, lift: -1.8, eyeHold: 1600, eyes: ['star', 'wide', 'dot'], signal: 'spark' },
  happy: { energy: 0.58, breath: 0.03, sway: 2.1, lift: -1.1, eyes: ['pill', 'arc', 'dot'] },
  excited: { energy: 0.95, breath: 0.045, sway: 3.2, lift: -2.1, eyeHold: 1600, gaze: 'wander', eyes: ['star', 'wide', 'heart'], signal: 'spark' },
  laughing: { energy: 0.9, breath: 0.05, sway: 2.8, lift: -1.8, eyes: ['squint', 'arc'], signal: 'spark' },
  curious: { energy: 0.5, breath: 0.024, sway: 2.2, tilt: 3.8, gaze: 'scan', eyes: ['wide', 'dot', 'half'] },
  thinking: { energy: 0.4, breath: 0.02, sway: 1.3, gaze: 'up', eyes: ['dot', 'half', 'line'], signal: 'orbit' },
  searching: { energy: 0.72, breath: 0.028, sway: 2.5, gaze: 'scan', eyeHold: 1100, eyes: ['wide', 'dot'], signal: 'scan' },
  reading: { energy: 0.3, breath: 0.018, sway: 0.9, gaze: 'down', eyeHold: 1700, eyes: ['line', 'half'], signal: 'none' },
  writing: { energy: 0.52, breath: 0.022, sway: 1.1, gaze: 'down', eyeHold: 1500, eyes: ['arc', 'line'], signal: 'progress' },
  working: { energy: 0.45, breath: 0.02, sway: 1.2, gaze: 'scan', eyes: ['line', 'dot', 'half'], signal: 'progress' },
  busy: { energy: 0.4, breath: 0.02, sway: 0.9, gaze: 'down', eyes: ['line', 'half'], signal: 'progress' },
  loading: { energy: 0.62, breath: 0.025, sway: 1.5, gaze: 'scan', eyeHold: 1600, eyes: ['arc', 'dot'], signal: 'orbit' },
  progress: { energy: 0.55, breath: 0.02, sway: 1.4, gaze: 'scan', eyes: ['dot', 'wide'], signal: 'progress' },
  radar: { energy: 0.6, breath: 0.022, sway: 1.8, gaze: 'scan', eyes: ['wide', 'dot'], signal: 'scan' },
  orbit: { energy: 0.55, breath: 0.022, sway: 1.7, gaze: 'scan', eyes: ['dot', 'wide'], signal: 'orbit' },
  receiving: { energy: 0.72, breath: 0.03, lift: -1.2, eyeHold: 1300, eyes: ['wide', 'dot', 'arc'], signal: 'spark' },
  sending: { energy: 0.63, breath: 0.026, lift: -0.8, gaze: 'up', eyes: ['arc', 'dot'] },
  notifying: { energy: 0.82, breath: 0.04, lift: -2, eyeHold: 1500, eyes: ['wide', 'dot', 'arc'], signal: 'spark' },
  alerting: { energy: 0.8, breath: 0.04, sway: 3, gaze: 'center', eyes: ['wide', 'line'], signal: 'spark' },
  afraid: { energy: 0.82, breath: 0.045, sway: 3.2, gaze: 'scan', eyes: ['wide', 'dot'], signal: 'spark' },
  scared: { energy: 0.82, breath: 0.045, sway: 3.2, gaze: 'scan', eyes: ['wide', 'dot'], signal: 'spark' },
  panicked: { energy: 0.92, breath: 0.05, sway: 3.6, gaze: 'scan', eyes: ['wide', 'dot'], signal: 'spark' },
  angry: { energy: 0.78, breath: 0.038, sway: 2.8, gaze: 'center', eyes: ['line', 'wide'], signal: 'spark' },
  error: { energy: 0.8, breath: 0.04, sway: 3, gaze: 'center', eyes: ['wide', 'line'], signal: 'spark' },
  shy: { energy: 0.26, breath: 0.02, sway: 1.1, tilt: 3.3, gaze: 'down', eyes: ['arc', 'dot'] },
  sad: { energy: 0.16, breath: 0.018, sway: 0.7, lift: 1.8, gaze: 'down', eyes: ['arc', 'closed'] },
  down: { energy: 0.14, breath: 0.018, sway: 0.6, lift: 2.1, gaze: 'down', eyes: ['arc', 'closed'] },
  surprised: { energy: 0.88, breath: 0.045, lift: -2.2, eyeHold: 1800, gaze: 'center', eyes: ['wide', 'dot'] },
  confused: { energy: 0.36, breath: 0.022, sway: 1.7, tilt: 3, gaze: 'scan', eyes: ['dot', 'half'] },
  puzzled: { energy: 0.34, breath: 0.02, sway: 1.6, tilt: 3.2, gaze: 'up', eyes: ['dot', 'wide'] },
  satisfied: { energy: 0.42, breath: 0.024, sway: 1.4, lift: -1, eyes: ['arc', 'pill'] },
  done: { energy: 0.84, breath: 0.04, sway: 2.5, lift: -2, eyeHold: 1800, eyes: ['star', 'arc', 'pill'], signal: 'spark' },
  celebrate: { energy: 1, breath: 0.05, sway: 3.2, lift: -2.8, eyeHold: 1500, eyes: ['star', 'wide'], signal: 'spark' },
  bouncing: { energy: 0.9, breath: 0.045, sway: 2.4, lift: -2.2, eyes: ['arc', 'wide'], signal: 'spark' },
  playful: { energy: 0.78, breath: 0.035, sway: 3, tilt: 3.6, eyes: ['arc', 'star'], signal: 'spark' },
};

const profiles = new Map<string, MotionProfile>();

function familyOf(state: string): Family {
  return faceMeta(state).group;
}

export function motionProfile(state: string): MotionProfile {
  if (!(state in FACES)) return motionProfile('idle');
  const cached = profiles.get(state);
  if (cached) return cached;

  const base = FAMILY_BASE[familyOf(state)];
  const face = faceFor(state);
  const profile: MotionProfile = {
    ...base,
    eyes: base.eyes.includes(face.eye) ? base.eyes : [face.eye, ...base.eyes],
    ...OVERRIDES[state],
  };
  profiles.set(state, profile);
  return profile;
}
