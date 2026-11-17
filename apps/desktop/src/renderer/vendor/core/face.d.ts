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
export declare const FACES: Record<string, FaceSpec>;
export declare const FACE_IDS: readonly string[];
/** Anything unlisted still gets a face: a character must never render blank. */
export declare function faceFor(state: string): FaceSpec;
