/**
 * Bodies, as formulas rather than drawings.
 *
 * A hand-drawn path gives one silhouette and locks it. A radial formula gives
 * a family: the same function with a different amplitude is a rounder ball, a
 * pear, or a star. Every body here is described by `r(t)` — the distance from
 * the centre at angle t — or by a short parametric curve, then sampled into a
 * path. That is what lets one file carry fourteen silhouettes that still read
 * as different characters, and what lets a host deform any of them later.
 *
 * All bodies live in the same 100×100 box and are centred on (50, 50), so one
 * set of face coordinates works on all of them.
 */
export interface BodySpec {
  id: string;
  family: string;
  /** The closed outline in the 100×100 box. */
  path: string;
  /** Where the face sits. */
  face: { x: number; y: number };
  eyeScale?: number;
  /** Rough silhouette height as a fraction of the box, used to place traits. */
  height: number;
  /** How pointy the top is (0 round, 1 spiked), used by ear anchoring. */
  pointed?: number;
}

export type RadialFn = (t: number) => number;

const TAU = Math.PI * 2;

/** Sample a radial function into a closed polygon path. */
function radial(fn: RadialFn, steps = 96, cx = 50, cy = 50): string {
  const pts: string[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * TAU;
    const r = fn(t);
    pts.push(`${(cx + Math.cos(t) * r).toFixed(2)} ${(cy + Math.sin(t) * r).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

/** |cos|^n + |sin|^n superellipse, the family behind circles, squircles and gems. */
const superellipse = (n: number, radius = 40): RadialFn => (t) =>
  radius / Math.pow(Math.pow(Math.abs(Math.cos(t)), n) + Math.pow(Math.abs(Math.sin(t)), n), 1 / n);

/** A cone-ish top: narrow at the top, wide at the base. */
const pearShape = (radius = 40, waist = 0.24): RadialFn => (t) =>
  radius * (1 - waist * Math.cos(t) + 0.08 * Math.cos(2 * t));

/** n petals, softly. */
const petalShape = (n: number, radius = 40, depth = 0.26): RadialFn => (t) =>
  radius * (1 - depth * Math.abs(Math.cos((n * t) / 2)));

/** n sharp points. */
const starShape = (n: number, radius = 40, inner = 0.56): RadialFn => (t) => {
  const p = ((t + Math.PI / 2) / TAU) * n;
  const f = Math.abs((p % 1) - 0.5) * 2;
  return radius * (inner + (1 - inner) * f);
};

/** The classic teardrop: pointed at the top, round at the bottom. */
const dropShape = (radius = 40): RadialFn => (t) => {
  const c = Math.cos(t);
  return radius * (1 - 0.42 * c * c * c) * (1 + 0.06 * Math.max(0, -c));
};

export const BODIES: readonly BodySpec[] = [
  { id: 'circle', family: 'round', path: radial(() => 40), face: { x: 50, y: 52 }, height: 0.8 },
  { id: 'egg', family: 'round', path: radial(pearShape(38, 0.12)), face: { x: 50, y: 54 }, height: 0.82 },
  { id: 'squircle', family: 'square', path: radial(superellipse(3.4, 42)), face: { x: 50, y: 52 }, height: 0.84 },
  { id: 'blob', family: 'round', path: radial((t) => 40 * (1 + 0.07 * Math.sin(3 * t + 0.7) + 0.04 * Math.cos(5 * t + 1.9))), face: { x: 50, y: 52 }, height: 0.8 },
  { id: 'pear', family: 'garden', path: radial(pearShape(40, 0.26)), face: { x: 50, y: 58 }, height: 0.88 },
  { id: 'drop', family: 'round', path: radial(dropShape(40)), face: { x: 50, y: 58 }, height: 0.9, pointed: 0.6 },
  { id: 'star', family: 'poly', path: radial(starShape(5, 44, 0.54)), face: { x: 50, y: 54 }, eyeScale: 0.92, height: 0.88, pointed: 0.7 },
  { id: 'gem', family: 'poly', path: radial(superellipse(1.15, 42)), face: { x: 50, y: 54 }, height: 0.84, pointed: 0.8 },
  { id: 'pill', family: 'square', path: radial((t) => 40 * Math.sqrt(1 - 0.28 * Math.sin(t) ** 2)), face: { x: 50, y: 52 }, height: 0.72 },
  { id: 'flower', family: 'flora', path: radial(petalShape(5, 42, 0.24)), face: { x: 50, y: 52 }, height: 0.84 },
  { id: 'clover', family: 'flora', path: radial(petalShape(4, 40, 0.3)), face: { x: 50, y: 52 }, height: 0.8 },
  { id: 'cloud', family: 'flora', path: radial((t) => 40 * (0.86 + 0.14 * Math.cos(4 * t)) + 4 * Math.max(0, Math.cos(t)) ** 2), face: { x: 50, y: 50 }, height: 0.78 },
  { id: 'heart', family: 'form', path: (() => {
    const pts: string[] = [];
    for (let i = 0; i < 96; i++) {
      const t = (i / 96) * TAU;
      const x = 16 * Math.sin(t) ** 3;
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      pts.push(`${(50 + x * 2.2).toFixed(2)} ${(48 + y * 2.0).toFixed(2)}`);
    }
    return `M${pts.join('L')}Z`;
  })(), face: { x: 50, y: 46 }, height: 0.86 },
  { id: 'ghost', family: 'form', path: (() => {
    const pts: string[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = Math.PI + (i / 40) * Math.PI;
      pts.push(`${(50 + Math.cos(a) * 34).toFixed(2)} ${(40 + Math.sin(a) * 30).toFixed(2)}`);
    }
    for (let i = 0; i <= 5; i++) {
      const x = 84 - i * (68 / 5);
      const y = 70 + (i % 2 === 0 ? 18 : 8);
      pts.push(`${x.toFixed(2)} ${Math.min(88, y).toFixed(2)}`);
    }
    return `M${pts.join('L')}Z`;
  })(), face: { x: 50, y: 48 }, height: 0.88 },
  { id: 'bot', family: 'object', path: (() => {
    const r = 8, x = 12, y = 26, w = 76, h = 60;
    return `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;
  })(), face: { x: 50, y: 62 }, eyeScale: 0.95, height: 0.86 },
];

const BY_ID = new Map(BODIES.map((b) => [b.id, b]));

export const BODY_IDS: readonly string[] = BODIES.map((b) => b.id);

export function getBody(id: string): BodySpec {
  const body = BY_ID.get(id);
  if (!body) throw new Error(`Unknown body "${id}". Known bodies: ${BODY_IDS.join(', ')}`);
  return body;
}

export function bodyPreview(id: string, fill = '#1F1F1F'): string {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="${getBody(id).path}" fill="${fill}"/></svg>`;
}
