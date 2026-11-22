/**
 * The one place a state becomes a word.
 *
 * Three views label the same 61 states: the wall's expression tab, the
 * console's face strip, and the drawer's quick picks. Each used to look the
 * name up in the protocol's 51-entry emotion table and fall back to the raw
 * state id, so the ten states the engine draws but the protocol does not
 * number (drowsy, bored, powering-down, proud, sad, suspicious, scared,
 * working, composing, alerting) printed in English on a Chinese page.
 *
 * Order matters: the protocol owns the public vocabulary for the 51 states it
 * numbers, and `@emojitot/core`'s FACE_META owns the Chinese names for all 61.
 * Read the protocol first so the wall, the docs table and the console keep
 * saying the same word for a state that has a two-digit id; the engine-only
 * ten fall through to FACE_META. Anything in neither still gets a readable
 * word instead of `powering-down`.
 */
import { faceMeta } from '@emojitot/core';
import { EMOTIONS } from '@emojitot/protocol';
import { getLang } from './i18n';

/** English for an id neither table names: `powering-down` → `Powering down`. */
function englishFallback(state: string): string {
  const words = state.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The state's name in the current language. Never returns an empty label. */
export function faceLabel(state: string): string {
  const emotion = EMOTIONS.find((item) => item.state === state);
  if (emotion) return getLang() === 'zh' ? emotion.name.zh : emotion.name.en;
  // FACE_META is Chinese-only: read it on the Chinese page, and give the
  // English page a readable name instead of switching a label's language.
  const meta = faceMeta(state);
  if (getLang() === 'zh' && meta.name !== state) return meta.name;
  return englishFallback(state);
}

/**
 * The protocol id, or an empty string for a state the protocol does not name.
 *
 * The ten engine-only states have no two-digit id, and printing a bare `#`
 * for them was worse than printing nothing: callers show the id only when
 * this returns something.
 */
export function faceId(state: string): string {
  const emotion = EMOTIONS.find((item) => item.state === state);
  return emotion ? emotion.id : '';
}
