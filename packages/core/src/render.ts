/**
 * Draw one character as SVG.
 *
 * Deliberately a pure function of its options: no DOM, no clock, no globals.
 * That is what lets the same code serve a browser, a static export and a
 * test, and it is the reason a still image can be asserted byte for byte.
 */
import { colorHex } from './palette.js';
import { faceFor, type EyeStyle, type MouthStyle } from './face.js';
import { getShape } from './shapes.js';

export interface RenderOptions {
  shape: string;
  color: string;
  state: string;
  size: number;
  /** Outline the body instead of filling it. */
  outline?: boolean;
}

const DARK_INK = '#1F1F1F';
const LIGHT_INK = '#FFFFFF';

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

function eye(style: EyeStyle, x: number, y: number, scale: number, ink: string): string {
  const s = scale;
  switch (style) {
    case 'dot':
      return `<circle cx="${x}" cy="${y}" r="${4.4 * s}" fill="${ink}"/>`;
    case 'wide':
      return `<circle cx="${x}" cy="${y}" r="${5.6 * s}" fill="${ink}"/>`;
    case 'arc':
      // An upward arc: the "closed happy eye" every cartoon uses.
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

function mouth(style: MouthStyle, x: number, y: number, ink: string): string {
  switch (style) {
    case 'smile':
      return `<path d="M${x - 6} ${y} Q${x} ${y + 6} ${x + 6} ${y}" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`;
    case 'grin':
      return `<path d="M${x - 8} ${y - 1} Q${x} ${y + 9} ${x + 8} ${y - 1} Z" fill="${ink}"/>`;
    case 'open':
      return `<ellipse cx="${x}" cy="${y + 2}" rx="4" ry="5" fill="${ink}"/>`;
    case 'flat':
      return `<path d="M${x - 5} ${y + 1} L${x + 5} ${y + 1}" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`;
    case 'wave':
      return `<path d="M${x - 6} ${y + 1} Q${x - 3} ${y - 3} ${x} ${y + 1} Q${x + 3} ${y + 5} ${x + 6} ${y + 1}" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>`;
    case 'o':
      return `<circle cx="${x}" cy="${y + 1}" r="2.8" fill="none" stroke="${ink}" stroke-width="2.2"/>`;
    case 'tiny':
      return `<path d="M${x - 2.6} ${y} Q${x} ${y + 3} ${x + 2.6} ${y}" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>`;
    default:
      return '';
  }
}

/** Render a character to an SVG string. */
export function renderCharacter(options: RenderOptions): string {
  const shape = getShape(options.shape);
  const face = faceFor(options.state);
  const colour = colorHex(options.color);
  const scale = (shape.eyeScale ?? 1) * 1;
  const { x, y } = shape.face;
  const eyeGap = 9.5 * scale;

  const body = options.outline
    ? `<path d="${shape.body}" fill="none" stroke="${colour}" stroke-width="3.4" stroke-linejoin="round"/>`
    : `<path d="${shape.body}" fill="${colour}"/>`;

  const blush = face.blush
    ? `<ellipse cx="${x - 14}" cy="${y + 10}" rx="4.2" ry="2.6" fill="#F7A8C0" opacity="0.85"/>`
      + `<ellipse cx="${x + 14}" cy="${y + 10}" rx="4.2" ry="2.6" fill="#F7A8C0" opacity="0.85"/>`
    : '';

  const ink = inkFor(colour);
  const eyes = eye(face.eye, x - eyeGap, y, scale, ink) + eye(face.eye, x + eyeGap, y, scale, ink);
  const mouthPath = mouth(face.mouth, x, y + 12, ink);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${options.size}" height="${options.size}" role="img">${body}${blush}${eyes}${mouthPath}</svg>`;
}

/** A data URL, for an <img> or a CSS background. */
export function renderDataUrl(options: RenderOptions): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(renderCharacter(options))}`;
}