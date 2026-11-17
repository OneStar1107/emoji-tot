/**
 * @emojibot/core — a small procedural character engine.
 *
 * Written for this project, MIT licensed, no dependency on any upstream
 * engine: shapes are hand-drawn paths, faces are a vocabulary of eyes and
 * mouths, and rendering is a pure function that returns SVG.
 */
export { SHAPES, SHAPE_IDS, getShape, shapePreview } from './shapes.js';
export type { ShapeSpec } from './shapes.js';
export { FACES, FACE_IDS, faceFor } from './face.js';
export type { FaceSpec, EyeStyle, MouthStyle } from './face.js';
export { COLORS, COLOR_IDS, colorHex } from './palette.js';
export { renderCharacter, renderDataUrl, inkFor } from './render.js';
export type { RenderOptions } from './render.js';
