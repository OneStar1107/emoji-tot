/**
 * The look of the character, shared by every view.
 *
 * Three choices now, because the engine has three: a shape, a body colour and
 * a state. The old console had six (cast, shape, colour, style, variant,
 * params) because it wrapped a larger engine; carrying those names into a
 * smaller one would leave controls that change nothing.
 */
export type BackgroundId = 'plain' | 'grid' | 'dots' | 'night' | 'paper';

export interface Look {
  shape: string;
  color: string;
  state: string;
  background: BackgroundId;
}

const DEFAULTS: Look = { shape: 'circle', color: 'white', state: 'idle', background: 'plain' };

function load(): Look {
  try {
    const raw = localStorage.getItem('es.look');
    if (!raw) return { ...DEFAULTS };
    const saved = JSON.parse(raw) as Partial<Look>;
    return { ...DEFAULTS, ...saved };
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
  Object.assign(look, patch);
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
