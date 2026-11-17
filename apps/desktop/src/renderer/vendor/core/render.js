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
import { faceFor } from './face.js';
import { getBody } from './body.js';
import { renderTraits, TRAITS } from './traits.js';
import { castMember } from './cast.js';
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
export function inkFor(bodyHex) {
    const hex = bodyHex.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.55 ? LIGHT_INK : DARK_INK;
}
function eye(style, x, y, scale, ink) {
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
function mouth(style, x, y, scale, ink) {
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
export function renderFace(state, face, ink, baseEyeScale = 1) {
    const spec = faceFor(state);
    const dx = face.x + (spec.dx ?? 0);
    const dy = face.y + (spec.dy ?? 0);
    const es = baseEyeScale * (spec.eyeScale ?? 1);
    const ms = baseEyeScale * (spec.mouthScale ?? 1);
    const parts = [
        eye(spec.eye, dx - 13 * baseEyeScale, dy - 4, es, ink),
        eye(spec.eye, dx + 13 * baseEyeScale, dy - 4, es, ink),
        mouth(spec.mouth, dx, dy + 12, ms, ink),
    ];
    if (spec.blush) {
        parts.unshift(`<ellipse cx="${dx - 19 * baseEyeScale}" cy="${dy + 8}" rx="6" ry="3.2" fill="${ink}" opacity="0.2"/>`, `<ellipse cx="${dx + 19 * baseEyeScale}" cy="${dy + 8}" rx="6" ry="3.2" fill="${ink}" opacity="0.2"/>`);
    }
    return parts.join('');
}
/** One character, as a standalone SVG string. */
export function renderCharacter(options) {
    const bodyId = options.body ?? options.shape ?? 'circle';
    const body = getBody(bodyId);
    const bodyHex = colorHex(options.color);
    const ink = inkFor(bodyHex);
    const size = options.size;
    const traits = options.traits ?? [];
    const surfaces = traits.filter((t) => SURFACE_TRAITS.has(t) && TRAITS[t]);
    const head = traits.filter((t) => !SURFACE_TRAITS.has(t) && TRAITS[t]);
    const bodyFill = options.outline ? 'none' : bodyHex;
    const bodyStroke = options.outline ? ` stroke="${bodyHex}" stroke-width="2.4"` : '';
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="emoji-bot">`,
        options.outline ? '' : `<path d="${body.path}" fill="${bodyFill}"${bodyStroke}/>`,
        options.outline ? `<path d="${body.path}" fill="none" stroke="${bodyHex}" stroke-width="2.4"/>` : '',
        renderTraits(surfaces, { ink, fill: bodyHex, body }),
        renderFace(options.state, body.face, ink, body.eyeScale ?? 1),
        renderTraits(head, { ink, fill: bodyHex, body }),
        `</svg>`,
    ].join('');
}
/** Render a member of the cast by id. Unknown ids fall back to the first one. */
export function renderCast(options) {
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
    });
}
export function renderDataUrl(options) {
    return `data:image/svg+xml,${encodeURIComponent(renderCharacter(options))}`;
}
