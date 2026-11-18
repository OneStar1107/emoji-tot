/**
 * Attach to the running Electron app the way Chromium's own protocol expects:
 * through the browser endpoint plus Target.attachToTarget, not by dialling a
 * page target directly. The page socket accepts the handshake but never
 * answers Runtime.evaluate, which is what made the first attempt hang.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ELECTRON = 'node_modules/electron/dist/electron.exe';
const PORT = 9555;
const cleanEnv = { ...process.env };
delete cleanEnv.ELECTRON_RUN_AS_NODE;
delete cleanEnv.ELECTRON_NO_ATTACH_CONSOLE;

const app = spawn(ELECTRON, ['.', '--remote-debugging-port=' + PORT], { cwd: process.cwd(), stdio: 'ignore', env: cleanEnv });

const out = [];
const ok = (n, p, d = '') => { out.push(p); console.log((p ? '  PASS  ' : '  FAIL  ') + n + (d ? '  — ' + d : '')); };

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch {}
    await sleep(300);
  }
  return null;
}

class Browser {
  #ws; #id = 0; #pending = new Map();
  async connect(url) {
    this.#ws = new WebSocket(url);
    await new Promise((res, rej) => {
      this.#ws.addEventListener('open', res, { once: true });
      this.#ws.addEventListener('error', rej, { once: true });
    });
    this.#ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      const p = this.#pending.get(m.id);
      if (!p) return;
      this.#pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    });
  }
  send(method, params = {}, timeoutMs = 8000, sessionId) {
    const id = ++this.#id;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    this.#ws.send(JSON.stringify(message));
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.#pending.delete(id); rej(new Error(method + ' timed out')); }, timeoutMs);
      this.#pending.set(id, { resolve: (v) => { clearTimeout(t); res(v); }, reject: (e) => { clearTimeout(t); rej(e); } });
    });
  }
  close() { this.#ws.close(); }
}

let browser = null;
try {
  const version = await waitFor('http://127.0.0.1:' + PORT + '/json/version');
  ok('Electron exposes the browser endpoint', Boolean(version));
  if (!version) throw new Error('no endpoint');

  browser = new Browser();
  await browser.connect(version.webSocketDebuggerUrl);

  const { targetInfos } = await browser.send('Target.getTargets');
  const pages = targetInfos.filter((t) => t.type === 'page');
  console.log('  INFO  pages: ' + pages.map((p) => p.url.split('/').pop()).join(', '));

  const island = pages.find((p) => p.url.includes('island.html')) || pages[0];
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId: island.targetId, flatten: true });
  ok('attached to a page session', Boolean(sessionId), island.url.split('/').pop());

  // The domain must be enabled on this session before evaluate is addressable,
  // and the session id travels as a top-level field, not inside params.
  await browser.send('Runtime.enable', {}, 8000, sessionId).catch(() => {});

  const evaluate = async (expression) => {
    const r = await browser.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, 8000, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };

  const sandbox = await evaluate("JSON.stringify({ process: typeof process, require: typeof require, api: typeof window.api, outer: window.outerWidth + 'x' + window.outerHeight })");
  const parsed = JSON.parse(sandbox);
  ok('renderer has no Node globals (sandbox on)', parsed.process === 'undefined' && parsed.require === 'undefined', sandbox);
  ok('preload bridge present', parsed.api === 'object');
  ok('outer window size sane', /^\d+x\d+$/.test(parsed.outer) && !parsed.outer.startsWith('0'), parsed.outer);

  // Open the shelf page and measure the clipboard block.
  const metrics = await evaluate(`
    (async () => {
      const nav = document.querySelector('[data-page="shelf"]') || [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('置物'));
      if (nav) nav.click();
      await new Promise((r) => setTimeout(r, 500));
      const box = (sel) => { const el = document.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().height) : -1; };
      return JSON.stringify({ pages: box('.pages'), hint: box('.shelf-hint'), files: box('.shelf-list'), clip: box('.clip'), list: box('.clip-list'), head: box('.clip-head') });
    })()
  `);
  console.log('  INFO  shelf metrics: ' + metrics);
  ok('shelf metrics collected', metrics && JSON.parse(metrics).clip > 0, metrics);

  browser.close();
} catch (error) {
  ok('attach run', false, String(error && error.message));
} finally {
  try { app.kill(); } catch {}
}

const failed = out.filter((p) => !p).length;
console.log('\n' + (out.length - failed) + '/' + out.length + ' checks passed');
process.exit(failed ? 1 : 0);
