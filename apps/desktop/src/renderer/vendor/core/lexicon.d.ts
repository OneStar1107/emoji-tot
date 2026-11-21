/**
 * The expression lexicon: thirty-three named states, one per face.
 *
 * The names and the life / emotion / agent split are borrowed from the
 * mood-mates reference wall (Sleeping … Powering off). Nothing else is: every
 * body here is drawn from this engine's own primitives, and the ids are the
 * same two-digit protocol ids `packages/protocol` already speaks, so a host
 * can address a state by id, by English name or by its cast id.
 *
 * Two of the reference ids (08, 09) are unused on the wall — the numbering
 * leaves holes for extension. This project already fills 08 with the spawn
 * state, so the lexicon includes it and stops at thirty-three; 09 (dragging)
 * is an interaction, not an expression, and is not part of the list.
 *
 * This table is deliberately data-only: `FACE_META` owns the drawing and the
 * Chinese one-liner, and a test walks this list and fails on any id that has
 * no face, so the two can never drift.
 */
export interface LexiconEntry {
    /** Two-digit protocol id, the same shape an agent emits. */
    id: string;
    en: string;
    zh: string;
    group: 'life' | 'emotion' | 'agent';
    /** The cast state this entry draws with; must exist in FACES. */
    state: string;
    /** Fills a numbering hole rather than appearing on the reference wall. */
    extra?: boolean;
}
export declare const LEXICON: readonly LexiconEntry[];
/** One entry by protocol id; null for anything not in the lexicon. */
export declare function lexiconEntry(id: string): LexiconEntry | null;
