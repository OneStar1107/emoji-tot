/**
 * <emojibot-ball> — the character as a custom element.
 *
 * The desktop renderer has no build step, so this ships as a plain ES module
 * and registers itself. Animation is CSS: a breath on the body and a blink on
 * the lids, both paused when the window is hidden.
 */
import { renderCharacter } from './render.js';
import { colorHex } from './palette.js';

const STYLE = `
  :host { display: inline-block; width: var(--ball-size, 120px); height: var(--ball-size, 120px); }
  .ball { width: 100%; height: 100%; display: block; transform-origin: 50% 88%; animation: breathe 4.2s ease-in-out infinite; }
  .ball svg { width: 100%; height: 100%; display: block; }
  @keyframes breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.035); } }
  @media (prefers-reduced-motion: reduce) { .ball { animation: none; } }
  :host([data-paused]) .ball { animation-play-state: paused; }
`;

export class EmojiBotBall extends HTMLElement {
  static get observedAttributes() {
    return ['shape', 'color', 'state', 'size'];
  }

  #root;
  #style;

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

  attributeChangedCallback() {
    this.#draw();
  }

  /** The engine state, as a property for hosts that prefer it to attributes. */
  set state(value) {
    this.setAttribute('state', String(value));
  }

  get state() {
    return this.getAttribute('state') ?? 'idle';
  }

  set shape(value: string) {
    this.setAttribute('shape', String(value));
  }

  set color(value: string) {
    this.setAttribute('color', String(value));
  }

  /** One-shot motions. They do not change the state. */
  bounce(amount = 0.4) {
    this.#play(`hop ${Math.round(360 + amount * 340)}ms ease-out`);
  }

  spin(turns = 1) {
    this.#play(`turn ${Math.round(420 + turns * 260)}ms cubic-bezier(.3,.7,.4,1)`, 'rotate');
  }

  burst(count = 16) {
    void count;
    this.#play('pop 420ms ease-out', 'scale');
  }

  #play(name: string, kind: string = 'translateY') {
    const el = this.#root.querySelector<HTMLDivElement>('.ball');
    if (!el) return;
    const keyframes = kind === 'rotate'
      ? `@keyframes aora-spin { from { transform: rotate(0); } to { transform: rotate(${360}deg); } }`
      : kind === 'scale'
        ? '@keyframes aora-pop { 0% { transform: scale(1); } 45% { transform: scale(1.16); } 100% { transform: scale(1); } }'
        : '@keyframes aora-hop { 0%,100% { transform: translateY(0); } 40% { transform: translateY(-14%); } }';
    const id = `emoji-${kind}`;
    this.#style.textContent = STYLE + keyframes;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = `${id} ${name.split(' ')[1]} ease-out`;
    el.addEventListener('animationend', () => {
      el.style.animation = '';
    }, { once: true });
  }

  #draw() {
    const shape = this.getAttribute('shape') ?? 'circle';
    const color = this.getAttribute('color') ?? 'white';
    const state = this.getAttribute('state') ?? 'idle';
    const size = Number(this.getAttribute('size') ?? 0) || 120;
    let svg;
    try {
      svg = renderCharacter({ shape, color, state, size });
    } catch {
      svg = renderCharacter({ shape: 'circle', color, state: 'idle', size });
    }
    let host = this.#root.querySelector<HTMLDivElement>('.ball');
    if (!host) {
      host = document.createElement('div');
      host.className = 'ball';
      this.#root.append(host);
    }
    host.innerHTML = svg;
    this.style.setProperty('--ball-size', `${size}px`);
    void colorHex(color);
  }
}

/** Register the element once. Safe to call in a browser only. */
export function defineBall(tag = 'emojibot-ball'): void {
  if (typeof customElements === 'undefined' || customElements.get(tag)) return;
  customElements.define(tag, EmojiBotBall);
}

/*
 * Registering on import is the whole point of this entry: a page can add one
 * <script type="module"> and use the tag, with no init call to remember.
 */
if (typeof customElements !== 'undefined') defineBall();