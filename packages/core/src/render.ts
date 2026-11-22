/**
 * Draw one character as SVG.
 *
 * Deliberately a pure function of its options: no DOM, no clock, no globals.
 * That is what lets the same code serve a browser, a static export and a test,
 * and it is the reason a still image can be asserted byte for byte.
 *
 * A character is composed in four layers, in this order: the body, its surface
 * markings, the face, then everything that hangs off the silhouette (ears,
 * halos, tails). Surface markings belong under the face — a blush that covers
 * an eye reads as damage — while ears belong over it, because they are outside
 * the body entirely.
 */
import { colorHex } from './palette.js';
import { faceFor, type EyeStyle, type MouthStyle } from './face.js';
import { getBody } from './body.js';
import { renderTraits, TRAITS } from './traits.js';
import { castMember } from './cast.js';

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

const DARK_INK = '#1F1F1F';
const LIGHT_INK = '#FFFFFF';

const SURFACE_TRAITS = new Set(['blush', 'freckles', 'spots', 'stripes', 'patch', 'starfield', 'none']);

/**
 * Eyes that can blink.
 *
 * A drawn-closed eye is already shut, and a line is already a line: squashing
 * either towards its own centre reads as a twitch, not as a blink. The half
 * lid stays in, because closing it the rest of the way is what a tired blink
 * looks like.
 */
const BLINKABLE = new Set<EyeStyle>(['dot', 'wide', 'pill', 'heart', 'star', 'half']);

/**
 * The idle loop, baked into the drawing itself.
 *
 * It lives inside the SVG rather than in a host stylesheet so the same markup
 * is alive wherever it lands: spliced in as innerHTML, serialised into a data
 * URL, or drawn by the custom element. Everything it moves is a transform on
 * two groups: no path is re-rendered, and the layout a frame does pay for stays
 * inside each SVG subtree, never the page. The two animations share a period
 * and are offset by the delay a host can set.
 */
const MOTION_STYLE = '<style>' +
  '.et-breathe{animation:et-breathe 4.8s cubic-bezier(.37,0,.63,1) infinite;transform-origin:50px 94px}' +
  '.et-eyes{animation:et-blink 4.8s linear infinite}' +
  '@keyframes et-breathe{0%,100%{transform:scale(1) rotate(0)}50%{transform:scale(1.03) rotate(-.8deg)}}' +
  '@keyframes et-blink{0%,93%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}' +
  '@media (prefers-reduced-motion:reduce){.et-breathe,.et-eyes{animation:none}}' +
  '</style>';

/**
 * The face is never the same colour as the body.
 *
 * A black ball with a black face is a black ball. Rather than expose another
 * option, the ink is derived from the body's brightness: dark bodies get a
 * white face, light bodies get a dark one. That keeps the palette to one
 * choice per character, which is what a picker wants.
 */
export function inkFor(bodyHex: string): string {
  const hex = bodyHex.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.55 ? LIGHT_INK : DARK_INK;
}

/** Lighten (positive) or darken (negative) a hex colour by a ratio. */
function shade(hex: string, ratio: number): string {
  const h = hex.replace('#', '');
  const to = (i: number) => {
    const v = parseInt(h.slice(i, i + 2), 16);
    const next = ratio >= 0 ? v + (255 - v) * ratio : v * (1 + ratio);
    return Math.max(0, Math.min(255, Math.round(next))).toString(16).padStart(2, '0');
  };
  return `#${to(0)}${to(2)}${to(4)}`;
}

/** A four-point spark, drawn from the body's colour rather than an asset. */
function spark(x: number, y: number, r: number, fill: string, opacity: number): string {
  return `<path d="M${x} ${y - r}Q${x + r * 0.22} ${y - r * 0.22} ${x + r} ${y}Q${x + r * 0.22} ${y + r * 0.22} ${x} ${y + r}Q${x - r * 0.22} ${y + r * 0.22} ${x - r} ${y}Q${x - r * 0.22} ${y - r * 0.22} ${x} ${y - r}Z" fill="${fill}" opacity="${opacity}"/>`;
}

function eye(style: EyeStyle, x: number, y: number, scale: number, ink: string, weight = 1): string {
  const s = scale;
  switch (style) {
    case 'dot':
      return `<circle cx="${x}" cy="${y}" r="${4.4 * s}" fill="${ink}"/><circle cx="${x - 1.5 * s}" cy="${y - 1.7 * s}" r="${1.5 * s}" fill="#FFFFFF" opacity="0.85"/>`;
    case 'wide':
      return `<circle cx="${x}" cy="${y}" r="${5.6 * s}" fill="${ink}"/><circle cx="${x - 1.9 * s}" cy="${y - 2.1 * s}" r="${1.9 * s}" fill="#FFFFFF" opacity="0.85"/>`;
    case 'pill':
      // Two upright capsules: the eye shape the reference wall is built on.
      return `<rect x="${(x - 4.4 * s).toFixed(1)}" y="${(y - 6.8 * s).toFixed(1)}" width="${(8.8 * s).toFixed(1)}" height="${(13.6 * s).toFixed(1)}" rx="${(4.4 * s).toFixed(1)}" fill="${ink}"/>`;
    case 'heart':
      return `<path d="M${x} ${y + 4.4 * s}C${x - 6 * s} ${y - 0.6 * s} ${x - 4.4 * s} ${y - 5.4 * s} ${x} ${y - 2.4 * s}C${x + 4.4 * s} ${y - 5.4 * s} ${x + 6 * s} ${y - 0.6 * s} ${x} ${y + 4.4 * s}Z" fill="#F0526E"/>`;
    case 'squint':
      return `<path d="M${x - 5 * s} ${y + 1.4 * s}Q${x} ${y - 4.4 * s} ${x + 5 * s} ${y + 1.4 * s}" fill="none" stroke="${ink}" stroke-width="${2.9 * s * weight}" stroke-linecap="round"/>`;
    case 'arc':
      return `<path d="M${x - 5.8 * s} ${y + 1.2 * s} Q${x} ${y - 3.6 * s} ${x + 5.8 * s} ${y + 1.2 * s}" fill="none" stroke="${ink}" stroke-width="${3.1 * s * weight}" stroke-linecap="round"/>`;
    case 'closed':
      return `<path d="M${x - 5 * s} ${y} Q${x} ${y + 3 * s} ${x + 5 * s} ${y}" fill="none" stroke="${ink}" stroke-width="${2.4 * s * weight}" stroke-linecap="round"/>`;
    case 'line':
      return `<path d="M${x - 4 * s} ${y} L${x + 4 * s} ${y}" fill="none" stroke="${ink}" stroke-width="${2.6 * s * weight}" stroke-linecap="round"/>`;
    case 'star':
      return `<path d="M${x} ${y - 6 * s}L${x + 1.8 * s} ${y - 1.8 * s}L${x + 6 * s} ${y}L${x + 1.8 * s} ${y + 1.8 * s}L${x} ${y + 6 * s}L${x - 1.8 * s} ${y + 1.8 * s}L${x - 6 * s} ${y}L${x - 1.8 * s} ${y - 1.8 * s}Z" fill="${ink}"/>`;
    /*
     * A half-lidded eye: the lid is the line, the pupil is what is still
     * visible under it. That is the difference between tired and asleep —
     * asleep is a closed line with nothing below it.
     */
    case 'half':
      return `<path d="M${(x - 5.2 * s).toFixed(1)} ${(y - 1 * s).toFixed(1)} Q${x.toFixed(1)} ${(y + 3.2 * s).toFixed(1)} ${(x + 5.2 * s).toFixed(1)} ${(y - 1 * s).toFixed(1)}" fill="none" stroke="${ink}" stroke-width="${2.5 * s * weight}" stroke-linecap="round"/><circle cx="${x}" cy="${y + 2.4 * s}" r="${2.3 * s}" fill="${ink}"/>`;
    default:
      return '';
  }
}

function mouth(style: MouthStyle, x: number, y: number, scale: number, ink: string, weight = 1): string {
  const s = scale;
  switch (style) {
    case 'smile':
      return `<path d="M${x - 4 * s} ${y} Q${x} ${y + 4 * s} ${x + 4 * s} ${y}" fill="none" stroke="${ink}" stroke-width="${2.2 * s * weight}" stroke-linecap="round"/>`;
    case 'grin':
      return `<path d="M${x - 5 * s} ${y - 1} Q${x} ${y + 6 * s} ${x + 5 * s} ${y - 1}Z" fill="${ink}"/>`;
    case 'open':
      return `<ellipse cx="${x}" cy="${y + 1}" rx="${4 * s}" ry="${4.6 * s}" fill="${ink}"/>`;
    case 'o':
      return `<circle cx="${x}" cy="${y + 1}" r="${3 * s}" fill="${ink}"/>`;
    case 'flat':
      return `<path d="M${x - 4 * s} ${y} L${x + 4 * s} ${y}" stroke="${ink}" stroke-width="${2.2 * s * weight}" stroke-linecap="round"/>`;
    case 'wave':
      return `<path d="M${x - 4.5 * s} ${y} Q${x - 2.2 * s} ${y + 3.4 * s} ${x} ${y} Q${x + 2.2 * s} ${y - 3.4 * s} ${x + 4.5 * s} ${y}" fill="none" stroke="${ink}" stroke-width="${2.2 * s * weight}" stroke-linecap="round"/>`;
    case 'tiny':
      return `<path d="M${x - 2 * s} ${y} Q${x} ${y + 2 * s} ${x + 2 * s} ${y}" fill="none" stroke="${ink}" stroke-width="${1.8 * s * weight}" stroke-linecap="round"/>`;
    case 'tongue':
      return `<path d="M${x - 5.5 * s} ${y - 1} Q${x} ${y + 7 * s} ${x + 5.5 * s} ${y - 1}Z" fill="${ink}"/><ellipse cx="${x}" cy="${y + 3.6 * s}" rx="${3.4 * s}" ry="${2.6 * s}" fill="#F0526E"/>`;
    case 'big':
      return `<ellipse cx="${x}" cy="${y + 1.4 * s}" rx="${5.4 * s}" ry="${6.6 * s}" fill="${ink}"/><ellipse cx="${x}" cy="${y + 3.6 * s}" rx="${3 * s}" ry="${2.4 * s}" fill="#F0526E" opacity="0.9"/>`;
    case 'smirk':
      return `<path d="M${x - 4.4 * s} ${y + 1} Q${x - 1} ${y + 4.4 * s} ${x + 4.4 * s} ${y - 1.4 * s}" fill="none" stroke="${ink}" stroke-width="${2.3 * s * weight}" stroke-linecap="round"/>`;
    /* A small round mouth: the "lost in thought" dot, not a kiss. */
    case 'dot':
      return `<circle cx="${x}" cy="${(y + 1.2 * s).toFixed(1)}" r="${(1.9 * s).toFixed(1)}" fill="${ink}"/>`;
    /* The mirrored smile: corners down, the whole face follows. */
    case 'frown':
      return `<path d="M${(x - 4 * s).toFixed(1)} ${(y + 2.2 * s).toFixed(1)} Q${x.toFixed(1)} ${(y - 2.2 * s).toFixed(1)} ${(x + 4 * s).toFixed(1)} ${(y + 2.2 * s).toFixed(1)}" fill="none" stroke="${ink}" stroke-width="${2.2 * s * weight}" stroke-linecap="round"/>`;
    default:
      return '';
  }
}

/**
 * Eyebrows, as six postures rather than six drawings.
 *
 * `s` is the same eye scale the eyes use, so a brow follows the face it sits
 * on. The stroke is a little lighter than the eyes: a brow that competes with
 * the pupil reads as a second pair of eyes at 46px.
 */
function brow(style: string, x: number, y: number, s: number, ink: string, weight = 1): string {
  const unit = s * weight;
  const left = x - 14.5 * s;
  const right = x + 14.5 * s;
  const line = (cx: number, cy: number, slope: number) =>
    `<path d="M${(cx - 4.6 * s).toFixed(1)} ${(cy + slope * 4.6 * s).toFixed(1)} L${(cx + 4.6 * s).toFixed(1)} ${(cy - slope * 4.6 * s).toFixed(1)}" fill="none" stroke="${ink}" stroke-width="${2.3 * unit}" stroke-linecap="round" opacity="0.86"/>`;
  const arc = (cx: number, cy: number) =>
    `<path d="M${(cx - 4.6 * s).toFixed(1)} ${cy.toFixed(1)} Q${cx.toFixed(1)} ${(cy - 3.4 * s).toFixed(1)} ${(cx + 4.6 * s).toFixed(1)} ${cy.toFixed(1)}" fill="none" stroke="${ink}" stroke-width="${2.3 * unit}" stroke-linecap="round" opacity="0.86"/>`;
  switch (style) {
    case 'raised':
      return arc(left, y) + arc(right, y);
    // Angry: the inner ends drop toward the nose.
    case 'down':
      return line(left, y, 0.55) + line(right, y, -0.55);
    // Worried: the inner ends lift, the outer ends drop.
    case 'knit':
      return line(left, y, -0.5) + line(right, y, 0.5);
    // Skeptic: one flat brow, one cocked.
    case 'one-up':
      return line(left, y, 0) + arc(right, y - 1.4 * s);
    // Resigned: both brows flat but sagging outward.
    case 'skeptic':
      return line(left, y, 0.34) + line(right, y, 0.34);
    default:
      return line(left, y, 0) + line(right, y, 0);
  }
}

/**
 * The face of one expression, positioned inside the body.
 *
 * `motion: 'demo'` groups the two eyes so the idle loop can blink them. The
 * group carries its own transform origin (the eye line) as an inline style,
 * because that origin depends on the body the face sits on.
 */
export function renderFace(
  state: string,
  face: { x: number; y: number },
  ink: string,
  baseEyeScale = 1,
  weight = 1,
  motion?: MotionMode,
): string {
  const spec = faceFor(state);
  /*
   * The face never turns: a character that looks to the side at a stranger
   * reads as a person, and this is a pet. What moves instead is the face
   * inside the silhouette — the lean, the eye size, the mouth size — and it
   * moves further than the literal offsets so an expression is visible at a
   * glance instead of having to be compared with the one before it.
   */
  const LEAN = 1.6;
  const SCALE = 1.25;
  /*
   * A shaking face is drawn shaking.
   *
   * The element also animates it, but the gallery, the settings grid and the
   * evidence screenshots are stills; a state whose whole point is trembling
   * has to say so in one frame. The offset is deliberately uneven — equal
   * offsets on both eyes read as a smear, not as a tremble.
   */
  const shake = Math.max(0, Math.min(1, spec.shake ?? 0));
  const wob = shake * 1.8;
  const dx = face.x + (spec.dx ?? 0) * LEAN + wob * 0.6;
  const dy = face.y + (spec.dy ?? 0) * LEAN - wob * 0.4;
  const es = baseEyeScale * (1 + ((spec.eyeScale ?? 1) - 1) * SCALE);
  const ms = baseEyeScale * (1 + ((spec.mouthScale ?? 1) - 1) * SCALE);
  const leftEye = eye(spec.eye, dx - 14.5 * baseEyeScale + wob, dy - 3 + wob * 0.4, es, ink, weight);
  const rightEye = eye(spec.eye, dx + 14.5 * baseEyeScale - wob * 0.7, dy - 3 - wob * 0.3, es * (spec.eyeAsym ?? 1), ink, weight);
  let eyes = leftEye + rightEye;
  if (motion === 'demo' && BLINKABLE.has(spec.eye)) {
    eyes = `<g class="et-eyes" style="transform-origin:${dx.toFixed(1)}px ${(dy - 3).toFixed(1)}px">${eyes}</g>`;
  }
  const parts = [eyes, mouth(spec.mouth, dx - wob * 0.5, dy + 12, ms, ink, weight)];
  if (spec.brow) parts.push(brow(spec.brow, dx, dy - 14 * baseEyeScale, baseEyeScale, ink, weight));
  if (shake > 0) {
    // Two motion ticks at the temples: the drawn half of a tremble.
    const tick = (dir: number) =>
      `<path d="M${(dx + dir * 27 * baseEyeScale).toFixed(1)} ${(dy - 7).toFixed(1)} q${dir * 3} 4 0 8" fill="none" stroke="${ink}" stroke-width="${2 * baseEyeScale * weight}" stroke-linecap="round" opacity=${(0.35 + shake * 0.3).toFixed(2)}/>`;
    parts.push(tick(-1), tick(1));
  }
  for (const mark of spec.marks ?? []) parts.push(markSvg(mark, dx, dy, baseEyeScale));

  if (spec.blush) {
    parts.unshift(
      `<ellipse cx="${dx - 19 * baseEyeScale}" cy="${dy + 8}" rx="6" ry="3.2" fill="${ink}" opacity="0.2"/>`,
      `<ellipse cx="${dx + 19 * baseEyeScale}" cy="${dy + 8}" rx="6" ry="3.2" fill="${ink}" opacity="0.2"/>`,
    );
  }
  return parts.join('');
}

/** The little props: a tear, a sweat drop, an anger vein, a sparkle, zzz. */
function markSvg(mark: string, x: number, y: number, k: number): string {
  const at = (sx: number, sy: number) => `${(x + sx * k).toFixed(1)} ${(y + sy * k).toFixed(1)}`;
  switch (mark) {
    case 'tear':
      return `<path d="M${at(16, 12)}q3 4 0 6q-3-2 0-6Z" fill="#5B9BE8"/>`;
    case 'sweat':
      return `<path d="M${at(20, -12)}q3.4 4.6 0 6.8q-3.4-2.2 0-6.8Z" fill="#5B9BE8"/>`;
    case 'anger':
      return `<g stroke="#E2453C" stroke-width="${1.8 * k}" stroke-linecap="round" fill="none"><path d="M${at(15, -14)}l6 0M${at(18, -17)}l0 6M${at(21, -14)}l-6 0M${at(18, -11)}l0 -6"/></g>`;
    case 'sparkle':
      return spark(x + 20 * k, y - 16 * k, 3.4 * k, '#FFD34D', 0.95) + spark(x + 25 * k, y - 6 * k, 2.2 * k, '#FFD34D', 0.8);
    case 'zzz':
      return `<g stroke="#9AA6C8" stroke-width="${1.6 * k}" fill="none" stroke-linecap="round"><path d="M${at(16, -18)}h5l-5 5h5"/><path d="M${at(23, -25)}h4l-4 4h4"/></g>`;
    default:
      return '';
  }
}

/** One character, as a standalone SVG string. */
export function renderCharacter(options: RenderOptions): string {
  const bodyId = options.body ?? options.shape ?? 'circle';
  const body = getBody(bodyId);
  const bodyHex = colorHex(options.color);
  const ink = inkFor(bodyHex);
  const size = options.size;
  const traits = options.traits ?? [];

  const surfaces = traits.filter((t) => SURFACE_TRAITS.has(t) && TRAITS[t]);
  const head = traits.filter((t) => !SURFACE_TRAITS.has(t) && TRAITS[t]);

  const style = options.style ?? 'flat';
  const motion = options.motion;
  const dark = shade(bodyHex, style === 'flat' ? -0.1 : -0.38);
  const light = shade(bodyHex, 0.45);

  // Each style contributes its own paint and its own decorations; the layers
  // under the face and over the silhouette stay identical for all three.
  let defs = '';
  let behind = '';
  let shell = '';
  let over = '';

  // Signature add-ons (a pear's stem, a tot's antenna) belong to the species:
  // they are drawn from the body's own colour family, never as a separate trait.
  const tone = (kind?: 'body' | 'shade' | 'light') =>
    kind === 'shade' ? shade(bodyHex, -0.32) : kind === 'light' ? shade(bodyHex, 0.32) : bodyHex;
  const penOnly = style === 'line';
  const parts = body.parts ?? [];
  // A round-joined stroke of the fill's own colour blunts sharp corners.
  const fat = body.round ? ` stroke="${bodyHex}" stroke-width="${body.round}" stroke-linejoin="round"` : '';
  const partSvg = (part: { d: string; tone?: 'body' | 'shade' | 'light'; rotate?: number }) =>
    `<path d="${part.d}" fill="${tone(part.tone)}"${part.rotate ? ` transform="rotate(${part.rotate} 50 50)"` : ''}/>`;
  const partsBehind = parts
    .filter((part) => part.behind)
    .map((part) => partSvg(part))
    .join('');
  const partsOver = parts
    .filter((part) => !part.behind)
    .map((part) => partSvg(part))
    .join('');
  behind += partsBehind;

  if (options.outline) {
    shell = `<path d="${body.path}" fill="none" stroke="${bodyHex}" stroke-width="2.4"/>`;
  } else if (style === 'sticker') {
    /*
     * A die-cut sticker: one paper-white edge around the whole silhouette, the
     * fill on top of it. The old version used a darker edge of the body's own
     * colour, which reads as dirt on a dark desktop; a white cut-line is what
     * actually makes a sticker look peeled off a sheet.
     *
     * A near-white body needs a dark cut-line instead, or the paper edge and
     * the body merge into one blank shape.
     */
    const lum = (() => {
      const h = bodyHex.replace('#', '');
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    })();
    const paper = lum > 0.8 ? '#2A2A30' : '#FFFFFF';
    // Stems, leaves and antennae sit *behind* the body; giving them the same
    // paper edge turns a thin stem into a fat white bar, so they stay un-edged.
    const outline = [body.path, ...parts.filter((part) => !part.behind).map((part) => part.d)]
      .map((d) => `<path d="${d}"/>`)
      .join('');
    behind += `<g fill="none" stroke="${paper}" stroke-width="${10 + (body.round ?? 0)}" stroke-linejoin="round" stroke-linecap="round">${outline}</g>`;
    shell = `<path d="${body.path}" fill="${bodyHex}"${fat}/>`;
    over += `<ellipse cx="${body.face.x - 14}" cy="${body.face.y - 14}" rx="8" ry="4.6" fill="#FFFFFF" opacity="0.3" transform="rotate(-28 ${body.face.x - 14} ${body.face.y - 14})"/>`;
  } else if (style === 'glow') {
    defs = `<defs><radialGradient id="g${bodyId}" cx="38%" cy="32%" r="78%"><stop offset="0" stop-color="${shade(bodyHex, 0.32)}"/><stop offset="0.62" stop-color="${bodyHex}"/><stop offset="1" stop-color="${shade(bodyHex, -0.22)}"/></radialGradient></defs>`;
    // The halo follows the silhouette, not a circle: a star inside a round
    // halo reads as two objects stacked, not as one glowing character.
    behind = `<path d="${body.path}" fill="none" stroke="${bodyHex}" stroke-width="7" opacity="0.16" transform="translate(50 50) scale(1.1) translate(-50 -50)"/>`;
    shell = `<path d="${body.path}" fill="url(#g${bodyId})" stroke="${light}" stroke-width="2" stroke-linejoin="round"/>`;
    over += spark(76, 26, 3.6, light, 0.7);
  } else if (style === 'dots') {
    // Halftone: the fill is a dot pattern clipped to the silhouette, with a
    // hairline edge so the shape still reads at 48px.
    defs = `<defs><pattern id="d${bodyId}" width="9.5" height="9.5" patternUnits="userSpaceOnUse"><circle cx="4.75" cy="4.75" r="1.75" fill="${bodyHex}"/></pattern><clipPath id="k${bodyId}"><path d="${body.path}"/></clipPath></defs>`;
    shell = `<g clip-path="url(#k${bodyId})"><rect x="0" y="0" width="100" height="100" fill="url(#d${bodyId})"/></g><path d="${body.path}" fill="none" stroke="${bodyHex}" stroke-width="1.6"/>`;
  } else if (style === 'line') {
    // A white ball drawn in white is an empty card, so a pale body gets its
    // own colour pushed darker until the pen is visible on paper.
    const paper = (() => {
      const h = bodyHex.replace('#', '');
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    })();
    const pen = paper > 0.72 ? shade(bodyHex, -0.55) : bodyHex;
    // `Z` matters here: a fill closes the outline implicitly, a stroke does
    // not, so without it every body has a hairline gap where it was sampled.
    shell = `<path d="${body.path} Z" fill="none" stroke="${pen}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
  } else if (style === 'emoji') {
    /*
     * The system-emoji finish. Four things do the work, and all four are what
     * Apple's objects have in common: a vertical volume gradient (lit from the
     * top-left), a clipped shine along the crown, a soft occlusion shadow at
     * the base so the object sits on the ground, and a hairline edge that is a
     * touch darker than the fill so the silhouette stays crisp on light paper.
     */
    defs = `<defs><linearGradient id="e${bodyId}" x1="0.25" y1="0" x2="0.75" y2="1"><stop offset="0" stop-color="${shade(bodyHex, 0.34)}"/><stop offset="0.52" stop-color="${bodyHex}"/><stop offset="1" stop-color="${shade(bodyHex, -0.24)}"/></linearGradient><clipPath id="k${bodyId}"><path d="${body.path}"/></clipPath></defs>`;
    shell = `<path d="${body.path}" fill="url(#e${bodyId})" stroke="${shade(bodyHex, -0.22)}" stroke-width="1.2" stroke-linejoin="round"/>`;
    over += `<g clip-path="url(#k${bodyId})"><ellipse cx="44" cy="26" rx="20" ry="10" fill="#FFFFFF" opacity="0.3" transform="rotate(-20 44 26)"/><ellipse cx="50" cy="96" rx="40" ry="16" fill="${shade(bodyHex, -0.5)}" opacity="0.16"/></g>`;
  } else if (style === 'candy') {
    // Candy: a vertical gradient with a soft curved highlight, clipped so the
    // shine never spills outside a star or a heart.
    defs = `<defs><linearGradient id="c${bodyId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(bodyHex, 0.3)}"/><stop offset="0.55" stop-color="${bodyHex}"/><stop offset="1" stop-color="${shade(bodyHex, -0.16)}"/></linearGradient><clipPath id="k${bodyId}"><path d="${body.path}"/></clipPath></defs>`;
    shell = `<path d="${body.path}" fill="url(#c${bodyId})"/>`;
    over += `<g clip-path="url(#k${bodyId})"><ellipse cx="42" cy="30" rx="21" ry="12" fill="#FFFFFF" opacity="0.34" transform="rotate(-18 42 30)"/></g>`;
  } else {
    // Flat, and the default: one solid colour, no edge, no shine. Anything the
    // silhouette cannot say by itself does not belong here.
    shell = `<path d="${body.path}" fill="${bodyHex}"${fat}/>`;
  }

  /*
   * The idle loop wraps the finished layers in one group, so a host can pause
   * it by pausing one animation and a data URL still moves. The <defs> stays
   * outside the moving group: gradients and clip paths are geometry, not
   * something to re-evaluate per frame.
   */
  const layers = [
    behind,
    shell,
    partsOver,
    renderTraits(surfaces, { ink, fill: bodyHex, body }),
    renderFace(options.state, body.face, ink, body.eyeScale ?? 1, style === 'dots' ? 1.7 : style === 'line' ? 1.15 : 1, motion),
    renderTraits(head, { ink, fill: bodyHex, body }),
    over,
  ].join('');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="emoji-tot">`,
    defs,
    motion === 'demo' ? MOTION_STYLE : '',
    motion === 'demo' ? `<g class="et-breathe">${layers}</g>` : layers,
    `</svg>`,
  ].join('');
}

/** Render a member of the cast by id. Unknown ids fall back to the first one. */
export function renderCast(options: CastRenderOptions): string {
  const member = castMember(options.id);
  if (!member) {
    return renderCharacter({ body: 'circle', color: 'cream', state: options.state ?? 'idle', size: options.size ?? 96 });
  }
  return renderCharacter({
    body: member.body,
    color: member.color,
    traits: member.traits,
    state: options.state ?? member.face ?? 'idle',
    size: options.size ?? 96,
    style: options.style,
    motion: options.motion,
  });
}

export function renderDataUrl(options: RenderOptions): string {
  return `data:image/svg+xml,${encodeURIComponent(renderCharacter(options))}`;
}
