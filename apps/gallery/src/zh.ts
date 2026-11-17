/**
 * Chinese names for the engine's ids.
 *
 * The engine speaks in ids — `mochi`, `riso`, `mauve` — which are good
 * identifiers and poor reading. Chinese mode shows the name; the id stays in
 * the snippet, because that is what the code needs.
 */

export const SHAPE_ZH: Record<string, string> = {
  circle: '圆', mochi: '麻薯', blob: '团子', pebble: '卵石', egg: '蛋', bun: '包子',
  tofu: '豆腐', pill: '药丸', hex: '六边形', onigiri: '饭团', gem: '宝石',
  cloud: '云', drop: '水滴', leaf: '叶子', flower: '花', clover: '四叶草',
  sprout: '嫩芽', mushroom: '蘑菇', acorn: '橡果', cactus: '仙人掌', eggplant: '茄子',
  pear: '梨', apple: '苹果', strawberry: '草莓', cherry: '樱桃', avocado: '牛油果', melon: '哈密瓜',
  pudding: '布丁', toast: '吐司', icecream: '冰淇淋', cupcake: '纸杯蛋糕', fries: '薯条', candy: '糖果', burger: '汉堡',
  star: '星星', heart: '心', flame: '火焰', bell: '铃铛', ghost: '幽灵', bot: '机器人',
  crescent: '月牙', boba: '珍珠', planet: '星球',
  cottage: '小屋', chat: '对话', gift: '礼物', bulb: '灯泡',
  fish: '鱼', octopus: '章鱼', seal: '海豹', puffer: '河豚',
  cat: '猫', bunny: '兔', bear: '熊', chick: '小鸡', penguin: '企鹅', pig: '猪',
  fox: '狐狸', lion: '狮子', hamster: '仓鼠', hedgehog: '刺猬', koala: '考拉', bat: '蝙蝠',
  bob: '短发', topknot: '丸子头', spiky: '刺头', curly: '卷发', twinbuns: '双丸子',
  chunk: '煤块', lump: '煤球', fluff: '绒毛',
};

export const COLOR_ZH: Record<string, string> = {
  cream: '奶油', ivory: '象牙', black: '墨黑', brown: '棕', red: '红', orange: '橙', yellow: '黄',
  green: '绿', cyan: '青', blue: '蓝', violet: '紫罗兰', magenta: '洋红', pink: '粉', gray: '灰',
  sage: '鼠尾草', clay: '陶土', navy: '海军蓝', mauve: '藕荷',
};

export const STYLE_ZH: Record<string, string> = {
  vector: '矢量', pixel: '像素', kaomoji: '颜文字',
};

export const VARIANT_ZH: Record<string, string> = {
  solid: '纯色', outline: '描边', glass: '玻璃', sticker: '贴纸', paper: '剪纸',
  soft: '柔和', riso: '孔版', pencil: '铅笔', marker: '马克笔', crayon: '蜡笔',
  watercolor: '水彩', neon: '霓虹', chalk: '粉笔', origami: '折纸', relief: '浮雕', gothic: '哥特',
  crisp: '实心', dot: '圆点', block: '方块',
  plain: '纯文字', bubble: '气泡',
};

export const BACKGROUND_ZH: Record<string, string> = {
  plain: '纯色', grid: '网格', dots: '圆点', night: '夜色', paper: '纸',
};

/** Fall back to the id when there is no translation: a missing name must not blank a control. */
export const zh = (table: Record<string, string>, id: string, lang: 'zh' | 'en'): string =>
  lang === 'zh' ? (table[id] ?? id) : id;
