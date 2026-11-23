/** The observable state transitions a live character has made. */
export interface StateTransition {
    state: string;
    previous: string;
    at: number;
    reason: string;
}
export interface StateMachineSnapshot {
    state: string;
    previous: string;
    changedAt: number;
    history: readonly StateTransition[];
}
export interface CharacterStateMachine {
    transition(state: string, reason: string, at?: number): boolean;
    reset(state: string, at?: number): void;
    snapshot(): StateMachineSnapshot;
}
/**
 * A deliberately small state machine.
 *
 * It does not decide which emotion should win — the protocol arbiter already
 * owns that. It records the transition and gives the renderer one place to
 * reset eye morphs, blink cadence and one-shot animation phase.
 */
export declare function createCharacterStateMachine(initial?: string): CharacterStateMachine;
