/**
 * Attach to the running Electron app the way Chromium's own protocol expects:
 * through the browser endpoint plus Target.attachToTarget, not by dialling a
 * page target directly. The page socket accepts the handshake but never
 * answers Runtime.evaluate, which is what made the first attempt hang.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolveElectronBinary } from './electron-runtime.mjs';

const PACKAGED_EXE = process.env.EMOJITOT_APP_EXE ? resolve(process.env.EMOJITOT_APP_EXE) : '';
const ELECTRON = PACKAGED_EXE || resolveElectronBinary();
const DESKTOP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 9555;
const cleanEnv = { ...process.env };
delete cleanEnv.ELECTRON_RUN_AS_NODE;
delete cleanEnv.ELECTRON_NO_ATTACH_CONSOLE;

const out = [];
const ok = (n, p, d = '') => { out.push(p); console.log((p ? '  PASS  ' : '  FAIL  ') + n + (d ? '  — ' + d : '')); };

if (!existsSync(ELECTRON)) {
  console.error('Electron binary is missing. Run `pnpm rebuild electron` before the desktop smoke test.');
  process.exit(1);
}
const SMOKE_USER_DATA = mkdtempSync(join(tmpdir(), 'emojitot-window-smoke-'));

// Chromium switches must precede the application path. Electron forwards
// everything after the path to the app, so the old order never opened a
// remote-debugging endpoint.
const app = spawn(ELECTRON, [
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + SMOKE_USER_DATA,
  ...(PACKAGED_EXE ? [] : [DESKTOP_ROOT]),
], {
  cwd: PACKAGED_EXE ? dirname(PACKAGED_EXE) : DESKTOP_ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: cleanEnv,
});
let appOutput = '';
let appExit = null;
for (const stream of [app.stdout, app.stderr]) {
  stream.on('data', (chunk) => {
    appOutput = (appOutput + chunk.toString()).slice(-8000);
  });
}
app.on('error', (error) => {
  console.error('[window-smoke] Electron failed to start:', error);
});
app.on('exit', (code, signal) => {
  appExit = { code, signal };
});

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch {}
    if (appExit) {
      throw new Error(
        'Electron exited before exposing the endpoint (' +
        'code=' + appExit.code + ', signal=' + appExit.signal + ')' +
        (appOutput ? '\n' + appOutput : ''),
      );
    }
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

  const sandbox = await evaluate("JSON.stringify({ process: typeof process, require: typeof require, api: typeof window.islandAPI, outer: window.outerWidth + 'x' + window.outerHeight })");
  const parsed = JSON.parse(sandbox);
  ok('renderer has no Node globals (sandbox on)', parsed.process === 'undefined' && parsed.require === 'undefined', sandbox);
  ok('preload bridge present', parsed.api === 'object');
  ok('outer window size sane', /^\d+x\d+$/.test(parsed.outer) && !parsed.outer.startsWith('0'), parsed.outer);

  // Open the shelf page and measure the clipboard block.
  const metrics = await evaluate(`
    (async () => {
      document.getElementById('pill')?.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
      }));
      await new Promise((r) => setTimeout(r, 350));
      const title = document.getElementById('page-name');
      for (let i = 0; i < 12 && title?.textContent !== '置物架'; i += 1) {
        document.querySelector('[data-page-nav="1"]')?.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
        }));
        await new Promise((r) => setTimeout(r, 80));
      }
      await new Promise((r) => setTimeout(r, 500));
      const box = (sel) => { const el = document.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().height) : -1; };
      return JSON.stringify({ pages: box('.pages'), hint: box('.shelf-hint'), files: box('.shelf-list'), clip: box('.clip'), list: box('.clip-list'), head: box('.clip-head') });
    })()
  `);
  console.log('  INFO  shelf metrics: ' + metrics);
  ok('shelf metrics collected', metrics && JSON.parse(metrics).clip > 0, metrics);

  const pagingTargets = JSON.parse(await evaluate(`
    JSON.stringify((() => {
      const rect = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { w: box.width, h: box.height };
      };
      return {
        pager: rect('.pager'),
        dot: rect('.dots button'),
      };
    })())
  `));
  ok(
    'island paging targets are usable',
    pagingTargets.pager?.w >= 32 &&
      pagingTargets.pager?.h >= 32 &&
      pagingTargets.dot?.w >= 24 &&
      pagingTargets.dot?.h >= 24,
    JSON.stringify(pagingTargets),
  );

  browser.close();
} catch (error) {
  ok('attach run', false, String(error && error.message));
  if (appOutput) console.error('\n[window-smoke] Electron output:\n' + appOutput);
} finally {
  try { app.kill(); } catch {}
  try {
    rmSync(SMOKE_USER_DATA, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    // Electron may still be releasing its profile on Windows; the OS temp
    // directory can clean this up later without affecting the test result.
  }
}

const failed = out.filter((p) => !p).length;
console.log('\n' + (out.length - failed) + '/' + out.length + ' checks passed');
process.exit(failed ? 1 : 0);
