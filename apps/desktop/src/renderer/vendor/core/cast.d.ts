/**
 * The cast: one member per body, fifteen in all.
 *
 * A body is the strongest identity a character has — a star reads as a star at
 * 32px, while two circles with different spots read as the same character. So
 * the roster is one-to-one with `BODIES`: fifteen silhouettes, each with the
 * colour, the single trait, the expression and the motion that show it off
 * best. Nothing here is a drawing; add a body and there is a new character.
 *
 * One trait per member is deliberate. Traits compete for the same space along
 * the silhouette — two ears and a halo is a pile of parts, not a character.
 */
export interface CastMember {
    id: string;
    name: {
        zh: string;
        en: string;
    };
    desc: string;
    family: string;
    body: string;
    color: string;
    /** Zero or one trait id. Never more. */
    traits: string[];
    /** The face this member wears by default: its signature expression. */
    face: string;
    /** The one-shot motion this member is known for. */
    motion: string;
}
export declare const MOTIONS: readonly ["bounce", "spin", "tilt", "pulse", "wobble", "pop", "float"];
export type Motion = (typeof MOTIONS)[number];
/** Display names, so a Chinese wall never shows an English id. */
export declare const MOTION_ZH: Record<string, string>;
export declare const FAMILIES: readonly {
    id: string;
    zh: string;
    en: string;
}[];
export declare const CAST: readonly CastMember[];
export declare const CAST_IDS: readonly string[];
export declare function castMember(id: string): CastMember | undefined;
export declare function castByFamily(family: string): readonly CastMember[];
/** The member a fresh open starts on. */
export declare const DEFAULT_CAST = "bot";
/** Cross two members into a new genome. Deterministic for a given seed. */
export declare function breed(a: CastMember, b: CastMember, seed: number): CastMember;
