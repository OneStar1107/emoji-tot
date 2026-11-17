/**
 * The cast: 135 named characters, each one a genome rather than a drawing.
 *
 * A member is `{ body, color, trait, face, motion }`: one silhouette, one
 * colour, at most ONE trait, a signature expression and a signature motion.
 *
 * One trait per member is deliberate. Traits are anchors that compete for the
 * same space — two ears and a halo is a pile of parts, not a character. A
 * member with a single strong idea reads better at 72px than one wearing four,
 * and it forces the 135 to differentiate by *which* idea they carry rather than
 * by how many.
 *
 * Order is catalogue order, grouped by family. Family ids and body ids are
 * stable; a member's id is stable forever, because a stored preference may
 * name it years later.
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
