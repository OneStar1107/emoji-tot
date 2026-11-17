/**
 * The silhouettes.
 *
 * Every shape is a closed path drawn inside a 100×100 box and centred on
 * (50, 50), so one set of face coordinates works on all of them. These are
 * hand-drawn arcs, not generated blobs: a shape is a small piece of design, and
 * a generator would give every one of them the same personality.
 */
export interface ShapeSpec {
  id: string;
  /** Closed path in the 100×100 box. */
  body: string;
  /** Where the face sits, in the same box. */
  face: { x: number; y: number };
  /** Some shapes need a touch more room for the eyes. */
  eyeScale?: number;
}

const round = (r: number, cx = 50, cy = 50) =>
  `M${cx - r} ${cy} A${r} ${r} 0 1 1 ${cx + r} ${cy} A${r} ${r} 0 1 1 ${cx - r} ${cy} Z`;

export const SHAPES: readonly ShapeSpec[] = [
  {
    id: 'circle',
    body: round(40),
    face: { x: 50, y: 52 },
  },
  {
    id: 'egg',
    body: 'M50 10C70 10 84 30 84 54C84 76 69 90 50 90C31 90 16 76 16 54C16 30 30 10 50 10Z',
    face: { x: 50, y: 54 },
  },
  {
    id: 'squircle',
    body: 'M50 12C78 12 92 26 92 50C92 74 78 88 50 88C22 88 8 74 8 50C8 26 22 12 50 12Z',
    face: { x: 50, y: 52 },
  },
  {
    id: 'star',
    body: 'M50 8L61 36L91 38L68 57L76 87L50 70L24 87L32 57L9 38L39 36Z',
    face: { x: 50, y: 54 },
    eyeScale: 0.92,
  },
  {
    id: 'heart',
    body: 'M50 88C20 66 10 50 10 36C10 22 21 12 33 12C41 12 47 17 50 23C53 17 59 12 67 12C79 12 90 22 90 36C90 50 80 66 50 88Z',
    face: { x: 50, y: 46 },
  },
  {
    id: 'cloud',
    body: 'M26 70C14 70 8 61 8 51C8 42 15 35 24 34C26 22 36 14 48 14C60 14 70 22 72 33C82 34 90 41 90 51C90 62 82 70 72 70Z',
    face: { x: 48, y: 48 },
  },
  {
    id: 'ghost',
    body: 'M18 84V46C18 28 32 14 50 14C68 14 82 28 82 46V84L70 76L58 84L46 76L34 84Z',
    face: { x: 50, y: 48 },
  },
  {
    id: 'tot',
    body: 'M28 34H72C78 34 82 38 82 44V74C82 80 78 84 72 84H28C22 84 18 80 18 74V44C18 38 22 34 28 34Z',
    face: { x: 50, y: 60 },
    eyeScale: 0.95,
  },
];

const BY_ID = new Map(SHAPES.map((s) => [s.id, s]));

export const SHAPE_IDS: readonly string[] = SHAPES.map((s) => s.id);

export function getShape(id: string): ShapeSpec {
  const shape = BY_ID.get(id);
  if (!shape) throw new Error(`Unknown shape "${id}". Known shapes: ${SHAPE_IDS.join(', ')}`);
  return shape;
}

/** A silhouette as a standalone SVG path, for a picker that shows shapes as pictures. */
export function shapePreview(id: string, fill = '#1F1F1F'): string {
  const shape = getShape(id);
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="${shape.body}" fill="${fill}"/></svg>`;
}
