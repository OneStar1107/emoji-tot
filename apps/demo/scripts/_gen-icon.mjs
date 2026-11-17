import { renderStaticSvg } from '@aora-bot/engine/static';
import { writeFile } from 'node:fs/promises';

const svg = renderStaticSvg({ shape: 'circle', color: 'black', state: 'idle', size: 420 })
  .replace('<svg ', '<svg style="width:420px;height:420px" ');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:512px;height:512px;background:transparent;overflow:hidden}
  body{display:grid;place-items:center}
</style></head><body>${svg}</body></html>`;

await writeFile('E:/dsh-workspace/emotion-studio/apps/demo/scripts/_icon.html', html, 'utf8');
console.log('html ready');
