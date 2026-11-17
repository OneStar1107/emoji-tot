/**
 * The character being edited, shared by every view.
 *
 * One genome: a body, a colour, a list of traits and a state. A cast member is
 * just a saved genome with a name, so selecting a member copies its genes into
 * the editor and editing any gene marks the character as custom — the name
 * stays as a starting point rather than a mode that locks the controls.
 */
import { castMember } from '@emojibot/core';

export type BackgroundId = 'plain' | 'grid' | 'dots' | 'night' | 'paper';

export interface Look {
  /** The member this genome started from, or '' once it is custom. */
  cast: string;
  body: string;
  color: string;
  traits: string[];
  state: string;
  background: BackgroundId;
}

const seed = castMember('tuan')!;

const DEFAULTS: Look = {
  cast: 'tuan',
  body: seed.body,
  color: seed.color,
  traits: [...seed.traits],
  state: 'idle',
  background: 'plain',
};

function load(): Look {
  try {
    const raw = localStorage.getItem('es.look.v2');
    if (!raw) return { ...DEFAULTS, traits: [...DEFAULTS.traits] };
    const saved = JSON.parse(raw) as Partial<Look>;
    return { ...DEFAULTS, ...saved, traits: Array.isArray(saved.traits) ? saved.traits : [...DEFAULTS.traits] };
  } catch {
    return { ...DEFAULTS, traits: [...DEFAULTS.traits] };
  }
}

export const look: Look = load();
const listeners = new Set<() => void>();

export function onLookChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function persist(): void {
  try {
    localStorage.setItem('es.look.v2', JSON.stringify(look));
  } catch {
    /* private mode */
  }
}

/** Change genes without adopting a new member: the character becomes custom. */
export function setLook(patch: Partial<Look>): void {
  const isGene = patch.body !== undefined || patch.color !== undefined || patch.traits !== undefined;
  Object.assign(look, patch);
  if (isGene && patch.cast === undefined) look.cast = '';
  persist();
  for (const fn of listeners) fn();
}

/** Adopt a cast member wholesale. */
export function selectCast(id: string): void {
  const member = castMember(id);
  if (!member) return;
  look.cast = id;
  look.body = member.body;
  look.color = member.color;
  look.traits = [...member.traits];
  persist();
  for (const fn of listeners) fn();
}

export function toggleTrait(id: string): void {
  const next = look.traits.includes(id) ? look.traits.filter((t) => t !== id) : [...look.traits, id];
  setLook({ traits: next });
}

export function backgroundClass(): string {
  return `bg-${look.background}`;
}

/** The genome as a plain object, for the code snippet and the exports. */
export function genomeJson(): string {
  return JSON.stringify({ body: look.body, color: look.color, traits: look.traits, state: look.state }, null, 2);
}
