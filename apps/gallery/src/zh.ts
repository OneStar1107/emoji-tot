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
  squircle: '方圆',
  blob: '软圆',
  pear: '梨',
  drop: '水滴',
  star: '星星',
  gem: '宝石',
  pill: '面包',
  flower: '樱花',
  clover: '四叶',
  cloud: '云',
  heart: '心',
  ghost: '幽灵',
  tot: '机器人',
};

/** The two finishes, in the words the console buttons use. */
export const FINISH_ZH: Record<string, string> = {
  sticker: '贴纸',
  flat: '平涂',
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
