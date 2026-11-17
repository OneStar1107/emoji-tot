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
 */
export type RenderStyle = 'flat' | 'sticker' | 'glow';

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
}

/** Render a cast member by id, with an optional expression override. */
export interface CastRenderOptions {
  id: string;
  state?: string;
  size?: number;
  style?: RenderStyle;
}

const DARK_INK = '#1F1F1F';
const LIGHT_INK = '#FFFFFF';

const SURFACE_TRAITS = new Set(['blush', 'freckles', 'spots', 'stripes', 'patch', 'starfield', 'none']);

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

function eye(style: EyeStyle, x: number, y: number, scale: number, ink: string): string {
  const s = scale;
  switch (style) {
    case 'dot':
      return `<circle cx="${x}" cy="${y}" r="${4.4 * s}" fill="${ink}"/>`;
    case 'wide':
      return `<circle cx="${x}" cy="${y}" r="${5.6 * s}" fill="${ink}"/>`;
    case 'arc':
      return `<path d="M${x - 5 * s} ${y + 1} Q${x} ${y - 5 * s} ${x + 5 * s} ${y + 1}" fill="none" stroke="${ink}" stroke-width="${2.6 * s}" stroke-linecap="round"/>`;
    case 'closed':
      return `<path d="M${x - 5 * s} ${y} Q${x} ${y + 3 * s} ${x + 5 * s} ${y}" fill="none" stroke="${ink}" stroke-width="${2.4 * s}" stroke-linecap="round"/>`;
    case 'line':
      return `<path d="M${x - 4 * s} ${y} L${x + 4 * s} ${y}" fill="none" stroke="${ink}" stroke-width="${2.6 * s}" stroke-linecap="round"/>`;
    case 'star':
      return `<path d="M${x} ${y - 6 * s}L${x + 1.8 * s} ${y - 1.8 * s}L${x + 6 * s} ${y}L${x + 1.8 * s} ${y + 1.8 * s}L${x} ${y + 6 * s}L${x - 1.8 * s} ${y + 1.8 * s}L${x - 6 * s} ${y}L${x - 1.8 * s} ${y - 1.8 * s}Z" fill="${ink}"/>`;
    default:
      return '';
  }
}

function mouth(style: MouthStyle, x: number, y: number, scale: number, ink: string): string {
  const s = scale;
  switch (style) {
    case 'smile':
      return `<path d="M${x - 4 * s} ${y} Q${x} ${y + 4 * s} ${x + 4 * s} ${y}" fill="none" stroke="${ink}" stroke-width="${2.2 * s}" stroke-linecap="round"/>`;
    case 'grin':
      return `<path d="M${x - 5 * s} ${y - 1} Q${x} ${y + 6 * s} ${x + 5 * s} ${y - 1}Z" fill="${ink}"/>`;
    case 'open':
      return `<ellipse cx="${x}" cy="${y + 1}" rx="${4 * s}" ry="${4.6 * s}" fill="${ink}"/>`;
    case 'o':
      return `<circle cx="${x}" cy="${y + 1}" r="${3 * s}" fill="${ink}"/>`;
    case 'flat':
      return `<path d="M${x - 4 * s} ${y} L${x + 4 * s} ${y}" stroke="${ink}" stroke-width="${2.2 * s}" stroke-linecap="round"/>`;
    case 'wave':
      return `<path d="M${x - 4.5 * s} ${y} Q${x - 2.2 * s} ${y + 3.4 * s} ${x} ${y} Q${x + 2.2 * s} ${y - 3.4 * s} ${x + 4.5 * s} ${y}" fill="none" stroke="${ink}" stroke-width="${2.2 * s}" stroke-linecap="round"/>`;
    case 'tiny':
      return `<path d="M${x - 2 * s} ${y} Q${x} ${y + 2 * s} ${x + 2 * s} ${y}" fill="none" stroke="${ink}" stroke-width="${1.8 * s}" stroke-linecap="round"/>`;
    default:
      return '';
  }
}

/** The face of one expression, positioned inside the body. */
export function renderFace(state: string, face: { x: number; y: number }, ink: string, baseEyeScale = 1): string {
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
  const dx = face.x + (spec.dx ?? 0) * LEAN;
  const dy = face.y + (spec.dy ?? 0) * LEAN;
  const es = baseEyeScale * (1 + ((spec.eyeScale ?? 1) - 1) * SCALE);
  const ms = baseEyeScale * (1 + ((spec.mouthScale ?? 1) - 1) * SCALE);
  const parts = [
    eye(spec.eye, dx - 13 * baseEyeScale, dy - 4, es, ink),
    eye(spec.eye, dx + 13 * baseEyeScale, dy - 4, es, ink),
    mouth(spec.mouth, dx, dy + 12, ms, ink),
  ];
  if (spec.blush) {
    parts.unshift(
      `<ellipse cx="${dx - 19 * baseEyeScale}" cy="${dy + 8}" rx="6" ry="3.2" fill="${ink}" opacity="0.2"/>`,
      `<ellipse cx="${dx + 19 * baseEyeScale}" cy="${dy + 8}" rx="6" ry="3.2" fill="${ink}" opacity="0.2"/>`,
    );
  }
  return parts.join('');
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
  const dark = shade(bodyHex, style === 'flat' ? -0.1 : -0.38);
  const light = shade(bodyHex, 0.45);

  // Each style contributes its own paint and its own decorations; the layers
  // under the face and over the silhouette stay identical for all three.
  let defs = '';
  let behind = '';
  let shell = '';
  let over = '';

  if (options.outline) {
    shell = `<path d="${body.path}" fill="none" stroke="${bodyHex}" stroke-width="2.4"/>`;
  } else if (style === 'sticker') {
    shell = `<path d="${body.path}" fill="${bodyHex}" stroke="${dark}" stroke-width="3.2" stroke-linejoin="round"/>`;
    over += `<ellipse cx="${body.face.x - 13}" cy="${body.face.y - 15}" rx="7" ry="4.4" fill="#FFFFFF" opacity="0.22" transform="rotate(-28 ${body.face.x - 13} ${body.face.y - 15})"/>`;
    over += spark(78, 22, 4.6, '#FFFFFF', 0.55) + spark(22, 74, 3.2, '#FFFFFF', 0.35);
  } else if (style === 'glow') {
    defs = `<defs><radialGradient id="g${bodyId}" cx="38%" cy="32%" r="78%"><stop offset="0" stop-color="${shade(bodyHex, 0.32)}"/><stop offset="0.62" stop-color="${bodyHex}"/><stop offset="1" stop-color="${shade(bodyHex, -0.22)}"/></radialGradient></defs>`;
    // The halo follows the silhouette, not a circle: a star inside a round
    // halo reads as two objects stacked, not as one glowing character.
    behind = `<path d="${body.path}" fill="none" stroke="${bodyHex}" stroke-width="7" opacity="0.16" transform="translate(50 50) scale(1.1) translate(-50 -50)"/>`;
    shell = `<path d="${body.path}" fill="url(#g${bodyId})" stroke="${light}" stroke-width="2" stroke-linejoin="round"/>`;
    over += spark(76, 26, 3.6, light, 0.7);
  } else {
    shell = `<path d="${body.path}" fill="${bodyHex}"/>`;
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="emoji-bot">`,
    defs,
    behind,
    shell,
    renderTraits(surfaces, { ink, fill: bodyHex, body }),
    renderFace(options.state, body.face, ink, body.eyeScale ?? 1),
    renderTraits(head, { ink, fill: bodyHex, body }),
    over,
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
  });
}

export function renderDataUrl(options: RenderOptions): string {
  return `data:image/svg+xml,${encodeURIComponent(renderCharacter(options))}`;
}
