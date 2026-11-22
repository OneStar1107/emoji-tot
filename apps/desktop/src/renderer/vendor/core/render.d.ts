/**
 * Three ways to draw the same genome.
 *
 * They are styles, not characters: the silhouette, the colour and the face
 * are unchanged, only the finish differs. That is what lets a user pick a
 * look without re-picking fifteen characters.
 *
 * - `flat`    — solid fill, no outline, quiet face. The default.
 * - `sticker` — thick darker outline, a corner highlight, a couple of sparks.
 * - `glow`    — radial gradient, a pale outer ring, a soft halo.
 * - `dots`    — the silhouette printed as a grid of dots (halftone).
 * - `line`    — outline only, no fill: pen on paper.
 * - `candy`   — soft vertical gradient plus a curved highlight, like candy.
 * - `emoji`   — the system-emoji finish: volume gradient, top shine, ambient
 *               occlusion at the base, and a hairline edge 22% darker.
 */
export type RenderStyle = 'flat' | 'sticker' | 'glow' | 'dots' | 'line' | 'candy' | 'emoji';
/**
 * How the drawing moves.
 *
 * - `demo` — the idle loop plays on its own: a breath, a small sway, a blink.
 *
 * One value, because there is one loop worth drawing. Anything else (a hop, a
 * spin) is a one-shot a host drives, not a resting state.
 */
export type MotionMode = 'demo';
export interface RenderOptions {
    /** A body id from BODIES. */
    body?: string;
    /** Older name for `body`, kept so stored preferences keep rendering. */
    shape?: string;
    color: string;
    /** Trait ids, in any order; surfaces are sorted under the face automatically. */
    traits?: string[];
    state: string;
    size: number;
    /** Outline the body instead of filling it. */
    outline?: boolean;
    /** Finish. Defaults to flat. */
    style?: RenderStyle;
    /**
     * Play the idle loop: a breath, a sway and an occasional blink, drawn by CSS
     * that ships inside the SVG. Absent means a still drawing.
     */
    motion?: MotionMode;
}
/** Render a cast member by id, with an optional expression override. */
export interface CastRenderOptions {
    id: string;
    state?: string;
    size?: number;
    style?: RenderStyle;
    /** Same idle loop as RenderOptions.motion. */
    motion?: MotionMode;
}
/**
 * The face is never the same colour as the body.
 *
 * A black ball with a black face is a black ball. Rather than expose another
 * option, the ink is derived from the body's brightness: dark bodies get a
 * white face, light bodies get a dark one. That keeps the palette to one
 * choice per character, which is what a picker wants.
 */
export declare function inkFor(bodyHex: string): string;
/**
 * The face of one expression, positioned inside the body.
 *
 * `motion: 'demo'` groups the two eyes so the idle loop can blink them. The
 * group carries its own transform origin (the eye line) as an inline style,
 * because that origin depends on the body the face sits on.
 */
export declare function renderFace(state: string, face: {
    x: number;
    y: number;
}, ink: string, baseEyeScale?: number, weight?: number, motion?: MotionMode): string;
/** One character, as a standalone SVG string. */
export declare function renderCharacter(options: RenderOptions): string;
/** Render a member of the cast by id. Unknown ids fall back to the first one. */
export declare function renderCast(options: CastRenderOptions): string;
export declare function renderDataUrl(options: RenderOptions): string;
