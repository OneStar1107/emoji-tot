import { type RenderStyle } from './render.js';
import { type PolygonPoint } from './motion/index.js';
export type CharacterMotionAction = 'spin' | 'bounce' | 'burst' | 'tilt' | 'wobble' | 'pulse' | 'float';
export interface CharacterRuntimeSnapshot {
    state: string;
    previous: string;
    eye: string;
    energy: number;
    rotation: number;
    lift: number;
    scaleY: number;
    paused: boolean;
    reducedMotion: boolean;
    transitionReason: string;
}
export interface CharacterRuntimeOptions {
    cast?: string;
    body?: string;
    shape?: string;
    color?: string;
    traits?: string[];
    state?: string;
    size?: number;
    style?: RenderStyle;
    followPointer?: boolean;
    paused?: boolean;
    reducedMotion?: boolean;
    onTelemetry?: (snapshot: CharacterRuntimeSnapshot) => void;
}
export interface CharacterRuntime {
    readonly root: HTMLElement;
    setState(state: string, reason?: string): void;
    setPaused(paused: boolean): void;
    setFollowPointer(follow: boolean): void;
    setPointer(x: number, y: number): void;
    pulse(action: CharacterMotionAction): void;
    snapshot(): CharacterRuntimeSnapshot;
    destroy(): void;
}
/**
 * Mount a live Tot into an existing host element.
 *
 * The returned object owns one RAF, a small collection of SVG nodes and one
 * pointer listener. `destroy()` is mandatory when a route or card unmounts.
 */
export declare function createCharacterRuntime(root: HTMLElement, input?: CharacterRuntimeOptions): CharacterRuntime;
/** A tiny path helper useful to hosts drawing their own eye legend. */
export declare function runtimeSparkPath(points: readonly PolygonPoint[]): string;
