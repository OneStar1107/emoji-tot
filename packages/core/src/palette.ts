/**
 * Body colours.
 *
 * Twelve is enough to express a team and few enough that the picker fits on
 * one row. Every colour is a flat hex: the engine draws solid silhouettes, and
 * shading is a renderer decision rather than a colour decision.
 */
export const COLORS: Record<string, string> = {
  black: '#1F1F1F',
  cream: '#F2E4C4',
  white: '#FBFBFB',
  pink: '#F09CB8',
  red: '#D8453F',
  orange: '#F08A24',
  yellow: '#EFC13B',
  green: '#4FA65B',
  cyan: '#3BB6C4',
  blue: '#3C6FE0',
  violet: '#7C5CD6',
  gray: '#9AA0A6',
};

export const COLOR_IDS: readonly string[] = Object.keys(COLORS);

/** Display names, so a Chinese picker never shows an English id. */
export const COLOR_ZH: Record<string, string> = {
  black: '墨黑', cream: '奶白', white: '雪白', pink: '樱粉', red: '朱红', orange: '橘橙',
  yellow: '暖黄', green: '草绿', cyan: '水青', blue: '天蓝', violet: '藤紫', gray: '石灰',
};

export function colorHex(id: string): string {
  return COLORS[id] ?? COLORS.black;
}
