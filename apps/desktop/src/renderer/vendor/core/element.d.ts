export declare class EmojiTotBall extends HTMLElement {
    #private;
    static get observedAttributes(): string[];
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null): void;
    /** The engine state, as a property for hosts that prefer it to attributes. */
    set state(value: string);
    get state(): string;
    set shape(value: string);
    set body(value: string);
    set cast(value: string);
    set traits(value: string[] | string);
    set color(value: string);
    /**
     * The finish, as a property.
     *
     * #draw() has always read the finish attribute, but it was missing from
     * observedAttributes, so setting it at runtime never redrew anything — the
     * console's flat/sticker switch only worked because it replaced the whole
     * element from outside.
     */
    set finish(value: string);
    get finish(): string;
    /** Opt into the live spring/polygon-eye runtime. Static is the default. */
    set live(value: boolean);
    get live(): boolean;
    /** Pause the live loop without losing the current pose or expression. */
    set paused(value: boolean);
    get paused(): boolean;
    /**
     * The idle loop, as an attribute (`motion="demo"`).
     *
     * Opt-in rather than default, so an existing embed keeps the drawing it has
     * today; once set, the breath and the blink come from the SVG itself and the
     * element's own breath steps aside.
     */
    set motion(value: string | null);
    get motion(): string | null;
    /** One-shot motions. They do not change the state. */
    bounce(amount?: number): void;
    spin(turns?: number): void;
    burst(count?: number): void;
    /** Play one of the seven signature motions by name. */
    play(motion: string): void;
}
/** Register the element once. Safe to call in a browser only. */
export declare function defineBall(tag?: string): void;
