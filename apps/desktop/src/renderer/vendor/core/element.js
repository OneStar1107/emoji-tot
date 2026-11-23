/**
 * <emojitot-ball> — the character as a custom element.
 *
 * The desktop renderer has no build step, so this ships as a plain ES module
 * and registers itself. Static thumbnails keep the deterministic SVG drawing;
 * a sustained face can opt into the live spring/polygon-eye runtime with the
 * boolean `live` attribute.
 */
import { renderCast, renderCharacter } from './render.js';
import { colorHex } from './palette.js';
import { createCharacterRuntime, } from './runtime.js';
const RUNTIME_ACTIONS = new Set([
    'spin',
    'bounce',
    'burst',
    'tilt',
    'wobble',
    'pulse',
    'float',
]);
const STYLE = `
  :host { display: inline-block; width: var(--ball-size, 120px); height: var(--ball-size, 120px); }
  :host([hidden]) { display: none; }
  .ball { width: 100%; height: 100%; display: block; transform-origin: 50% 88%; animation: breathe 4.2s ease-in-out infinite; }
  .ball svg { width: 100%; height: 100%; display: block; }
  @keyframes breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.035); } }
  @media (prefers-reduced-motion: reduce) { .ball { animation: none; } }
  :host([paused]) .ball { animation-play-state: paused; }
  :host([live]) .ball { animation: none; }
  /* motion="demo" puts the loop inside the drawing; a second one here would double it. */
  :host([motion="demo"]) .ball { animation: none; }
`;
export class EmojiTotBall extends HTMLElement {
    static get observedAttributes() {
        return ['cast', 'body', 'shape', 'color', 'state', 'size', 'traits', 'finish', 'motion', 'live', 'paused'];
    }
    #root;
    #style;
    #runtime = null;
    #runtimeKey = '';
    #runtimeState = '';
    constructor() {
        super();
        this.#root = this.attachShadow({ mode: 'open' });
        this.#style = document.createElement('style');
        this.#style.textContent = STYLE;
        this.#root.append(this.#style);
    }
    connectedCallback() {
        this.#draw();
    }
    disconnectedCallback() {
        this.#destroyRuntime();
    }
    attributeChangedCallback(_name, oldValue, newValue) {
        if (oldValue !== newValue)
            this.#draw();
    }
    /** The engine state, as a property for hosts that prefer it to attributes. */
    set state(value) {
        this.setAttribute('state', String(value));
    }
    get state() {
        return this.getAttribute('state') ?? 'idle';
    }
    set shape(value) {
        this.setAttribute('body', String(value));
    }
    set body(value) {
        this.setAttribute('body', String(value));
    }
    set cast(value) {
        this.setAttribute('cast', String(value));
    }
    set traits(value) {
        this.setAttribute('traits', Array.isArray(value) ? value.join(' ') : value);
    }
    set color(value) {
        this.setAttribute('color', String(value));
    }
    /**
     * The finish, as a property.
     *
     * #draw() has always read the finish attribute, but it was missing from
     * observedAttributes, so setting it at runtime never redrew anything — the
     * console's flat/sticker switch only worked because it replaced the whole
     * element from outside.
     */
    set finish(value) {
        this.setAttribute('finish', String(value));
    }
    get finish() {
        return this.getAttribute('finish') ?? 'sticker';
    }
    /** Opt into the live spring/polygon-eye runtime. Static is the default. */
    set live(value) {
        this.toggleAttribute('live', value);
    }
    get live() {
        return this.hasAttribute('live');
    }
    /** Pause the live loop without losing the current pose or expression. */
    set paused(value) {
        this.toggleAttribute('paused', value);
    }
    get paused() {
        return this.hasAttribute('paused');
    }
    /**
     * The idle loop, as an attribute (`motion="demo"`).
     *
     * Opt-in rather than default, so an existing embed keeps the drawing it has
     * today; once set, the breath and the blink come from the SVG itself and the
     * element's own breath steps aside.
     */
    set motion(value) {
        if (value)
            this.setAttribute('motion', String(value));
        else
            this.removeAttribute('motion');
    }
    get motion() {
        return this.getAttribute('motion');
    }
    /** One-shot motions. They do not change the state. */
    bounce(amount = 0.4) {
        if (this.#pulse('bounce'))
            return;
        this.#play(`hop ${Math.round(360 + amount * 340)}ms ease-out`);
    }
    spin(turns = 1) {
        if (this.#pulse('spin'))
            return;
        this.#play(`turn ${Math.round(420 + turns * 260)}ms cubic-bezier(.3,.7,.4,1)`, 'rotate');
    }
    burst(count = 16) {
        void count;
        if (this.#pulse('burst'))
            return;
        this.#play('pop 420ms ease-out', 'scale');
    }
    /** Play one of the seven signature motions by name. */
    play(motion) {
        const liveAction = motion === 'pop' ? 'burst' : motion;
        if (RUNTIME_ACTIONS.has(liveAction) && this.#pulse(liveAction)) {
            return;
        }
        const map = {
            bounce: ['hop 620ms ease-out', 'translateY'],
            spin: ['turn 760ms cubic-bezier(.3,.7,.4,1)', 'rotate'],
            pop: ['pop 420ms ease-out', 'scale'],
            tilt: ['tilt 520ms ease-in-out', 'rotate'],
            wobble: ['wobble 640ms ease-in-out', 'rotate'],
            pulse: ['pulse 900ms ease-in-out', 'scale'],
            float: ['float 1400ms ease-in-out', 'translateY'],
        };
        const [name, kind] = map[motion] ?? ['hop 620ms ease-out', 'translateY'];
        this.#play(name, kind);
    }
    #pulse(action) {
        if (!this.#runtime)
            return false;
        this.#runtime.pulse(action);
        return true;
    }
    #play(name, kind = 'translateY') {
        const el = this.#root.querySelector('.ball');
        if (!el)
            return;
        const frames = {
            translateY: '@keyframes eb-hop { 0%,100% { transform: translateY(0); } 40% { transform: translateY(-14%); } }',
            rotate: '@keyframes eb-turn { from { transform: rotate(0); } to { transform: rotate(360deg); } }',
            scale: '@keyframes eb-pop { 0% { transform: scale(1); } 45% { transform: scale(1.16); } 100% { transform: scale(1); } }',
            tilt: '@keyframes eb-tilt { 0%,100% { transform: rotate(0); } 35% { transform: rotate(-9deg); } 70% { transform: rotate(6deg); } }',
            wobble: '@keyframes eb-wobble { 0%,100% { transform: rotate(0); } 20% { transform: rotate(-5deg); } 45% { transform: rotate(5deg); } 70% { transform: rotate(-3deg); } }',
            pulse: '@keyframes eb-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }',
            float: '@keyframes eb-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8%); } }',
        };
        const keyframes = frames[kind] ?? frames.translateY;
        // Motion names differ per kind, so pick the matching one from the chosen frames.
        const frameName = kind === 'rotate' ? 'eb-turn' : kind === 'scale' ? 'eb-pop' : kind === 'tilt' ? 'eb-tilt' : kind === 'wobble' ? 'eb-wobble' : kind === 'pulse' ? 'eb-pulse' : kind === 'float' ? 'eb-float' : 'eb-hop';
        this.#style.textContent = STYLE + keyframes;
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = `${frameName} ${name.split(' ')[1]} ease-out`;
        el.addEventListener('animationend', () => {
            el.style.animation = '';
        }, { once: true });
    }
    #destroyRuntime() {
        this.#runtime?.destroy();
        this.#runtime = null;
        this.#runtimeKey = '';
        this.#runtimeState = '';
    }
    #draw() {
        if (!this.isConnected)
            return;
        const cast = this.getAttribute('cast');
        const body = this.getAttribute('body') ?? this.getAttribute('shape') ?? 'circle';
        const color = this.getAttribute('color') ?? 'white';
        const state = this.getAttribute('state') ?? 'idle';
        const size = Number(this.getAttribute('size') ?? 0) || 120;
        /*
         * The app's look, not a per-call experiment: die-cut white edge is what
         * ships. `finish="flat"` still gets the un-edged version for anyone who
         * wants the quieter one, and `style` is unusable here because it is the
         * global CSS attribute once this becomes a real element.
         */
        const finish = (this.getAttribute('finish') ?? 'sticker');
        const traits = (this.getAttribute('traits') ?? '').split(/\s+/).filter(Boolean);
        const motion = this.getAttribute('motion') === 'demo' ? 'demo' : undefined;
        const live = this.hasAttribute('live');
        let host = this.#root.querySelector('.ball');
        if (!host) {
            host = document.createElement('div');
            host.className = 'ball';
            this.#root.append(host);
        }
        this.style.setProperty('--ball-size', `${size}px`);
        void colorHex(color);
        if (live) {
            const runtimeKey = [cast ?? '', body, color, traits.join(' '), finish, size].join('|');
            if (this.#runtime && runtimeKey === this.#runtimeKey) {
                if (state !== this.#runtimeState) {
                    this.#runtime.setState(state, 'element');
                    this.#runtimeState = state;
                }
                this.#runtime.setPaused(this.hasAttribute('paused'));
                return;
            }
            this.#destroyRuntime();
            host.replaceChildren();
            try {
                this.#runtime = createCharacterRuntime(host, {
                    cast: cast || undefined,
                    body,
                    color,
                    traits,
                    state,
                    size,
                    style: finish,
                    followPointer: true,
                    paused: this.hasAttribute('paused'),
                });
                this.#runtimeKey = runtimeKey;
                this.#runtimeState = state;
                host.setAttribute('aria-hidden', 'true');
                return;
            }
            catch {
                this.#destroyRuntime();
            }
        }
        else {
            this.#destroyRuntime();
        }
        let svg;
        try {
            svg = cast
                ? renderCast({ id: cast, state, size, style: finish, motion })
                : renderCharacter({ body, color, state, size, traits, style: finish, motion });
        }
        catch {
            svg = renderCharacter({ body: 'circle', color, state: 'idle', size, style: finish, motion });
        }
        host.innerHTML = svg;
        host.setAttribute('aria-hidden', 'true');
    }
}
/** Register the element once. Safe to call in a browser only. */
export function defineBall(tag = 'emojitot-ball') {
    if (typeof customElements === 'undefined' || customElements.get(tag))
        return;
    customElements.define(tag, EmojiTotBall);
}
/*
 * Registering on import is the whole point of this entry: a page can add one
 * <script type="module"> and use the tag, with no init call to remember.
 */
if (typeof customElements !== 'undefined')
    defineBall();
