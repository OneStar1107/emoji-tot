import { renderStaticSvg } from '@aora-bot/engine/static';
import { writeFile } from 'node:fs/promises';

const members = [
  ['dot', 'cream'], ['mochi', 'black'], ['pip', 'pink'], ['byte', 'blue'],
  ['momo', 'peach'], ['bao', 'yellow'], ['teal', 'cyan'], ['tato', 'orange'],
  ['hexa', 'violet'], ['gemma', 'green'], ['nimbo', 'gray'], ['bloom', 'magenta'],
];
const svgs = members.map(([cast, color]) => {
  try {
    const svg = renderStaticSvg({ color, state: 'happy', size: 260, shape: 'circle' });
    return `<div class="cell">${svg}</div>`;
  } catch { return ''; }
}).join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#ffffff}
  .row{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;padding:28px;width:1600px;box-sizing:border-box}
  .cell{display:grid;place-items:center}
  svg{width:220px;height:220px;filter:drop-shadow(0 2px 8px rgba(0,0,0,.12))}
</style></head><body><div class="row">${svgs}</div></body></html>`;
await writeFile('E:/dsh-workspace/emojibot-studio/out/hero.html', html, 'utf8');
console.log('hero html ready');
