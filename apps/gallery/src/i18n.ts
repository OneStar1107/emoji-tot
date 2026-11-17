/**
 * Two languages, one dictionary.
 *
 * The site is small enough that a lookup table beats a framework; what
 * matters is that a key is never missing, so the English page cannot fall
 * back to a Chinese label in a corner nobody checked.
 */
export type Lang = 'zh' | 'en';

const MESSAGES = {
  zh: {
    'nav.console': '控制台',
    'nav.gallery': '表情馆',
    'nav.scene': '场景',
    'nav.docs': '文档',
    'nav.dark': '深色背景',

    'console.title': '控制台',
    'console.lead': '改这里的所有东西，右下角的代码跟着变。',
    'console.cast': '角色',
    'console.shape': '形状',
    'console.color': '颜色',
    'console.state': '状态',
    'console.copy': '复制代码',
    'console.code': '代码',
    'console.copied': '已复制',
    'console.noParams': '这个变体没有可调参数',
    'console.spin': '转一圈',
    'console.bounce': '跳一下',
    'console.burst': '撒花',
    'console.plain': '纯色',
    'console.grid': '网格',
    'console.dots': '圆点',
    'console.night': '夜色',
    'console.paper': '纸',

    'wall.title': '表情馆',
    'wall.lead': '五十一张脸，一个两位数。',
    'wall.all': '全部',
    'wall.copy': '复制代码',
    'wall.close': '关闭',

    'scene.title': '场景 · 多会话仲裁',
    'scene.lead': '九个代理各自上报状态，只有一张脸。紧急事件打断停留期，不紧急的排队。',
    'scene.error': '全部报错',
    'scene.done': '全部完成',
    'scene.reset': '重置',
    'scene.idle': '待机',
    'scene.showing': '显示：',


    'docs.title': '文档',

    'footer.license': 'MIT 许可 · 由 @emojitot/core 绘制',
  },
  en: {
    'nav.console': 'Console',
    'nav.gallery': 'Faces',
    'nav.scene': 'Scene',
    'nav.docs': 'Docs',
    'nav.dark': 'Dark background',

    'console.title': 'Console',
    'console.lead': 'Change anything here; the snippet in the corner follows.',
    'console.cast': 'Cast',
    'console.shape': 'Shape',
    'console.color': 'Colour',
    'console.state': 'State',
    'console.copy': 'Copy snippet',
    'console.code': 'snippet',
    'console.copied': 'Copied',
    'console.noParams': 'This variant has no parameters',
    'console.spin': 'Spin',
    'console.bounce': 'Hop',
    'console.burst': 'Confetti',
    'console.plain': 'Plain',
    'console.grid': 'Grid',
    'console.dots': 'Dots',
    'console.night': 'Night',
    'console.paper': 'Paper',

    'wall.title': 'Faces',
    'wall.lead': 'Fifty-one faces, one two-digit number.',
    'wall.all': 'All',
    'wall.copy': 'Copy snippet',
    'wall.close': 'Close',

    'scene.title': 'Scene · multi-session arbitration',
    'scene.lead':
      'Nine agents report their own state; there is one face. Urgent events interrupt the dwell, the rest queue.',
    'scene.error': 'All fail',
    'scene.done': 'All done',
    'scene.reset': 'Reset',
    'scene.idle': 'Idle',
    'scene.showing': 'Showing: ',


    'docs.title': 'Docs',

    'footer.license': 'MIT licensed · drawn by @emojitot/core',
  },
} as const;

export type MessageKey = keyof (typeof MESSAGES)['zh'];

let lang: Lang = 'zh';
const listeners = new Set<() => void>();

try {
  const saved = localStorage.getItem('es.lang') as Lang | null;
  if (saved === 'zh' || saved === 'en') lang = saved;
} catch {
  /* private mode */
}

export const getLang = (): Lang => lang;

export function t(key: MessageKey): string {
  return MESSAGES[lang][key] ?? MESSAGES.zh[key];
}

export function setLang(next: Lang): void {
  lang = next;
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  try {
    localStorage.setItem('es.lang', next);
  } catch {
    /* private mode */
  }
  for (const fn of listeners) fn();
}

export function onLangChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

setLang(lang);