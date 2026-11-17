/**
 * Headless smoke test and state wall.
 *
 * Renders every protocol id through the upstream static renderer in Node, with
 * no DOM and no browser. Two jobs at once:
 *
 * 1. Prove the chain works: id → state → SVG, for all 52 ids.
 * 2. Produce out/preview.html — every state at a glance, which is the
 *    cheapest useful version of a gallery and the thing to look at when a
 *    state renders wrong.
 *
 * Run: node apps/demo/scripts/preview.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderStaticSvg } from '@aora-bot/engine/static';
import { EMOTIONS, parseAgentMessage, stateForEmotion } from '@emojibot/protocol';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../../out');

let failures = 0;
const cards = [];

for (const def of EMOTIONS) {
  const state = stateForEmotion(def.id);
  let svg;
  try {
    svg = renderStaticSvg({ shape: 'circle', color: 'black', state, size: 96 });
  } catch (error) {
    failures++;
    console.error(`✗ ${def.id} ${def.name.zh}: ${error.message}`);
    continue;
  }
  if (!svg || !svg.includes('<svg')) {
    failures++;
    console.error(`✗ ${def.id} ${def.name.zh}: renderer produced no svg`);
    continue;
  }
  cards.push(`<figure>${svg}<figcaption><b>${def.id}</b> ${def.name.zh}${
    def.oneshot ? ' <i>event</i>' : ''
  }<span>${state}</span></figcaption></figure>`);
}

// The parser must agree with the table; this is the one assertion a browser
// would otherwise be needed to make.
const probes = [
  ['34', 'alerting'],
  ['{"emotionId":"33"}', 'celebrate'],
  ['thinking', 'thinking'],
  ['07', 'waking'],
];
for (const [input, expected] of probes) {
  const got = parseAgentMessage(input)?.state;
  if (got !== expected) {
    failures++;
    console.error(`✗ parse(${input}) → ${got}, expected ${expected}`);
  }
}

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>EmojiBot Studio — 状态墙</title>
<style>
  :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, "PingFang SC", sans-serif; }
  body { margin: 0; padding: 24px; background: light-dark(#fafafa, #121212); color: light-dark(#1a1a1a, #eee); }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
  p { margin: 0 0 20px; font-size: 13px; color: light-dark(#6b6b6b, #9a9a9a); }
  .wall { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 12px; }
  figure { margin: 0; padding: 10px; border: 1px solid light-dark(#e2e2e2, #2a2a2a); border-radius: 10px;
           background: light-dark(#fff, #191919); text-align: center; }
  figure svg { display: block; margin: 0 auto; }
  figcaption { margin-top: 6px; font-size: 11px; line-height: 1.5; }
  figcaption span { display: block; color: light-dark(#8a8a8a, #777); font-family: ui-monospace, monospace; }
  i { font-style: normal; font-size: 9px; padding: 1px 4px; border-radius: 4px; border: 1px solid light-dark(#ccc, #444); }
</style></head>
<body>
<h1>状态墙 · ${cards.length} 个 id</h1>
<p>由 <code>@aora-bot/engine/static</code> 在 Node 里渲染，无 DOM、无浏览器。标记 <i>event</i> 的是「事件」而非「状态」，不会被后续状态挤掉。</p>
<div class="wall">${cards.join('')}</div>
</body></html>`;

await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, 'preview.html'), html, 'utf8');

console.log(`${failures === 0 ? '✓' : '✗'} rendered ${cards.length}/${EMOTIONS.length} ids, ${failures} failures`);
console.log(`  → ${resolve(outDir, 'preview.html')}`);
process.exit(failures === 0 ? 0 : 1);
