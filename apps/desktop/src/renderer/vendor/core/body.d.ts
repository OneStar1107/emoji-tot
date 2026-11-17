/**
 * Bodies, drawn by hand this time.
 *
 * The first version sampled every silhouette from a radial formula: cheap to
 * extend, but a formula cannot describe a pear's waist, a bread's flat base,
 * or a star's five real corners. Each path here is written out, closed with
 * `Z`, and reviewed for the two things a formula got wrong: a missing sliver
 * where the pen stopped, and a corner rounded off until the character lost the
 * one feature that identifies it.
 *
 * All bodies share the 100×100 box and sit on (50, 50).
 */
export interface BodyPart {
    /** One extra shape, in box coordinates. */
    d: string;
    /** Same colour as the body, or a darker/lighter tone of it. */
    tone?: 'body' | 'shade' | 'light';
    /** Drawn under the body instead of over it (stems, antennae). */
    behind?: boolean;
    /** Rotation in degrees about the box centre, for petals and leaves. */
    rotate?: number;
}
export interface BodySpec {
    id: string;
    family: string;
    /** The closed outline in the 100×100 box. */
    path: string;
    /** Where the face sits. */
    face: {
        x: number;
        y: number;
    };
    eyeScale?: number;
    /** Rough silhouette height as a fraction of the box, used to place traits. */
    height: number;
    /** How pointy the top is (0 round, 1 spiked), used by ear anchoring. */
    pointed?: number;
    /** Signature add-ons that belong to the species, not to a character. */
    parts?: BodyPart[];
    /**
     * Fatten the fill by this many units with a round-joined stroke of its own
     * colour, which turns sharp corners blunt — how a cookie-cutter star gets
     * its soft points without redrawing the outline.
     */
    round?: number;
}
export declare const BODIES: readonly BodySpec[];
/** Display names. The engine never needs them; every picker does. */
export declare const BODY_ZH: Record<string, string>;
export declare const BODY_IDS: readonly string[];
export declare function getBody(id: string): BodySpec;
export declare function bodyPreview(id: string, fill?: string): string;
