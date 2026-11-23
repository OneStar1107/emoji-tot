/**
 * Polygon eyes for the live Tot runtime.
 *
 * Every topology has the same vertex count. That is the constraint that makes
 * a rapid expression change feel like one eye changing its mind, instead of a
 * glyph disappearing and another appearing.
 */
import { faceFor } from '../face.js';
export const EYE_VERTEX_COUNT = 16;
const round = (value) => Math.round(value * 10000) / 10000;
function radial(radius) {
    return Array.from({ length: EYE_VERTEX_COUNT }, (_, index) => {
        const angle = -Math.PI / 2 + (index / EYE_VERTEX_COUNT) * Math.PI * 2;
        const [x, y] = radius(angle);
        return [round(x), round(y)];
    });
}
function superellipse(rx, ry, power = 3.4) {
    return radial((angle) => {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const scale = (Math.abs(c) ** power + Math.abs(s) ** power) ** (-1 / power);
        return [c * rx * scale, s * ry * scale];
    });
}
function band(curve, thickness, start = -0.86, end = 0.86) {
    const half = EYE_VERTEX_COUNT / 2;
    const edge = Array.from({ length: half }, (_, index) => {
        const x = start + ((end - start) * index) / (half - 1);
        return { x, y: curve(x) };
    });
    return [
        ...edge.map(({ x, y }) => [round(x), round(y - thickness / 2)]),
        ...[...edge]
            .reverse()
            .map(({ x, y }) => [round(x), round(y + thickness / 2)]),
    ];
}
function heart() {
    return Array.from({ length: EYE_VERTEX_COUNT }, (_, index) => {
        const t = -Math.PI / 2 + (index / EYE_VERTEX_COUNT) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        return [round((x / 16) * 0.75), round((y / 18) * 0.9)];
    });
}
function star() {
    return radial((angle) => {
        const index = Math.round(((angle + Math.PI / 2) / (Math.PI * 2)) * EYE_VERTEX_COUNT);
        const r = index % 4 === 0 ? 0.98 : index % 2 === 0 ? 0.55 : 0.34;
        return [Math.cos(angle) * r * 0.8, Math.sin(angle) * r];
    });
}
export const EYE_POLYGONS = {
    dot: superellipse(0.55, 0.64, 2.1),
    wide: superellipse(0.7, 0.85, 2.05),
    pill: superellipse(0.47, 1.02, 4.8),
    heart: heart(),
    star: star(),
    squint: band((x) => 0.42 - 1.12 * x * x, 0.27),
    arc: band((x) => 0.3 - 0.72 * x * x, 0.3),
    closed: band((x) => -0.17 + 0.72 * x * x, 0.23),
    line: band(() => 0, 0.28),
    half: band((x) => -0.28 + 0.08 * x * x, 1.02, -0.74, 0.74),
};
export function morphPolygon(from, to, t) {
    if (from.length !== to.length) {
        throw new Error(`Cannot morph ${from.length}-point eye into ${to.length}-point eye.`);
    }
    const amount = Math.min(1, Math.max(0, t));
    return from.map(([x, y], index) => {
        const [tx, ty] = to[index];
        return [x + (tx - x) * amount, y + (ty - y) * amount];
    });
}
/** Two polygons for one face. The right eye carries any intentional asymmetry. */
export function eyePolygonsFor(state) {
    const spec = faceFor(state);
    const source = EYE_POLYGONS[spec.eye];
    const asym = spec.eyeAsym ?? 1;
    if (asym === 1)
        return [source, source];
    return [
        source,
        source.map(([x, y]) => [x * asym, y * asym]),
    ];
}
export function polygonPath(polygon) {
    if (!polygon.length)
        return '';
    return ('M' +
        polygon.map(([x, y]) => `${round(x)} ${round(y)}`).join('L') +
        'Z');
}
