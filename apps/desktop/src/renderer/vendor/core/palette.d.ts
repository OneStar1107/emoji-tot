/**
 * Body colours.
 *
 * Twelve is enough to express a team and few enough that the picker fits on
 * one row. Every colour is a flat hex: the engine draws solid silhouettes, and
 * shading is a renderer decision rather than a colour decision.
 */
export declare const COLORS: Record<string, string>;
export declare const COLOR_IDS: readonly string[];
export declare function colorHex(id: string): string;
