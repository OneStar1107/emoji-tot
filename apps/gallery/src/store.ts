/**
 * The character being edited, shared by every view.
 *
 * One genome: a body, a colour, at most one trait and a state. A cast member
 * is just a saved genome with a name, a signature expression and a signature
 * motion, so selecting a member copies its genes into the editor; editing any
 * gene marks the character as custom.
 */
import { DEFAULT_CAST, castMember } from '@emojitot/core';

export type BackgroundId = 'plain' | 'grid' | 'dots' | 'night' | 'paper';

export interface Look {
  /** The member this genome started from, or '' once it is custom. */
  cast: string;
  body: string;
  color: string;
  traits: string[];
  state: string;
  /** How the ball is painted: die-cut sticker, or the quiet flat fill. */
  finish: 'sticker' | 'flat';
  background: BackgroundId;
}

const seed = castMember(DEFAULT_CAST)!;

const DEFAULTS: Look = {
  cast: DEFAULT_CAST,
  body: seed.body,
  color: seed.color,
  traits: [...seed.traits],
  state: 'idle',
  finish: 'sticker',
  background: 'plain',
};

function load(): Look {
  try {
    const raw = localStorage.getItem('es.look.v3');
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
    localStorage.setItem('es.look.v3', JSON.stringify(look));
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

/** Adopt a cast member wholesale: its genes, its expression, its motion. */
export function selectCast(id: string): void {
  const member = castMember(id);
  if (!member) return;
  look.cast = id;
  look.body = member.body;
  look.color = member.color;
  look.traits = [...member.traits];
  look.state = member.face;
  persist();
  for (const fn of listeners) fn();
}

/** Replace the single trait, or clear it. Traits never stack. */
export function setTrait(id: string): void {
  setLook({ traits: look.traits.includes(id) ? [] : [id] });
}

export function backgroundClass(): string {
  return `bg-${look.background}`;
}
