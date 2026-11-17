/** One upward cherry-blossom petal, notched at the tip, drawn from the centre. */
const PETAL_NOTCHED = 'M50 50C40 44 32 30 34 21C35.5 13.5 43 12 46.5 19L50 25L53.5 19C57 12 64.5 13.5 66 21C68 30 60 44 50 50Z';
/** One upward clover leaf: a heart with its point at the centre. */
const LEAF_HEART = 'M50 50C40 43 32 29 34 20C35.5 12.5 43.5 11.5 47 19L50 25L53 19C56.5 11.5 64.5 12.5 66 20C68 29 60 43 50 50Z';
export const BODIES = [
    // A circle, still the default: nothing to misread.
    {
        id: 'circle', family: 'round', height: 0.8,
        path: 'M50 10C72 10 90 28 90 50C90 72 72 90 50 90C28 90 10 72 10 50C10 28 28 10 50 10Z',
        face: { x: 50, y: 52 },
    },
    // An egg: narrow crown, heavy base.
    {
        id: 'egg', family: 'round', height: 0.82,
        path: 'M50 10C61 10 72 26 72 47C72 72 63 90 50 90C37 90 28 72 28 47C28 26 39 10 50 10Z',
        face: { x: 50, y: 54 },
    },
    // A squircle: square shoulders, round corners.
    {
        id: 'squircle', family: 'square', height: 0.84,
        path: 'M34 12H66Q88 12 88 34V66Q88 88 66 88H34Q12 88 12 66V34Q12 12 34 12Z',
        face: { x: 50, y: 52 },
    },
    // A soft blob, deliberately asymmetric.
    {
        id: 'blob', family: 'round', height: 0.8,
        // A jelly: wide round body with one small nub on the crown.
        path: 'M50 22C53 22 54.6 24.6 53.8 27.6C65 31 82 44 82 60C82 77 68 89 50 89C32 89 18 77 18 60C18 44 35 31 46.2 27.6C45.4 24.6 47 22 50 22Z',
        face: { x: 50, y: 54 },
    },
    // A pear: narrow at the stem, a real waist, wide hips, plus stem and leaf.
    {
        id: 'pear', family: 'garden', height: 0.88, pointed: 0.3,
        path: 'M50 20C58 20 63 27 60 35C56 45 74 50 80 63C86 78 73 89 55 89C47 89 43 90 37 88C20 82 14 68 22 55C28 45 44 42 42 34C39 25 42 20 50 20Z',
        face: { x: 50, y: 66 },
        parts: [
            { d: 'M50 21C50 15 51 10 54 7', tone: 'shade', behind: true },
            { d: 'M53 12C58 5 68 4 72 9C67 14 58 15 53 12Z', tone: 'shade', behind: true },
        ],
    },
    // A raindrop: a real point on top, a round bottom.
    {
        id: 'drop', family: 'round', height: 0.9, pointed: 0.6,
        path: 'M50 10C56 24 78 40 78 58C78 76 65 88 50 88C35 88 22 76 22 58C22 40 44 24 50 10Z',
        face: { x: 50, y: 60 },
    },
    // A five-point star with real corners.
    {
        id: 'star', family: 'poly', height: 0.88, pointed: 0.9, round: 11,
        // Sampled inside 42 so the renderer's round join can fatten it back out.
        path: 'M50 12L59.7 36.7L86.1 38.3L65.7 55.1L72.3 80.7L50 66.5L27.7 80.7L34.3 55.1L13.9 38.3L40.3 36.7Z',
        face: { x: 50, y: 52 }, eyeScale: 0.92,
    },
    // A gem: a flat table on top, one point at the bottom.
    {
        id: 'gem', family: 'poly', height: 0.86, pointed: 0.7,
        path: 'M50 8L86 34L50 92L14 34Z',
        face: { x: 50, y: 52 },
    },
    // A loaf: a domed top, a flat base.
    {
        id: 'pill', family: 'square', height: 0.74,
        path: 'M14 46C14 24 30 14 50 14C70 14 86 24 86 46L86 76C86 84 82 88 74 88H26C18 88 14 84 14 76Z',
        face: { x: 50, y: 56 },
    },
    // A cherry blossom: five petals, each with a notch at its tip.
    {
        id: 'flower', family: 'flora', height: 0.92,
        // A cherry blossom: five separate petals, each with the little notch at its
        // tip that separates a blossom from a daisy, around a round core big enough
        // for a face. Petals are rotated copies of one hand-written path.
        path: 'M50 50m-12 0a12 12 0 1 0 24 0a12 12 0 1 0 -24 0Z',
        parts: [
            { d: PETAL_NOTCHED, rotate: 0 },
            { d: PETAL_NOTCHED, rotate: 72 },
            { d: PETAL_NOTCHED, rotate: 144 },
            { d: PETAL_NOTCHED, rotate: 216 },
            { d: PETAL_NOTCHED, rotate: 288 },
        ],
        face: { x: 50, y: 52 }, eyeScale: 0.52,
    },
    // A four-leaf clover: four heart-shaped leaves and a stem.
    {
        id: 'clover', family: 'flora', height: 0.9,
        // A four-leaf clover: four heart-shaped leaves, a stem, and a small round
        // heart in the middle for the face.
        path: 'M50 50m-11 0a11 11 0 1 0 22 0a11 11 0 1 0 -22 0Z',
        parts: [
            { d: LEAF_HEART, rotate: 0 },
            { d: LEAF_HEART, rotate: 90 },
            { d: LEAF_HEART, rotate: 180 },
            { d: LEAF_HEART, rotate: 270 },
        ],
        face: { x: 50, y: 52 }, eyeScale: 0.5,
    },
    // A cloud: three bumps on top, a flat-ish base.
    {
        id: 'cloud', family: 'flora', height: 0.76,
        path: 'M24 70C12 70 8 55 19 48C15 35 30 26 41 32C46 18 66 18 71 32C83 27 93 38 88 49C98 55 93 70 80 70Z',
        face: { x: 50, y: 54 },
    },
    // A heart: two lobes, one point.
    {
        id: 'heart', family: 'form', height: 0.86,
        path: 'M50 86C18 64 10 44 28 31C38 24 48 31 50 40C52 31 62 24 72 31C90 44 82 64 50 86Z',
        face: { x: 50, y: 46 },
    },
    // A ghost: a round hood and three tattered points.
    {
        id: 'ghost', family: 'form', height: 0.88,
        path: 'M18 88V48C18 28 32 12 50 12C68 12 82 28 82 48V88L70 79L58 88L46 79L34 88Z',
        face: { x: 50, y: 46 },
    },
    // A tot: rounded body, an antenna, a screen-like face.
    {
        id: 'tot', family: 'object', height: 0.86,
        path: 'M34 30H66Q84 30 84 46V70Q84 86 66 86H34Q16 86 16 70V46Q16 30 34 30Z',
        face: { x: 50, y: 58 },
        parts: [
            { d: 'M50 30V18', tone: 'shade', behind: true },
            { d: 'M50 18a5 5 0 1 0 0.1 0Z', tone: 'shade', behind: true },
        ],
    },
];
/** Display names. The engine never needs them; every picker does. */
export const BODY_ZH = {
    circle: '圆', egg: '蛋', squircle: '方圆', blob: '软圆', pear: '梨', drop: '水滴',
    star: '星', gem: '宝石', pill: '面包', flower: '花', clover: '四叶', cloud: '云',
    heart: '心', ghost: '幽灵', tot: '机器人',
};
const BY_ID = new Map(BODIES.map((b) => [b.id, b]));
export const BODY_IDS = BODIES.map((b) => b.id);
export function getBody(id) {
    const body = BY_ID.get(id);
    if (!body)
        throw new Error(`Unknown body "${id}". Known bodies: ${BODY_IDS.join(', ')}`);
    return body;
}
export function bodyPreview(id, fill = '#1F1F1F') {
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="${getBody(id).path}" fill="${fill}"/></svg>`;
}
