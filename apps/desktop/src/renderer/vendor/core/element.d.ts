export declare class EmojiTotBall extends HTMLElement {
    #private;
    static get observedAttributes(): string[];
    constructor();
    connectedCallback(): void;
    attributeChangedCallback(): void;
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
    /** One-shot motions. They do not change the state. */
    bounce(amount?: number): void;
    spin(turns?: number): void;
    burst(count?: number): void;
    /** Play one of the seven signature motions by name. */
    play(motion: string): void;
}
/** Register the element once. Safe to call in a browser only. */
export declare function defineBall(tag?: string): void;
