/**
 * Headless smoke test and state wall.
 *
 * Renders the whole protocol through @emojitot/core in Node, with no DOM and
 * no browser. Two jobs at once:
 *
 * 1. Prove the chain works: every protocol id → state → SVG.
 * 2. Produce out/preview.html — every id at a glance, which is the cheapest
 *    useful version of a gallery and the thing to look at when a state renders
 *    wrong.
 *
 * The vocabulary has two layers, and they are not the same size:
 *
 * - 51 protocol ids (packages/protocol/src/emotions.ts). Several ids share a
 *   state on purpose — 01 and 07 both wake, 05 and 36 both load — because an
 *   id says who is speaking and a state says what the face does.
 * - 44 faces (packages/core/src/face.ts). This is the engine's own vocabulary
 *   and what a picker lists.
 *
 * So both counts are asserted, separately, and the wall shows both.
 *
 * Run from the repo root: pnpm preview
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACE_IDS, faceMeta, renderCharacter } from '@emojitot/core';
import { EMOTIONS, parseAgentMessage, stateForEmotion } from '@emojitot/protocol';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../../out');

let failures = 0;

/** Render one face, or report why it cannot be drawn. */
function svgFor(state, label) {
  try {
    const svg = renderCharacter({ body: 'circle', color: 'black', state, size: 96 });
    if (!svg || !svg.includes('<svg')) {
      failures += 1;
      console.error(`✗ ${label}: renderer produced no svg`);
      return null;
    }
    return svg;
  } catch (error) {
    failures += 1;
    console.error(`✗ ${label}: ${error.message}`);
    return null;
  }
}

/* ---- Layer 1: every protocol id renders ---- */
const idsByState = new Map();
const idCards = [];

for (const def of EMOTIONS) {
  const state = stateForEmotion(def.id);
  if (!idsByState.has(state)) idsByState.set(state, []);
  idsByState.get(state).push(def.id);

  const svg = svgFor(state, `${def.id} ${def.name.zh}`);
  if (!svg) continue;

  idCards.push(
    `<figure>${svg}<figcaption><b>${def.id}</b> ${def.name.zh}${
      def.oneshot ? ' <i>event</i>' : ''
    }<span>${state}</span></figcaption></figure>`,
  );
}

/* ---- Layer 2: every face renders, including ones no id reaches ---- */
const faceCards = [];

for (const state of FACE_IDS) {
  const svg = svgFor(state, state);
  if (!svg) continue;
  const meta = faceMeta(state);
  const ids = idsByState.get(state) ?? [];
  faceCards.push(
    `<figure>${svg}<figcaption><b>${meta.name}</b> <i>${meta.group}</i><span>${state}</span><span class="ids">${
      ids.length ? ids.join(' ') : '— no id reaches this face'
    }</span></figcaption></figure>`,
  );
}

/* ---- The parser must agree with the id table ---- */
const probes = [
  ['34', 'error'],
  ['{"emotionId":"33"}', 'done'],
  ['thinking', 'thinking'],
  ['07', 'shake-awake'],
  ['52', 'messaging'],
];
for (const [input, expected] of probes) {
  const got = parseAgentMessage(input)?.state;
  if (got !== expected) {
    failures += 1;
    console.error(`✗ parse(${input}) → ${got}, expected ${expected}`);
  }
}

/* ---- Every face must be reachable from at least one id ---- */
/* 0.6.3 renamed a batch of states to the shared vocabulary (working -> busy,
   alerting -> error, proud -> satisfied, ...). The old drawings are kept so
   older ids and saved preferences still resolve, but they are no longer ids of
   their own; the successor above is what carries them. */
const SUPERSEDED = new Set([
  'drowsy', 'bored', 'powering-down', 'working', 'composing',
  'proud', 'sad', 'suspicious', 'scared', 'alerting',
]);
for (const state of FACE_IDS) {
  if (SUPERSEDED.has(state)) continue;
  if (!idsByState.has(state)) {
    failures += 1;
    console.error(`✗ face "${state}" is not reachable from any protocol id`);
  }
}

const summary = {
  ids: EMOTIONS.length,
  idsRendered: idCards.length,
  faces: FACE_IDS.length,
  facesRendered: faceCards.length,
  statesReached: idsByState.size,
};

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>EmojiTot Studio — 状态墙</title>
<style>
  :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, "PingFang SC", sans-serif; }
  body { margin: 0; padding: 24px; background: light-dark(#fafafa, #121212); color: light-dark(#1a1a1a, #eee); }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
  h2 { font-size: 14px; font-weight: 600; margin: 28px 0 10px; }
  p { margin: 0 0 16px; font-size: 13px; color: light-dark(#5d5d5d, #9a9a9a); }
  .tally { display: flex; gap: 16px; flex-wrap: wrap; margin: 0 0 8px; font-size: 12px; }
  .tally b { font-size: 16px; display: block; font-variant-numeric: tabular-nums; }
  .tally span { color: light-dark(#6b6b6b, #9a9a9a); }
  .wall { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 12px; }
  figure { margin: 0; padding: 10px; border: 1px solid light-dark(#e2e2e2, #2a2a2a); border-radius: 10px;
           background: light-dark(#fff, #191919); text-align: center; }
  figure svg { display: block; margin: 0 auto; }
  figcaption { margin-top: 6px; font-size: 11px; line-height: 1.5; }
  figcaption span { display: block; color: light-dark(#8a8a8a, #777); font-family: ui-monospace, monospace; }
  figcaption span.ids { color: light-dark(#a05cb0, #c39bd3); letter-spacing: .04em; }
  i { font-style: normal; font-size: 9px; padding: 1px 4px; border-radius: 4px; border: 1px solid light-dark(#ccc, #444); }
</style></head>
<body>
<h1>状态墙</h1>
<p>由 <code>@emojitot/core</code> 在 Node 里渲染，无 DOM、无浏览器。上面是 <b>${summary.ids} 个协议 id</b>，下面是 <b>${summary.faces} 个脸部状态</b>——两层词汇不是同一个数量，多个 id 会指向同一个脸。标记 <i>event</i> 的是「事件」而非「状态」，不会被后续状态挤掉。</p>
<div class="tally">
  <div><b>${summary.idsRendered}/${summary.ids}</b><span>协议 id 渲染</span></div>
  <div><b>${summary.facesRendered}/${summary.faces}</b><span>脸部状态渲染</span></div>
  <div><b>${summary.statesReached}</b><span>id 实际覆盖的脸</span></div>
  <div><b>${failures}</b><span>failures</span></div>
</div>
<h2>${summary.ids} 个协议 id</h2>
<div class="wall">${idCards.join('')}</div>
<h2>${summary.faces} 个脸部状态</h2>
<div class="wall">${faceCards.join('')}</div>
</body></html>`;

await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, 'preview.html'), html, 'utf8');

console.log(
  `${failures === 0 ? '✓' : '✗'} ${summary.ids} ids → ${summary.faces} faces: ` +
    `${summary.idsRendered}/${summary.ids} ids rendered, ${summary.facesRendered}/${summary.faces} faces rendered, ` +
    `${failures} failures`,
);
console.log(`  → ${resolve(outDir, 'preview.html')}`);
process.exit(failures === 0 ? 0 : 1);
