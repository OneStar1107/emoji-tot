import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = fileURLToPath(new URL('../src/renderer/', import.meta.url));
const PORT = 9677;
const CDP_PORT = 9788;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

/*
 * The probe page is generated here rather than checked in: it is a copy of the
 * shelf's real DOM with the real stylesheet, laid out at the panel's real
 * height. Nothing else needs to exist on disk for the measurement to be true.
 */
const PROBE = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" /><link rel="stylesheet" href="./island.css" /></head>
<body data-theme="dark" data-skin="frost">
  <div class="panel"><div class="pages" id="pages">
    <div class="shelf" data-shelf-drop>
      <div class="shelf-hint">把文件拖到这里 · 复制到 <code>shelf</code> 文件夹</div>
      <div class="shelf-list"></div>
      <div class="clip">
        <div class="clip-head"><span>剪贴板</span><button class="ghost" type="button">清空</button></div>
        <div class="clip-list">
          <div class="clip-item"><button class="clip-text" type="button">第一条剪贴板文字内容示例</button><button class="clip-pin" type="button">★</button></div>
          <div class="clip-item"><button class="clip-text" type="button">第二条</button><button class="clip-pin" type="button">★</button></div>
          <div class="clip-item"><button class="clip-text" type="button">第三条</button><button class="clip-pin" type="button">★</button></div>
        </div>
      </div>
    </div>
  </div></div>
</body></html>`;
const PROBE_PATH = join(ROOT, '__probe.generated.html');
await writeFile(PROBE_PATH, PROBE, 'utf8');

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || '__probe.generated.html';
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + (process.env.TEMP || '/tmp') + '/emoji-tot-probe', '--remote-debugging-port=' + CDP_PORT, '--window-size=520,700', 'about:blank'], { stdio: 'ignore' });

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch {}
    await sleep(250);
  }
  return null;
}

class Cdp {
  #ws; #id = 0; #pending = new Map();
  static async attach(url) {
    const c = new Cdp();
    c.#ws = new WebSocket(url);
    await new Promise((res, rej) => {
      c.#ws.addEventListener('open', res, { once: true });
      c.#ws.addEventListener('error', rej, { once: true });
    });
    c.#ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      const p = c.#pending.get(m.id);
      if (!p) return;
      c.#pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    });
    return c;
  }
  send(method, params = {}) {
    const id = ++this.#id;
    this.#ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.#pending.set(id, { resolve: res, reject: rej }));
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }
  close() { this.#ws.close(); }
}

let cdp = null;
try {
  const version = await waitFor('http://127.0.0.1:' + CDP_PORT + '/json/version');
  if (!version) throw new Error('no chrome');
  const target = (await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json()).find((t) => t.type === 'page');
  cdp = await Cdp.attach(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/__probe.generated.html' });
  await sleep(900);

  const raw = await cdp.evaluate(`
    (() => {
      const h = (sel) => { const el = document.querySelector(sel); return el ? +el.getBoundingClientRect().height.toFixed(1) : -1; };
      const pages = document.querySelector('#pages');
      const cs = getComputedStyle(pages);
      const item = document.querySelector('.clip-item');
      return JSON.stringify({
        pagesBox: h('#pages'),
        pagesContent: +(pages.clientHeight).toFixed(1),
        pagesPadTop: cs.paddingTop,
        shelf: h('.shelf'),
        hint: h('.shelf-hint'),
        files: h('.shelf-list'),
        clip: h('.clip'),
        head: h('.clip-head'),
        list: h('.clip-list'),
        itemH: item ? +item.getBoundingClientRect().height.toFixed(1) : -1,
      });
    })()
  `);
  const m = JSON.parse(raw);
  console.log(JSON.stringify(m, null, 2));
  const perItem = m.itemH + 4;
  console.log('\nclip-list = ' + m.list + 'px  → ' + Math.floor((m.list + 4) / perItem) + ' items fit (' + perItem + 'px each)');
  console.log('clip block = ' + m.clip + 'px (head ' + m.head + ' + list ' + m.list + ')');
} catch (error) {
  console.log('ERROR ' + (error && error.message));
} finally {
  cdp?.close(); chrome.kill(); server.close();
  await unlink(PROBE_PATH).catch(() => {});
}
