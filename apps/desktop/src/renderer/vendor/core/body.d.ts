/**
 * Bodies, as formulas rather than drawings.
 *
 * A hand-drawn path gives one silhouette and locks it. A radial formula gives
 * a family: the same function with a different amplitude is a rounder ball, a
 * pear, or a star. Every body here is described by `r(t)` — the distance from
 * the centre at angle t — or by a short parametric curve, then sampled into a
 * path. That is what lets one file carry fourteen silhouettes that still read
 * as different characters, and what lets a host deform any of them later.
 *
 * All bodies live in the same 100×100 box and are centred on (50, 50), so one
 * set of face coordinates works on all of them.
 */
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
}
export type RadialFn = (t: number) => number;
export declare const BODIES: readonly BodySpec[];
/** Display names. The engine never needs them; every picker does. */
export declare const BODY_ZH: Record<string, string>;
export declare const BODY_IDS: readonly string[];
export declare function getBody(id: string): BodySpec;
export declare function bodyPreview(id: string, fill?: string): string;
