import { ALL_COLOR_IDS, ALL_SHAPE_IDS, DEFAULT_FACE, DEFAULT_SHAPE, DEFAULT_STYLE_ID, IDLE_STATE, acceptsVariant, autoNoseForKey, castMember, createCharacter, getInkVars, getLeafColor, getStyle, hasStyle, isCharacterState, isFaceStyle, isNoseId, loadThemes, themesNeeded } from "@aora-bot/engine";
const ATTRIBUTES = [
    'character',
    'shape',
    'color',
    'face',
    'nose',
    'state',
    'style-id',
    'variant',
    'style-options',
    'seed',
    'size',
    'eye-color',
    'badge-color',
    'eye-scale',
    'line-weight',
    'reduced-motion',
    'paused',
    'emphasis',
    'antics',
    'auto-pause'
];
const FIXED = new Set([
    'seed',
    'reduced-motion',
    'auto-pause'
]);
const BASE_STYLES = `
:host { display: inline-block; width: 32px; height: 32px; }
:host([hidden]) { display: none; }
.mark {
  display: flex;
  width: 100%;
  height: 100%;
  --aora-bg: var(--aora-bg-base, Canvas);
}
.mark > svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
  user-select: none;
  -webkit-user-select: none;
}
`;
const pick = (value, allowed)=>null !== value && allowed.includes(value) ? value : void 0;
const finite = (value)=>{
    if (null === value || '' === value.trim()) return;
    const number = Number(value);
    return Number.isFinite(number) ? number : void 0;
};
function jsonObject(value) {
    try {
        const parsed = JSON.parse(value ?? '');
        return null === parsed || 'object' != typeof parsed || Array.isArray(parsed) ? {} : parsed;
    } catch  {
        return {};
    }
}
function cssLength(value) {
    const text = value?.trim();
    if (!text) return null;
    const length = /^\d*\.?\d+$/.test(text) ? `${text}px` : text;
    const probe = document.createElement('span');
    probe.style.width = length;
    return probe.style.width ? length : null;
}
function resolve(el) {
    const get = (name)=>el.getAttribute(name);
    const member = castMember(get('character'));
    const shape = pick(get('shape'), ALL_SHAPE_IDS) ?? member?.shape ?? DEFAULT_SHAPE;
    const color = pick(get('color'), ALL_COLOR_IDS) ?? member?.color ?? 'black';
    const faceAttr = get('face') ?? void 0;
    const face = (isFaceStyle(faceAttr) ? faceAttr : void 0) ?? member?.face ?? DEFAULT_FACE;
    const seed = get('seed') || `${shape}:${color}`;
    const noseAttr = get('nose');
    const nose = 'none' === noseAttr ? null : null !== noseAttr && isNoseId(noseAttr) ? noseAttr : member?.nose ?? autoNoseForKey(seed);
    const stateAttr = get('state');
    const state = null !== stateAttr && isCharacterState(stateAttr) ? stateAttr : IDLE_STATE;
    const styleAttr = get('style-id');
    const style = null !== styleAttr && hasStyle(styleAttr) ? styleAttr : DEFAULT_STYLE_ID;
    const series = getStyle(style);
    const variantAttr = get('variant');
    const variant = null !== variantAttr && acceptsVariant(series, variantAttr) ? variantAttr : series.defaultVariant;
    const eyeScale = finite(get('eye-scale'));
    return {
        live: {
            shape,
            state,
            variant,
            style,
            styleOptions: jsonObject(get('style-options')),
            face,
            nose,
            paused: el.hasAttribute('paused'),
            emphasis: el.hasAttribute('emphasis'),
            eyeScale: void 0 !== eyeScale && eyeScale > 0 ? eyeScale : 1,
            lineWeight: finite(get('line-weight')) ?? 1,
            badgeColor: get('badge-color') ?? 'var(--aora-accent)',
            antics: el.hasAttribute('antics')
        },
        fixed: {
            seed,
            reducedMotion: el.hasAttribute('reduced-motion') || void 0,
            autoPause: el.hasAttribute('auto-pause')
        },
        color,
        member,
        eyeColor: get('eye-color'),
        size: cssLength(get('size'))
    };
}
const Base = "u" < typeof HTMLElement ? class {
} : HTMLElement;
class AoraBotElement extends Base {
    static observedAttributes = ATTRIBUTES;
    #style = document.createElement('style');
    #mark = document.createElement('span');
    #controller = null;
    #autoLabel = null;
    constructor(){
        super();
        this.#mark.className = 'mark';
        this.attachShadow({
            mode: 'open'
        }).append(this.#style, this.#mark);
    }
    get controller() {
        return this.#controller;
    }
    connectedCallback() {
        if (!this.hasAttribute('role')) this.setAttribute('role', 'img');
        this.#apply(true);
    }
    disconnectedCallback() {
        this.#controller?.destroy();
        this.#controller = null;
    }
    attributeChangedCallback(name) {
        if (this.#controller) this.#apply(FIXED.has(name));
    }
    spin(turns) {
        this.#controller?.spin(turns);
    }
    bounce(strength) {
        this.#controller?.bounce(strength);
    }
    burst(count) {
        this.#controller?.burst(count);
    }
    pause() {
        this.#controller?.pause();
    }
    resume() {
        this.#controller?.resume();
    }
    #apply(rebuild) {
        const needed = themesNeeded({
            shape: this.getAttribute('shape'),
            preset: this.getAttribute('character'),
            variant: this.getAttribute('variant'),
            style: this.getAttribute('style-id'),
            color: this.getAttribute('color')
        });
        if (needed.length > 0) {
            const size = cssLength(this.getAttribute('size'));
            this.#style.textContent = size ? `${BASE_STYLES}:host { width: ${size}; height: ${size}; }` : BASE_STYLES;
            loadThemes(needed).then(()=>this.isConnected && this.#apply(true), (error)=>console.error(error));
            return;
        }
        const { live, fixed, color, member, eyeColor, size } = resolve(this);
        this.#style.textContent = size ? `${BASE_STYLES}:host { width: ${size}; height: ${size}; }` : BASE_STYLES;
        const vars = {
            ...getInkVars(color),
            '--aora-leaf': getLeafColor(color)
        };
        this.#mark.removeAttribute('style');
        for (const [name, value] of Object.entries(vars))this.#mark.style.setProperty(name, value);
        if (eyeColor) this.#mark.style.setProperty('--aora-eye', eyeColor);
        this.#label(member);
        if (this.#controller && !rebuild) return void this.#controller.update(live);
        this.#controller?.destroy();
        this.#controller = createCharacter(this.#mark, {
            ...live,
            ...fixed
        });
    }
    #label(member) {
        const own = this.getAttribute('aria-label');
        if (null !== own && own !== this.#autoLabel) return;
        const language = this.closest('[lang]')?.getAttribute('lang') ?? '';
        const label = member ? member.name[/^zh/i.test(language) ? 'zh' : 'en'] : 'Aora Bot';
        this.setAttribute('aria-label', label);
        this.#autoLabel = label;
    }
}
const PROPERTIES = {
    text: {
        character: 'character',
        shape: 'shape',
        color: 'color',
        face: 'face',
        nose: 'nose',
        state: 'state',
        styleId: 'style-id',
        variant: 'variant',
        styleOptions: 'style-options',
        seed: 'seed',
        size: 'size',
        eyeColor: 'eye-color',
        badgeColor: 'badge-color'
    },
    number: {
        eyeScale: 'eye-scale',
        lineWeight: 'line-weight'
    },
    flag: {
        reducedMotion: 'reduced-motion',
        paused: 'paused',
        emphasis: 'emphasis',
        antics: 'antics',
        autoPause: 'auto-pause'
    }
};
function defineProperty(name, attribute, kind) {
    Object.defineProperty(AoraBotElement.prototype, name, {
        configurable: true,
        enumerable: true,
        get () {
            const value = this.getAttribute(attribute);
            if ('flag' === kind) return null !== value;
            return 'number' === kind && null !== value ? finite(value) ?? null : value;
        },
        set (value) {
            if ('flag' === kind) this.toggleAttribute(attribute, Boolean(value));
            else if (null == value) this.removeAttribute(attribute);
            else this.setAttribute(attribute, String(value));
        }
    });
}
for (const [kind, names] of Object.entries(PROPERTIES))for (const [name, attribute] of Object.entries(names))defineProperty(name, attribute, kind);
let defined = false;
function defineAoraBot(tagName = 'aora-bot') {
    if ("u" < typeof customElements) return AoraBotElement;
    const existing = customElements.get(tagName);
    if (existing) return existing;
    const constructor = defined ? class extends AoraBotElement {
    } : AoraBotElement;
    customElements.define(tagName, constructor);
    defined = true;
    return constructor;
}
export { AoraBotElement, defineAoraBot };
