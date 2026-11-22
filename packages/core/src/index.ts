/**
 * @emojitot/core — a compositional character engine.
 *
 * Written for this project, MIT licensed, no dependency on any upstream
 * engine. A character is a genome: a body from a family of formulas, a colour,
 * and any number of traits that anchor themselves to the body they sit on.
 * Rendering is a pure function that returns SVG, so the same code serves a
 * browser, a static export and a test.
 */
export { BODIES, BODY_IDS, BODY_ZH, getBody, bodyPreview } from './body.js';
export type { BodySpec, BodyPart } from './body.js';
export { TRAITS, TRAIT_IDS, TRAIT_ZH, EAR_IDS, TOP_IDS, SIDE_IDS, SURFACE_IDS, PAIRED, renderTraits } from './traits.js';
export type { TraitFn, TraitContext } from './traits.js';
export { CAST, CAST_IDS, FAMILIES, MOTIONS, MOTION_ZH, DEFAULT_CAST, castMember, castByFamily, breed } from './cast.js';
export type { CastMember, Motion } from './cast.js';
export { FACES, FACE_IDS, faceFor, FACE_META, faceMeta, facesInGroup } from './face.js';
export type { FaceMeta, FaceGroup, FaceSpec, EyeStyle, MouthStyle, BrowStyle } from './face.js';
export { LEXICON, lexiconEntry } from './lexicon.js';
export type { LexiconEntry } from './lexicon.js';
export { COLORS, COLOR_IDS, COLOR_ZH, colorHex } from './palette.js';
export { renderCharacter, renderCast, renderFace, renderDataUrl, inkFor } from './render.js';
export type { RenderOptions, RenderStyle, CastRenderOptions, MotionMode } from './render.js';

/* The old hand-drawn shapes remain exported for stored preferences. */
export { SHAPES, SHAPE_IDS, getShape, shapePreview } from './shapes.js';
export type { ShapeSpec } from './shapes.js';

/*
 * The custom element lives at `@emojitot/core/element`, not here: it extends
 * HTMLElement, so importing it from Node (tests, static export) would throw
 * before a single function ran. Keeping it on its own entry means the engine
 * stays usable everywhere and the element only loads where there is a DOM.
 */
