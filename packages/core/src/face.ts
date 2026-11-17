/**
 * Faces, as a small vocabulary rather than a picture per state.
 *
 * Two eyes and a mouth, each with a handful of styles, is enough for sixty
 * expressions: the difference between "thinking" and "confused" is a mouth
 * curve, not a new drawing. Keeping it a vocabulary also means a new state
 * costs three words.
 */
export type EyeStyle = 'dot' | 'arc' | 'closed' | 'wide' | 'star' | 'line';
export type MouthStyle = 'smile' | 'open' | 'flat' | 'wave' | 'o' | 'grin' | 'tiny';

export interface FaceSpec {
  eye: EyeStyle;
  mouth: MouthStyle;
  blush?: boolean;
}

export const FACES: Record<string, FaceSpec> = {
  idle: { eye: 'dot', mouth: 'smile' },
  sleeping: { eye: 'closed', mouth: 'tiny' },
  waking: { eye: 'wide', mouth: 'o' },
  drowsy: { eye: 'arc', mouth: 'tiny' },
  bored: { eye: 'line', mouth: 'flat' },
  'powering-down': { eye: 'closed', mouth: 'flat' },

  listening: { eye: 'wide', mouth: 'tiny' },
  thinking: { eye: 'arc', mouth: 'wave' },
  searching: { eye: 'wide', mouth: 'o' },
  reading: { eye: 'line', mouth: 'flat' },
  writing: { eye: 'arc', mouth: 'tiny' },
  working: { eye: 'line', mouth: 'wave' },
  loading: { eye: 'arc', mouth: 'o' },
  progress: { eye: 'dot', mouth: 'flat' },
  radar: { eye: 'wide', mouth: 'flat' },
  orbit: { eye: 'dot', mouth: 'o' },
  dictating: { eye: 'arc', mouth: 'o' },
  uploading: { eye: 'dot', mouth: 'grin' },
  sending: { eye: 'arc', mouth: 'smile' },
  receiving: { eye: 'wide', mouth: 'grin' },
  messaging: { eye: 'dot', mouth: 'o' },
  waiting: { eye: 'dot', mouth: 'wave' },
  spawning: { eye: 'star', mouth: 'grin' },
  composing: { eye: 'arc', mouth: 'flat' },
  dragging: { eye: 'wide', mouth: 'wave' },

  happy: { eye: 'arc', mouth: 'smile', blush: true },
  excited: { eye: 'star', mouth: 'grin', blush: true },
  laughing: { eye: 'arc', mouth: 'open', blush: true },
  playful: { eye: 'arc', mouth: 'grin', blush: true },
  proud: { eye: 'dot', mouth: 'smile' },
  celebrate: { eye: 'star', mouth: 'open', blush: true },
  bouncing: { eye: 'arc', mouth: 'smile' },
  shy: { eye: 'arc', mouth: 'tiny', blush: true },
  sad: { eye: 'arc', mouth: 'wave' },
  angry: { eye: 'line', mouth: 'flat' },
  confused: { eye: 'dot', mouth: 'wave' },
  suspicious: { eye: 'line', mouth: 'flat' },
  surprised: { eye: 'wide', mouth: 'o' },
  scared: { eye: 'wide', mouth: 'wave' },
  curious: { eye: 'wide', mouth: 'smile' },
  humming: { eye: 'arc', mouth: 'smile' },

  alerting: { eye: 'line', mouth: 'open' },
  notifying: { eye: 'wide', mouth: 'smile' },
  refusing: { eye: 'line', mouth: 'flat' },
};

export const FACE_IDS: readonly string[] = Object.keys(FACES);

/** Anything unlisted still gets a face: a character must never render blank. */
export function faceFor(state: string): FaceSpec {
  return FACES[state] ?? FACES.idle;
}
