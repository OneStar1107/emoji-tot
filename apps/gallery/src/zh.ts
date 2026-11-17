/**
 * Chinese names for the engine's ids.
 *
 * The engine speaks in ids — `squircle`, `violet` — which are good
 * identifiers and poor reading. Chinese mode shows the name; the id stays in
 * the snippet, because that is what the code needs.
 */

export const SHAPE_ZH: Record<string, string> = {
  circle: '圆',
  egg: '蛋',
  squircle: '圆角方',
  star: '星星',
  heart: '心',
  cloud: '云',
  ghost: '幽灵',
  bot: '机器人',
};

export const COLOR_ZH: Record<string, string> = {
  white: '白',
  cream: '奶油',
  black: '墨黑',
  gray: '灰',
  pink: '粉',
  red: '红',
  orange: '橙',
  yellow: '黄',
  green: '绿',
  cyan: '青',
  blue: '蓝',
  violet: '紫',
};

export const BACKGROUND_ZH: Record<string, string> = {
  plain: '纯色',
  grid: '网格',
  dots: '圆点',
  night: '夜色',
  paper: '纸',
};

/** Fall back to the id when there is no translation: a missing name must not blank a control. */
export const zh = (table: Record<string, string>, id: string, lang: 'zh' | 'en'): string =>
  lang === 'zh' ? (table[id] ?? id) : id;
