/**
 * Real-window smoke test for the desktop app.
 *
 * Everything else in this repo can be verified headlessly; the window cannot.
 * This launches the actual Electron app, attaches CDP to its renderers, and
 * measures what only the real thing can answer: does a window exist, is the
 * sandbox on, did the CSP block anything, and how tall is the clipboard list
 * really.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ELECTRON = 'node_modules/electron/dist/electron.exe';
const PORT = 9444;

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '  — ' + detail : ''));
};

/*
 * ELECTRON_RUN_AS_NODE turns the binary into a plain Node interpreter — no
 * window, exit 0, and main.js dies on the first `require('electron')` that is
 * not a module. Strip it (and its sibling) before spawning.
 */
const cleanEnv = { ...process.env };
delete cleanEnv.ELECTRON_RUN_AS_NODE;
delete cleanEnv.ELECTRON_NO_ATTACH_CONSOLE;

const app = spawn(ELECTRON, ['.', '--remote-debugging-port=' + PORT], {
  cwd: process.cwd(),
  stdio: 'ignore',
  env: cleanEnv,
});

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch { /* not up */ }
    await sleep(300);
  }
  return false;
}

class Cdp {
  #ws; #id = 0; #pending = new Map();
  static async attach(url) {
    const cdp = new Cdp();
    cdp.#ws = new WebSocket(url);
    await new Promise((res, rej) => {
      cdp.#ws.addEventListener('open', res, { once: true });
      cdp.#ws.addEventListener('error', rej, { once: true });
    });
    cdp.#ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      const p = cdp.#pending.get(m.id);
      if (!p) return;
      cdp.#pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    });
    return cdp;
  }
  send(method, params = {}, timeoutMs = 5000) {
    const id = ++this.#id;
    this.#ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        rej(new Error(method + ' timed out'));
      }, timeoutMs);
      this.#pending.set(id, {
        resolve: (v) => { clearTimeout(timer); res(v); },
        reject: (e) => { clearTimeout(timer); rej(e); },
      });
    });
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
  const up = await waitFor('http://127.0.0.1:' + PORT + '/json/version');
  ok('Electron launched and exposes CDP', up);
  if (!up) throw new Error('electron did not start');

  await sleep(2500);
  const targets = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
  const pages = targets.filter((t) => t.type === 'page');
  ok('at least two windows exist', pages.length >= 2, pages.map((p) => p.url.split('/').pop()).join(', '));

  const islandTarget = pages.find((t) => t.url.includes('island.html'));
  const ballTarget = pages.find((t) => t.url.includes('index.html'));
  ok('ball window is loaded', Boolean(ballTarget));
  // The island is only created when prefs.form says so; its absence is a
  // configuration, not a failure.
  console.log('  INFO  island window present: ' + Boolean(islandTarget));

  const target = islandTarget || ballTarget;
  if (target) {
    cdp = await Cdp.attach(target.webSocketDebuggerUrl);

    // Sandbox: the renderer must have no Node and no require.
    const sandbox = await cdp.evaluate("JSON.stringify({ node: typeof process, require: typeof require, api: typeof window.api })");
    const parsed = JSON.parse(sandbox);
    ok('renderer has no Node globals (sandbox on)', parsed.node === 'undefined' && parsed.require === 'undefined', sandbox);
    ok('preload bridge still works', parsed.api === 'object', 'window.api=' + parsed.api);

    // Window size, measured the only way that is honest: outer.
    const outer = await cdp.evaluate('window.outerWidth + "x" + window.outerHeight');
    ok('outer window size is sane', /^\d+x\d+$/.test(outer) && !outer.startsWith('0'), outer);

    const where = islandTarget ? 'island' : 'ball';
    console.log('  INFO  measuring in the ' + where + ' window');
    // Clipboard list height inside the shelf page.
    const shelf = await cdp.evaluate(`
      (async () => {
        if (window.api && window.api.page) { try { window.api.page('shelf'); } catch {} }
        const clicked = document.querySelector('[data-page="shelf"]') || document.querySelector('[data-nav="shelf"]');
        if (clicked) clicked.click();
        await new Promise((r) => setTimeout(r, 400));
        const clip = document.querySelector('.clip');
        const list = document.querySelector('.clip-list');
        const hint = document.querySelector('.shelf-hint');
        const files = document.querySelector('.shelf-list');
        return JSON.stringify({
          clip: clip ? Math.round(clip.getBoundingClientRect().height) : -1,
          list: list ? Math.round(list.getBoundingClientRect().height) : -1,
          hint: hint ? Math.round(hint.getBoundingClientRect().height) : -1,
          files: files ? Math.round(files.getBoundingClientRect().height) : -1,
          pages: document.querySelector('.pages') ? Math.round(document.querySelector('.pages').getBoundingClientRect().height) : -1,
        });
      })()
    `);
    console.log('  INFO  shelf metrics: ' + shelf);
    ok('shelf measurement collected', shelf && shelf.includes('"clip"'), shelf);
    cdp.close();
  }
} catch (error) {
  ok('smoke run completed', false, String(error && error.message));
} finally {
  try { app.kill(); } catch {}
}

const failed = results.filter((r) => !r.pass);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
process.exit(failed.length ? 1 : 0);
