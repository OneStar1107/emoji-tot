/** Top edge of the body, where most head furniture hangs. */
const topY = (body) => 50 - (body.height * 100) / 2;
const mirror = (svg, flip) => flip ? `<g transform="translate(100,0) scale(-1,1)">${svg}</g>` : svg;
const EARS = {
    catEar: ({ ink, body }) => {
        const y = topY(body) + 2;
        return `<path d="M30 ${y + 6}L26 ${y - 16}L44 ${y + 1}Z" fill="${ink}"/><path d="M70 ${y + 6}L74 ${y - 16}L56 ${y + 1}Z" fill="${ink}"/>`;
    },
    bunnyEar: ({ ink, body }) => {
        const y = topY(body) + 2;
        return `<ellipse cx="38" cy="${y - 12}" rx="5" ry="17" fill="${ink}"/><ellipse cx="62" cy="${y - 12}" rx="5" ry="17" fill="${ink}"/>`;
    },
    bearEar: ({ ink, body }) => {
        const y = topY(body) + 6;
        return `<circle cx="30" cy="${y}" r="9" fill="${ink}"/><circle cx="70" cy="${y}" r="9" fill="${ink}"/>`;
    },
    foxEar: ({ ink, body }) => {
        const y = topY(body) + 2;
        return `<path d="M28 ${y + 4}L22 ${y - 20}L46 ${y - 2}Z" fill="${ink}"/><path d="M72 ${y + 4}L78 ${y - 20}L54 ${y - 2}Z" fill="${ink}"/>`;
    },
    mouseEar: ({ ink, body }) => {
        const y = topY(body) + 10;
        return `<circle cx="26" cy="${y}" r="12" fill="${ink}"/><circle cx="74" cy="${y}" r="12" fill="${ink}"/>`;
    },
    deerAntler: ({ ink, body }) => {
        const y = topY(body) + 2;
        return `<path d="M38 ${y}V${y - 14}M38 ${y - 8}L30 ${y - 16}M38 ${y - 12}L44 ${y - 20}" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M62 ${y}V${y - 14}M62 ${y - 8}L70 ${y - 16}M62 ${y - 12}L56 ${y - 20}" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    },
};
const TOPS = {
    horn: ({ ink, body }) => {
        const y = topY(body) + 2;
        return `<path d="M50 ${y + 2}L44 ${y - 14}L50 ${y - 10}L56 ${y - 14}Z" fill="${ink}"/>`;
    },
    antenna: ({ ink, body }) => {
        const y = topY(body) + 2;
        return `<path d="M50 ${y}V${y - 14}" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/><circle cx="50" cy="${y - 17}" r="4" fill="${ink}"/>`;
    },
    sprout: ({ ink, body }) => {
        const y = topY(body) + 2;
        return `<path d="M50 ${y + 2}V${y - 8}" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/><path d="M50 ${y - 6}C42 ${y - 10} 40 ${y - 18} 48 ${y - 18}C52 ${y - 18} 52 ${y - 12} 50 ${y - 6}Z" fill="${ink}"/><path d="M50 ${y - 4}C58 ${y - 6} 62 ${y - 14} 55 ${y - 15}C51 ${y - 15} 50 ${y - 9} 50 ${y - 4}Z" fill="${ink}"/>`;
    },
    leaf: ({ ink, body }) => {
        const y = topY(body) + 4;
        return mirror(`<path d="M50 ${y} C64 ${y - 4} 72 ${y - 14} 62 ${y - 18} C54 ${y - 20} 50 ${y - 10} 50 ${y}Z" fill="${ink}"/>`);
    },
    flowerCrown: ({ ink, body }) => {
        const y = topY(body) + 6;
        return `<circle cx="36" cy="${y - 4}" r="4.5" fill="${ink}"/><circle cx="50" cy="${y - 8}" r="5" fill="${ink}"/><circle cx="64" cy="${y - 4}" r="4.5" fill="${ink}"/>`;
    },
    halo: ({ ink, body }) => {
        const y = topY(body) - 6;
        return `<ellipse cx="50" cy="${y}" rx="16" ry="4.5" fill="none" stroke="${ink}" stroke-width="2.6"/>`;
    },
    crown: ({ ink, body }) => {
        const y = topY(body) + 2;
        return `<path d="M34 ${y + 4}L32 ${y - 10}L41 ${y - 2}L50 ${y - 14}L59 ${y - 2}L68 ${y - 10}L66 ${y + 4}Z" fill="${ink}"/>`;
    },
    bow: ({ ink, body }) => {
        const y = topY(body) + 4;
        return mirror(`<path d="M50 ${y}L34 ${y - 8}L34 ${y + 8}Z" fill="${ink}"/><path d="M50 ${y}L66 ${y - 8}L66 ${y + 8}Z" fill="${ink}"/><circle cx="50" cy="${y}" r="3" fill="${ink}"/>`);
    },
};
const SIDES = {
    wing: ({ ink, body }) => {
        const y = 50 + body.height * 6;
        return mirror(`<path d="M14 ${y} C2 ${y - 14} 4 ${y + 10} 16 ${y + 8}Z" fill="${ink}" opacity="0.9"/>`);
    },
    fin: ({ ink, body }) => {
        const y = 50 + body.height * 6;
        return mirror(`<path d="M12 ${y}L2 ${y - 10}L6 ${y + 6}L0 ${y + 10}Z" fill="${ink}"/>`);
    },
    spike: ({ ink, body }) => {
        const y = 50 + body.height * 10;
        return mirror(`<path d="M16 ${y}L6 ${y - 6}L12 ${y - 2}L4 ${y + 2}L12 ${y + 6}Z" fill="${ink}"/>`);
    },
    tail: ({ ink, body }) => {
        const y = 50 + body.height * 16;
        return `<path d="M62 ${y} C78 ${y + 4} 82 ${y - 10} 72 ${y - 14}" stroke="${ink}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
    },
    fluff: ({ ink, body }) => {
        const y = topY(body) + 4;
        return `<path d="M26 ${y + 12} C22 ${y + 2} 32 ${y - 2} 34 ${y + 6} C38 ${y - 2} 46 ${y} 44 ${y + 10}Z" fill="${ink}" opacity="0.95"/><path d="M56 ${y + 10} C54 ${y} 62 ${y - 2} 66 ${y + 6} C68 ${y - 2} 78 ${y + 2} 74 ${y + 12}Z" fill="${ink}" opacity="0.95"/>`;
    },
};
const SURFACES = {
    blush: ({ ink }) => `<ellipse cx="30" cy="58" rx="6" ry="3.4" fill="${ink}" opacity="0.22"/><ellipse cx="70" cy="58" rx="6" ry="3.4" fill="${ink}" opacity="0.22"/>`,
    freckles: ({ ink }) => [[32, 56], [36, 60], [64, 56], [68, 60]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="${ink}" opacity="0.5"/>`).join(''),
    spots: ({ ink, body }) => {
        const y = 50 + body.height * 8;
        return `<circle cx="34" cy="${y}" r="5" fill="${ink}" opacity="0.14"/><circle cx="64" cy="${y + 8}" r="7" fill="${ink}" opacity="0.14"/><circle cx="48" cy="${y + 18}" r="4" fill="${ink}" opacity="0.12"/>`;
    },
    stripes: ({ ink, body }) => {
        const top = topY(body) + 10;
        const bottom = 50 + body.height * 20;
        const rows = [];
        for (let i = 0; i < 3; i++) {
            const y = top + ((bottom - top) * i) / 3;
            rows.push(`<path d="M28 ${y} Q50 ${y + 5} 72 ${y}" stroke="${ink}" stroke-width="3" fill="none" opacity="0.16" stroke-linecap="round"/>`);
        }
        return rows.join('');
    },
    patch: ({ ink, body }) => {
        const y = 50 + body.height * 10;
        return `<path d="M60 ${y - 6} C74 ${y - 8} 78 ${y + 6} 66 ${y + 10} C58 ${y + 12} 56 ${y + 2} 60 ${y - 6}Z" fill="${ink}" opacity="0.15"/>`;
    },
    starfield: ({ ink }) => {
        const pts = [[30, 40], [66, 44], [40, 66], [60, 70], [72, 58], [34, 52]];
        return pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 2 ? 1.2 : 1.8}" fill="${ink}" opacity="0.35"/>`).join('');
    },
    none: () => '',
};
/** Display names, so a Chinese picker never shows an English id. */
export const TRAIT_ZH = {
    catEar: '猫耳', bunnyEar: '兔耳', bearEar: '熊耳', foxEar: '狐耳', mouseEar: '鼠耳', deerAntler: '鹿角',
    horn: '小角', antenna: '天线', sprout: '嫩芽', leaf: '叶子', flowerCrown: '花冠', halo: '光环', crown: '王冠', bow: '蝴蝶结',
    wing: '翅膀', fin: '鳍', spike: '尖刺', tail: '尾巴', fluff: '绒毛',
    blush: '腮红', freckles: '雀斑', spots: '斑点', stripes: '条纹', patch: '补丁', starfield: '星点',
    none: '无',
};
export const TRAITS = { ...EARS, ...TOPS, ...SIDES, ...SURFACES };
export const EAR_IDS = Object.keys(EARS);
export const TOP_IDS = Object.keys(TOPS);
export const SIDE_IDS = Object.keys(SIDES);
export const SURFACE_IDS = Object.keys(SURFACES);
export const TRAIT_IDS = Object.keys(TRAITS);
/** Traits that only make sense mirrored to both sides. */
export const PAIRED = new Set(['catEar', 'bunnyEar', 'bearEar', 'foxEar', 'mouseEar', 'deerAntler', 'blush', 'freckles', 'wing', 'fin', 'spike']);
export function renderTraits(ids, ctx) {
    return ids
        .map((id) => TRAITS[id])
        .filter(Boolean)
        .map((fn) => fn(ctx))
        .join('');
}
