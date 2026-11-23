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

const HISTORY_LIMIT = 12;

/**
 * A deliberately small state machine.
 *
 * It does not decide which emotion should win — the protocol arbiter already
 * owns that. It records the transition and gives the renderer one place to
 * reset eye morphs, blink cadence and one-shot animation phase.
 */
export function createCharacterStateMachine(initial = 'idle'): CharacterStateMachine {
  let state = initial;
  let previous = initial;
  let changedAt = 0;
  let history: StateTransition[] = [];

  function transition(next: string, reason: string, at = 0): boolean {
    if (!next || next === state) return false;
    previous = state;
    state = next;
    changedAt = at;
    history = [...history, { state: next, previous, at, reason }].slice(-HISTORY_LIMIT);
    return true;
  }

  return {
    transition,
    reset(next, at = 0): void {
      if (next === state) {
        changedAt = at;
        return;
      }
      transition(next, 'reset', at);
    },
    snapshot(): StateMachineSnapshot {
      return {
        state,
        previous,
        changedAt,
        history: history.map((entry) => ({ ...entry })),
      };
    },
  };
}
