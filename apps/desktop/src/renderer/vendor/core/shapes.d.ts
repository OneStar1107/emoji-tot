/**
 * The silhouettes.
 *
 * Every shape is a closed path drawn inside a 100×100 box and centred on
 * (50, 50), so one set of face coordinates works on all of them. These are
 * hand-drawn arcs, not generated blobs: a shape is a small piece of design, and
 * a generator would give every one of them the same personality.
 */
export interface ShapeSpec {
    id: string;
    /** Closed path in the 100×100 box. */
    body: string;
    /** Where the face sits, in the same box. */
    face: {
        x: number;
        y: number;
    };
    /** Some shapes need a touch more room for the eyes. */
    eyeScale?: number;
}
export declare const SHAPES: readonly ShapeSpec[];
export declare const SHAPE_IDS: readonly string[];
export declare function getShape(id: string): ShapeSpec;
/** A silhouette as a standalone SVG path, for a picker that shows shapes as pictures. */
export declare function shapePreview(id: string, fill?: string): string;
