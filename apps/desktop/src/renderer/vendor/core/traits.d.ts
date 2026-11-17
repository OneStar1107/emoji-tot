/**
 * Traits: the parts that make two bodies with the same silhouette different
 * characters.
 *
 * Every trait is a function of the *body it sits on* — it reads the body's
 * height and how pointy its top is, and anchors itself accordingly. A pair of
 * cat ears on a tall pear and on a wide squircle land in different places,
 * which is the whole point: a trait is not a sticker, it is a relationship
 * between an accessory and a shape.
 *
 * The vocabulary is deliberately small and compositional. Six kinds of ears,
 * eight things on top, five on the sides and bottom, six surface markings.
 * Named characters combine them; a new character costs one line.
 */
import type { BodySpec } from './body.js';
export interface TraitContext {
    /** Colour of the face ink, reused so accessories belong to the character. */
    ink: string;
    /** The body colour, for traits that erase rather than draw. */
    fill: string;
    body: BodySpec;
    /** Flipped horizontally, for traits that only exist on one side. */
    flip?: boolean;
}
export type TraitFn = (ctx: TraitContext) => string;
/** Display names, so a Chinese picker never shows an English id. */
export declare const TRAIT_ZH: Record<string, string>;
export declare const TRAITS: Record<string, TraitFn>;
export declare const EAR_IDS: string[];
export declare const TOP_IDS: string[];
export declare const SIDE_IDS: string[];
export declare const SURFACE_IDS: string[];
export declare const TRAIT_IDS: readonly string[];
/** Traits that only make sense mirrored to both sides. */
export declare const PAIRED: Set<string>;
export declare function renderTraits(ids: readonly string[], ctx: TraitContext): string;
