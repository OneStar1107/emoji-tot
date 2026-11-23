export { createSpring, stepSpring, springProgress } from './spring.js';
export type { SpringState } from './spring.js';
export {
  EYE_POLYGONS,
  EYE_VERTEX_COUNT,
  eyePolygonsFor,
  morphPolygon,
  polygonPath,
} from './eyes.js';
export type { EyePolygon, PolygonPoint } from './eyes.js';
export { createCharacterStateMachine } from './state-machine.js';
export type {
  CharacterStateMachine,
  StateMachineSnapshot,
  StateTransition,
} from './state-machine.js';
export { motionProfile } from './profiles.js';
export type { GazeMode, MotionProfile } from './profiles.js';
