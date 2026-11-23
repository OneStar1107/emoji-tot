const HISTORY_LIMIT = 12;
/**
 * A deliberately small state machine.
 *
 * It does not decide which emotion should win — the protocol arbiter already
 * owns that. It records the transition and gives the renderer one place to
 * reset eye morphs, blink cadence and one-shot animation phase.
 */
export function createCharacterStateMachine(initial = 'idle') {
    let state = initial;
    let previous = initial;
    let changedAt = 0;
    let history = [];
    function transition(next, reason, at = 0) {
        if (!next || next === state)
            return false;
        previous = state;
        state = next;
        changedAt = at;
        history = [...history, { state: next, previous, at, reason }].slice(-HISTORY_LIMIT);
        return true;
    }
    return {
        transition,
        reset(next, at = 0) {
            if (next === state) {
                changedAt = at;
                return;
            }
            transition(next, 'reset', at);
        },
        snapshot() {
            return {
                state,
                previous,
                changedAt,
                history: history.map((entry) => ({ ...entry })),
            };
        },
    };
}
