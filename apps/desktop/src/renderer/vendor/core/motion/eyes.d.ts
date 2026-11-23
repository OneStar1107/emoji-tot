/**
 * Polygon eyes for the live Tot runtime.
 *
 * Every topology has the same vertex count. That is the constraint that makes
 * a rapid expression change feel like one eye changing its mind, instead of a
 * glyph disappearing and another appearing.
 */
import { type EyeStyle } from '../face.js';
export type PolygonPoint = readonly [number, number];
export type EyePolygon = readonly PolygonPoint[];
export declare const EYE_VERTEX_COUNT = 16;
export declare const EYE_POLYGONS: Readonly<Record<EyeStyle, EyePolygon>>;
export declare function morphPolygon(from: EyePolygon, to: EyePolygon, t: number): EyePolygon;
/** Two polygons for one face. The right eye carries any intentional asymmetry. */
export declare function eyePolygonsFor(state: string): readonly [EyePolygon, EyePolygon];
export declare function polygonPath(polygon: EyePolygon): string;
