/**
 * @emojibot/core — a small procedural character engine.
 *
 * Written for this project, MIT licensed, no dependency on any upstream
 * engine: shapes are hand-drawn paths, faces are a vocabulary of eyes and
 * mouths, and rendering is a pure function that returns SVG.
 */
export { SHAPES, SHAPE_IDS, getShape, shapePreview } from './shapes.js';
export { FACES, FACE_IDS, faceFor } from './face.js';
export { COLORS, COLOR_IDS, colorHex } from './palette.js';
export { renderCharacter, renderDataUrl, inkFor } from './render.js';
/*
 * The custom element lives at `@emojibot/core/element`, not here: it extends
 * HTMLElement, so importing it from Node (tests, static export) would throw
 * before a single function ran. Keeping it on its own entry means the engine
 * stays usable everywhere and the element only loads where there is a DOM.
 */
