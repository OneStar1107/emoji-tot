/**
 * The look of the character, shared by every view.
 *
 * One object, one subscription: the console edits it, the wall reads it, the
 * theme page swaps it. Keeping it outside the views is what lets a change made
 * in the console still be there when you come back from the gallery.
 */
import { getStyle, resolveStyleOptions, type StyleId } from '@aora-bot/engine';
import { isStateId, stateForEmotion } from '@emojibot-studio/protocol';

export type BackgroundId = 'plain' | 'grid' | 'dots' | 'night' | 'paper';

export interface Look {
  cast: string;
  shape: string;
  color: string;
  state: string;
  styleId: StyleId;
  variant: string;
  options: Record<string, unknown>;
  background: BackgroundId;
}

const DEFAULTS: Look = {
  cast: 'mochi',
  shape: 'circle',
  color: 'black',
  state: 'idle',
  styleId: 'vector',
  variant: 'solid',
  options: {},
  background: 'plain',
};

function load(): Look {
  try {
    const raw = localStorage.getItem('es.look');
    if (!raw) return { ...DEFAULTS };
    const saved = JSON.parse(raw) as Partial<Look>;
    // An older build stored the numeric id here; the store speaks state names.
    if (saved.state && !isStateId(saved.state)) saved.state = stateForEmotion(saved.state);
    return { ...DEFAULTS, ...saved, options: saved.options ?? {} };
  } catch {
    return { ...DEFAULTS };
  }
}

export const look: Look = load();
const listeners = new Set<() => void>();

export function onLookChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setLook(patch: Partial<Look>): void {
  const styleChanged = patch.styleId != null && patch.styleId !== look.styleId;
  const variantChanged = patch.variant != null && patch.variant !== look.variant;
  Object.assign(look, patch);
  // Options belong to one series and one variant; carrying them across a
  // switch would leave controls showing values the renderer ignores.
  if (styleChanged) look.options = {};
  look.options = resolveStyleOptions(getStyle(look.styleId), look.options);
  void variantChanged;
  try {
    localStorage.setItem('es.look', JSON.stringify(look));
  } catch {
    /* private mode */
  }
  for (const fn of listeners) fn();
}

export function backgroundClass(): string {
  return `bg-${look.background}`;
}
