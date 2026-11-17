export interface RenderOptions {
    shape: string;
    color: string;
    state: string;
    size: number;
    /** Outline the body instead of filling it. */
    outline?: boolean;
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
/** Render a character to an SVG string. */
export declare function renderCharacter(options: RenderOptions): string;
/** A data URL, for an <img> or a CSS background. */
export declare function renderDataUrl(options: RenderOptions): string;
