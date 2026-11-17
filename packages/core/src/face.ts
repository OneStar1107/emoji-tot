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
  /**
   * Where the face leans, in shape units.
   *
   * A face pinned to the centre of the body reads as a decal. Leaning it —
   * back when surprised, down when sad, sideways when confused — is most of
   * what makes an expression look felt rather than displayed.
   */
  dx?: number;
  dy?: number;
  /** Extra eye size on top of the shape's own. */
  eyeScale?: number;
  /** Extra mouth size. */
  mouthScale?: number;
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

  happy: { eye: 'arc', mouth: 'smile', blush: true, dy: -1, mouthScale: 1.1 },
  excited: { eye: 'star', mouth: 'grin', blush: true, dy: -3, eyeScale: 1.15, mouthScale: 1.15 },
  laughing: { eye: 'arc', mouth: 'open', blush: true, dy: 1, mouthScale: 1.35 },
  playful: { eye: 'arc', mouth: 'grin', blush: true, dx: -2, dy: -1 },
  proud: { eye: 'dot', mouth: 'smile', dy: -2, eyeScale: 1.05 },
  celebrate: { eye: 'star', mouth: 'open', blush: true, dy: -3, eyeScale: 1.2, mouthScale: 1.25 },
  bouncing: { eye: 'arc', mouth: 'smile', dy: -2 },
  shy: { eye: 'arc', mouth: 'tiny', blush: true, dy: 2, dx: -2 },
  sad: { eye: 'arc', mouth: 'wave', dy: 2, eyeScale: 0.95 },
  angry: { eye: 'line', mouth: 'flat', dy: 2, dx: 1, mouthScale: 0.9 },
  confused: { eye: 'dot', mouth: 'wave', dx: 3, dy: 1 },
  suspicious: { eye: 'line', mouth: 'flat', dx: -2 },
  surprised: { eye: 'wide', mouth: 'o', dy: -2, eyeScale: 1.3, mouthScale: 1.2 },
  scared: { eye: 'wide', mouth: 'wave', dy: -1, eyeScale: 1.25 },
  curious: { eye: 'wide', mouth: 'smile', dx: -2, dy: -1, eyeScale: 1.1 },
  humming: { eye: 'arc', mouth: 'smile', dx: -1, dy: -1 },

  alerting: { eye: 'line', mouth: 'open' },
  notifying: { eye: 'wide', mouth: 'smile' },
  refusing: { eye: 'line', mouth: 'flat' },
};

export const FACE_IDS: readonly string[] = Object.keys(FACES);

/** Anything unlisted still gets a face: a character must never render blank. */
export function faceFor(state: string): FaceSpec {
  return FACES[state] ?? FACES.idle;
}
