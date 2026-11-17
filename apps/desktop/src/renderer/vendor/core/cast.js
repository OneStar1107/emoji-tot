export const MOTIONS = [
    'bounce', 'spin', 'tilt', 'pulse', 'wobble', 'pop', 'float',
];
/** Display names, so a Chinese wall never shows an English id. */
export const MOTION_ZH = {
    bounce: '弹跳', spin: '旋转', tilt: '歪头', pulse: '呼吸', wobble: '摇晃', pop: '蹦出', float: '漂浮',
};
export const FAMILIES = [
    { id: 'round', zh: '圆润', en: 'Round' },
    { id: 'square', zh: '方圆', en: 'Square' },
    { id: 'poly', zh: '多边', en: 'Polygon' },
    { id: 'flora', zh: '花叶', en: 'Flora' },
    { id: 'fruit', zh: '水果', en: 'Fruit' },
    { id: 'form', zh: '造型', en: 'Form' },
];
const RAW = [
    ['tot', 'tot', 'tot', 'round', 'circle', 'black', '', 'idle', 'pulse', '默认的演示角色。黑底白字的一个圆，什么表情都从它开始。'],
    ['dan', '蛋仔', 'Eggy', 'round', 'egg', 'cream', '', 'happy', 'wobble', '上窄下宽的蛋形，站稳了就是一副好脾气。'],
    ['fangtang', '方糖', 'Cube', 'square', 'squircle', 'white', 'spots', 'happy', 'pop', '方圆带一点斑，甜是慢慢化开的。'],
    ['guodong', '果冻', 'Jelly', 'round', 'blob', 'cyan', '', 'playful', 'wobble', '软圆，站着不动也在轻轻颤。'],
    ['mianbao', '面包', 'Bread', 'square', 'pill', 'cream', 'stripes', 'drowsy', 'pulse', '长条胶囊形，刚出炉时最圆。'],
    ['xingxing', '星星', 'Star', 'poly', 'star', 'yellow', 'starfield', 'excited', 'spin', '五角星，白天也在只是你看不见。'],
    ['baoshi', '宝石', 'Gem', 'poly', 'gem', 'violet', 'starfield', 'proud', 'spin', '切面越多，藏的光越多。'],
    ['yinghua', '樱花', 'Blossom', 'flora', 'flower', 'pink', 'starfield', 'happy', 'spin', '五瓣花，开七天等三百五十八天。'],
    ['siye', '四叶', 'Clover', 'flora', 'clover', 'green', '', 'curious', 'tilt', '四片叶子，第四片是给别人的运气。'],
    ['yunduo', '云朵', 'Cloudy', 'flora', 'cloud', 'white', '', 'drowsy', 'float', '起伏的云边，形状随时在变。'],
    ['yudi', '雨滴', 'Raindrop', 'flora', 'drop', 'blue', '', 'sad', 'float', '上尖下圆，下落时最自由。'],
    ['lizi', '梨子', 'Pear', 'fruit', 'pear', 'green', 'leaf', 'shy', 'wobble', '上小下大，天生适合被捧在手心。'],
    ['xinbao', '心宝', 'Hearty', 'form', 'heart', 'pink', 'blush', 'excited', 'bounce', '心形，跳得比说话快。'],
    ['youling', '幽灵', 'Ghosty', 'form', 'ghost', 'white', 'patch', 'playful', 'float', '半圆顶波浪底，不是吓人只是透明。'],
    ['jiqiren', '机器人', 'Beep', 'form', 'tot', 'gray', 'antenna', 'working', 'pulse', '圆角方身加天线，按一下会响。'],
];
export const CAST = RAW.map(([id, zh, en, family, body, color, trait, face, motion, desc]) => ({
    id,
    name: { zh, en },
    desc,
    family,
    body,
    color,
    // No traits: a character is its silhouette plus its face, nothing bolted on.
    traits: [],
    face,
    motion,
}));
const BY_ID = new Map(CAST.map((m) => [m.id, m]));
export const CAST_IDS = CAST.map((m) => m.id);
export function castMember(id) {
    return BY_ID.get(id);
}
export function castByFamily(family) {
    return CAST.filter((m) => m.family === family);
}
/** The member a fresh open starts on. */
export const DEFAULT_CAST = 'tot';
/** Cross two members into a new genome. Deterministic for a given seed. */
export function breed(a, b, seed) {
    const pick = (x, y) => (seed % 2 === 0 ? x : y);
    const trait = seed % 3 === 0 ? a.traits[0] : seed % 3 === 1 ? b.traits[0] : undefined;
    return {
        id: `${a.id}-x-${b.id}-${seed % 997}`,
        name: { zh: `${a.name.zh}${b.name.zh}`, en: `${a.name.en}${b.name.en}` },
        desc: `${a.name.zh} 与 ${b.name.zh} 的后代。`,
        family: pick(a.family, b.family),
        body: pick(a.body, b.body),
        color: pick(a.color, b.color),
        traits: trait ? [trait] : [],
        face: pick(a.face, b.face),
        motion: pick(a.motion, b.motion),
    };
}
