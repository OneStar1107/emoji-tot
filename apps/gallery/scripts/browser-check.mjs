/**
 * Browser acceptance for the gallery.
 *
 * Drives a real headless Chrome over CDP: four routes, the language switch,
 * the expression deep link, twenty route changes with a live timer census,
 * and a 375 px viewport checked for horizontal overflow.
 *
 * Run: node scripts/browser-check.mjs
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? '';
}

const CHROME = findChrome();
if (!CHROME) {
  console.log('SKIP browser acceptance: Chrome/Chromium not found; set CHROME_BIN to run it.');
  process.exit(process.env.CHROME_REQUIRED === '1' ? 1 : 0);
}
async function findFreePort() {
  const probe = createNetServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => probe.close(resolve));
  if (!port) throw new Error('could not allocate a free browser-check port');
  return port;
}

const CHROME_PROFILE = mkdtempSync(join(tmpdir(), 'emoji-tot-chrome-'));
const outputIndex = process.argv.indexOf('--out');
const CAPTURE_DIR = outputIndex >= 0 && process.argv[outputIndex + 1]
  ? resolve(process.argv[outputIndex + 1])
  : '';

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '  — ' + detail : ''));
};

function start(cmd, args, options = {}) {
  // No shell: the Chrome path contains spaces, and an unquoted shell
  // command would split it.
  const child = spawn(cmd, args, { stdio: 'ignore', ...options });
  return child;
}

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  return false;
}

class Cdp {
  #ws;
  #id = 0;
  #pending = new Map();

  static async attach(wsUrl) {
    const cdp = new Cdp();
    cdp.#ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      cdp.#ws.addEventListener('open', resolve, { once: true });
      cdp.#ws.addEventListener('error', reject, { once: true });
    });
    cdp.#ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const pending = cdp.#pending.get(message.id);
      if (!pending) return;
      cdp.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    return cdp;
  }

  send(method, params = {}) {
    const id = ++this.#id;
    this.#ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.#pending.set(id, { resolve, reject }));
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }

  close() {
    this.#ws.close();
  }
}

/*
 * A four-line static server instead of `vite preview`: the preview server
 * resolves through npx on Windows, which needs a shell, which makes the
 * child pid useless for cleanup. This one owns the port directly and the
 * build is already on disk.
 */
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

const preview = createServer(async (request, response) => {
  let path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  path = path.replace(/^\/emoji-tot(?=\/|$)/, '') || '/';
  if (path === '/' || path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(DIST, path));
    response.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
  }
});
await new Promise((resolve) => preview.listen(0, '127.0.0.1', resolve));
const previewAddress = preview.address();
const PREVIEW_PORT = typeof previewAddress === 'object' && previewAddress ? previewAddress.port : 0;
if (!PREVIEW_PORT) throw new Error('preview server did not allocate a port');
const SITE = `http://127.0.0.1:${PREVIEW_PORT}/emoji-tot/`;
const CDP_PORT = await findFreePort();
/*
 * Chrome gets 30s and, if it never opens the debugging port, one relaunch.
 *
 * A loaded CI runner sometimes loses the first headless Chrome before it binds
 * the port; waiting longer on a dead process cannot help, and relaunching on a
 * live one costs a second. The single 15s attempt that used to be here is what
 * failed as "chrome did not start" on a run whose every other step passed.
 */
const CDP_VERSION = 'http://127.0.0.1:' + CDP_PORT + '/json/version';
function launchChrome() {
  const child = start(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=' + CHROME_PROFILE,
    '--remote-debugging-port=' + CDP_PORT,
    '--window-size=1280,900',
    'about:blank',
  ]);
  child.on('error', (error) => {
    console.error('[browser-check] Chrome failed to start:', error);
  });
  return child;
}
let chrome = launchChrome();

let cdp = null;
try {
  const up = await waitFor(SITE);
  ok('preview server is serving the built site', up, SITE);
  if (!up) throw new Error('preview server did not start');

  let ready = await waitFor(CDP_VERSION, 120);
  if (!ready) {
    console.log('  INFO  chrome did not answer in 30s; relaunching once');
    chrome.kill();
    await sleep(1000);
    chrome = launchChrome();
    ready = await waitFor(CDP_VERSION, 120);
  }
  ok('headless Chrome is up', ready);
  if (!ready) throw new Error('chrome did not start');

  const targets = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json();
  const page = targets.find((target) => target.type === 'page');
  cdp = await Cdp.attach(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  // Count live timers before any view runs, by wrapping the platform APIs.
  await cdp.send('Page.navigate', { url: SITE });
  await sleep(900);
  await cdp.evaluate(`
    window.__timers = { intervals: new Set(), timeouts: new Set() };
    const realSetInterval = window.setInterval;
    const realClearInterval = window.clearInterval;
    window.setInterval = function (fn, ms, ...rest) {
      const id = realSetInterval(fn, ms, ...rest);
      window.__timers.intervals.add(id);
      return id;
    };
    window.clearInterval = function (id) {
      window.__timers.intervals.delete(id);
      return realClearInterval(id);
    };
    true;
  `);

  const renderRoute = async (hash) => {
    await cdp.evaluate("location.hash = " + JSON.stringify(hash) + "; true;");
    await sleep(350);
    return cdp.evaluate("document.getElementById('view').children.length + ':' + (document.getElementById('view').textContent || '').slice(0, 40)");
  };

  if (CAPTURE_DIR) {
    mkdirSync(CAPTURE_DIR, { recursive: true });
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    for (const [route, file] of [
      ['#/console', 'gallery-console.png'],
      ['#/gallery', 'gallery-faces.png'],
      ['#/scene', 'gallery-scene.png'],
      ['#/docs', 'gallery-docs.png'],
    ]) {
      await renderRoute(route);
      await sleep(500);
      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
      });
      const target = join(CAPTURE_DIR, file);
      writeFileSync(target, Buffer.from(shot.data, 'base64'));
      console.log('  SHOT  ' + target);
    }
  }

  for (const route of ['#/console', '#/gallery', '#/scene', '#/docs']) {
    const state = await renderRoute(route);
    ok('route renders: ' + route, state.startsWith('1:') && state.length > 4, state.slice(0, 50));
  }

  /*
   * The console stage is the reference implementation for the live runtime.
   * Keep the contract visible here: a real stateful SVG, two polygon eyes and
   * an accessible pause control must survive the static build.
   */
  await renderRoute('#/console');
  await sleep(180);
  const consoleRuntime = await cdp.evaluate(`
    (() => {
      const root = document.querySelector('[data-hero] [data-et-runtime]');
      const pause = document.querySelector('[data-motion-pause]');
      const eyes = root ? [...root.querySelectorAll('[data-eye]')] : [];
      return {
        runtime: Boolean(root),
        eyes: eyes.length,
        polygonEyes: eyes.every((eye) => {
          const d = eye.getAttribute('d') || '';
          return d.startsWith('M') && d.endsWith('Z') && (d.match(/L/g) || []).length >= 11;
        }),
        pause: Boolean(pause),
        state: root?.getAttribute('data-state') || '',
      };
    })()
  `);
  ok(
    'console mounts the stateful polygon-eye runtime',
    consoleRuntime.runtime && consoleRuntime.eyes === 2 && consoleRuntime.polygonEyes,
    JSON.stringify(consoleRuntime),
  );
  ok(
    'console exposes a pause control for persistent motion',
    consoleRuntime.pause === true,
    JSON.stringify(consoleRuntime),
  );

  const metaDescription = await cdp.evaluate(
    "document.querySelector('meta[name=description]')?.content || ''",
  );
  ok(
    'social description matches the current cast',
    metaDescription.includes('15 characters') && !metaDescription.includes('71 cast'),
    metaDescription,
  );

  await renderRoute('#/gallery');
  const allCasts = await cdp.evaluate("document.querySelectorAll('#wallGrid .tile').length");
  const wallLayout = JSON.parse(await cdp.evaluate(`
    JSON.stringify((() => {
      const grid = document.getElementById('wallGrid');
      const tabs = document.querySelector('.wall-tabs');
      const filters = document.getElementById('wallFilters');
      const tiles = [...grid.querySelectorAll('.tile')];
      const first = tiles[0].getBoundingClientRect();
      const second = tiles[1].getBoundingClientRect();
      return {
        display: getComputedStyle(grid).display,
        sameRow: Math.abs(first.top - second.top) < 2 && second.left > first.right,
        tabsDisplay: getComputedStyle(tabs).display,
        filtersDisplay: getComputedStyle(filters).display,
      };
    })())
  `));
  ok(
    'cast wall uses a multi-column grid and styled tabs',
    wallLayout.display === 'grid' &&
      wallLayout.sameRow &&
      ['inline-flex', 'flex'].includes(wallLayout.tabsDisplay) &&
      wallLayout.filtersDisplay === 'flex',
    JSON.stringify(wallLayout),
  );
  const filtered = await cdp.evaluate(`
    (() => {
      const first = document.querySelector('#wallFilters [data-family]:not([data-family="all"])');
      if (!first) return -1;
      first.click();
      return document.querySelectorAll('#wallGrid .tile').length;
    })()
  `);
  ok(
    'cast-family filters return a non-empty subset',
    allCasts === 15 && filtered > 0 && filtered < allCasts,
    'all=' + allCasts + ', filtered=' + filtered,
  );

  await renderRoute('#/gallery');
  await cdp.evaluate("document.querySelector('#wallFilters [data-family=\"all\"]')?.click(); true;");
  await sleep(180);
  const feature = await cdp.evaluate(`
    (() => {
      const root = document.querySelector('.tile.is-feature [data-et-runtime]');
      const eyes = root ? [...root.querySelectorAll('[data-eye]')] : [];
      const rect = document.querySelector('.tile.is-feature')?.getBoundingClientRect();
      return {
        runtime: Boolean(root),
        eyes: eyes.length,
        polygonEyes: eyes.every((eye) => {
          const d = eye.getAttribute('d') || '';
          return d.startsWith('M') && d.endsWith('Z') && (d.match(/L/g) || []).length >= 11;
        }),
        x: rect ? rect.left + rect.width / 2 : -1,
        y: rect ? rect.top + rect.height / 2 : -1,
      };
    })()
  `);
  ok(
    'featured cast mounts a polygon-eye specimen',
    feature.runtime && feature.eyes === 2 && feature.polygonEyes,
    JSON.stringify(feature),
  );
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: feature.x,
    y: feature.y,
    button: 'left',
    clickCount: 1,
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: feature.x,
    y: feature.y,
    button: 'left',
    clickCount: 1,
  });
  await sleep(220);
  const featureNavigation = await cdp.evaluate('location.hash');
  ok(
    'featured cast owns its pointer hit area and opens the console',
    featureNavigation.startsWith('#/console'),
    featureNavigation,
  );

  // The dialog replaces its body when the expression changes. Replacing the
  // focused arrow used to drop keyboard focus outside the top-layer dialog.
  await renderRoute('#/gallery');
  await cdp.evaluate("document.querySelector('[data-tab=\"emotion\"]').click(); true;");
  await sleep(120);
  const emotionTaxonomy = await cdp.evaluate(`
    JSON.stringify({
      tiles: document.querySelectorAll('#wallGrid .tile').length,
      filters: document.querySelectorAll('#wallFilters [data-family]').length,
      groups: [...new Set([...document.querySelectorAll('#wallGrid [data-state-group]')].map(
        (node) => node.dataset.stateGroup,
      ))],
    })
  `);
  ok(
    'emotion tab exposes the three state groups',
    JSON.parse(emotionTaxonomy).tiles === 61 &&
      JSON.parse(emotionTaxonomy).filters === 4 &&
      JSON.parse(emotionTaxonomy).groups.length === 3,
    emotionTaxonomy,
  );
  const lightboxOpened = await cdp.evaluate(`
    (() => {
      const tile = document.querySelector('#wallGrid [data-state]');
      tile.focus();
      tile.click();
      return Boolean(document.querySelector('dialog.lightbox')?.open);
    })()
  `);
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    windowsVirtualKeyCode: 39,
    key: 'ArrowRight',
    code: 'ArrowRight',
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    windowsVirtualKeyCode: 39,
    key: 'ArrowRight',
    code: 'ArrowRight',
  });
  await sleep(180);
  const lightboxFocusInside = await cdp.evaluate(
    "Boolean(document.activeElement?.closest?.('dialog.lightbox'))",
  );
  ok(
    'gallery lightbox keeps keyboard focus after changing expression',
    lightboxOpened && lightboxFocusInside,
    'open=' + lightboxOpened + ', focusInside=' + lightboxFocusInside,
  );
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    windowsVirtualKeyCode: 27,
    key: 'Escape',
    code: 'Escape',
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    windowsVirtualKeyCode: 27,
    key: 'Escape',
    code: 'Escape',
  });
  await sleep(180);
  const escaped = await cdp.evaluate(`
    JSON.stringify({
      removed: !document.querySelector('dialog.lightbox'),
      focusInGrid: Boolean(document.activeElement?.closest?.('#wallGrid')),
    })
  `);
  ok(
    'gallery lightbox cleans up and restores focus on Escape',
    JSON.parse(escaped).removed && JSON.parse(escaped).focusInGrid,
    escaped,
  );

  await renderRoute('#/scene');
  const sceneLabels = await cdp.evaluate(`
    JSON.stringify(['shuffle', 'party', 'sleep'].map((kind) => {
      const button = document.querySelector('[data-act="' + kind + '"]');
      return button ? button.textContent.trim() : '';
    }))
  `);
  ok(
    'scene actions use their own labels',
    sceneLabels === JSON.stringify(['换一批', '全体开心', '全体入睡']),
    sceneLabels,
  );
  const sceneReset = await cdp.evaluate(`
    (() => {
      document.querySelector('[data-act="error"]').click();
      const before = document.querySelector('#arbiter-owner').textContent;
      const transitions = document.querySelectorAll('.transition-item').length;
      document.querySelector('[data-act="reset"]').click();
      return {
        before,
        transitions,
        owner: document.querySelector('#arbiter-owner').textContent,
        idleSessions: [...document.querySelectorAll('[data-session]')].every(
          (node) => node.dataset.kind === 'idle',
        ),
      };
    })()
  `);
  ok(
    'scene reset clears the face, keeps transition history and resets every source',
    sceneReset.before !== '—' &&
      sceneReset.transitions > 0 &&
      sceneReset.owner === '—' &&
      sceneReset.idleSessions,
    JSON.stringify(sceneReset),
  );

  // Deep link with an expression.
  await renderRoute('#/console?state=happy');
  const stored = await cdp.evaluate("localStorage.getItem('es.look.v3')");
  ok('deep link applies the expression', Boolean(stored && stored.includes('"state":"happy"')), stored?.slice(0, 80) ?? 'no look');

  // Language switch.
  await cdp.evaluate(`document.querySelector('#lang [data-lang="en"]').click(); true;`);
  await sleep(300);
  const english = await cdp.evaluate("document.querySelector('#nav a').textContent + '|' + document.documentElement.lang");
  ok('language switch changes the nav and the lang attribute', /Console|Gallery|Faces|Docs/.test(english) && english.includes('en'), english);

  const themeBefore = await cdp.evaluate("document.documentElement.dataset.mono");
  await cdp.evaluate("document.querySelector('.switch').click(); true;");
  await sleep(120);
  const themeAfter = await cdp.evaluate("document.documentElement.dataset.mono");
  ok('theme switch changes the page colour scheme', themeAfter !== themeBefore, themeBefore + ' → ' + themeAfter);

  await renderRoute('#/console');
  await sleep(250);
  const englishDrawer = await cdp.evaluate(
    "[...document.querySelectorAll('.cast-label')].map((node) => node.textContent).join('|')",
  );
  ok(
    'drawer cast names switch to English',
    englishDrawer.includes('Bread') && englishDrawer.includes('Star') && !englishDrawer.includes('面包'),
    englishDrawer.slice(0, 100),
  );
  const englishIsland = await cdp.evaluate(`
    (() => {
      document.querySelector('.drawer [data-cast="mianbao"]').click();
      return {
        stage: document.querySelector('[data-stage-name]').textContent,
        island: document.querySelector('[data-island-title]').textContent,
      };
    })()
  `);
  ok(
    'console island title follows the selected language and cast',
    englishIsland.stage.includes('Bread') && englishIsland.island === 'Bread',
    JSON.stringify(englishIsland),
  );
  await renderRoute('#/docs');
  const docsEngine = await cdp.evaluate(`
    (() => {
      document.querySelector('[data-engine-state="thinking"]')?.click();
      return JSON.stringify({
        sections: document.querySelectorAll('.sd-section').length,
        toc: document.querySelectorAll('.sd-toc-link').length,
        buttons: document.querySelectorAll('[data-engine-state]').length,
        state: document.querySelector('[data-engine-runtime]')?.getAttribute('data-state'),
      });
    })()
  `);
  ok(
    'docs document and mount the live motion rig',
    JSON.parse(docsEngine).sections === 9 &&
      JSON.parse(docsEngine).toc === 9 &&
      JSON.parse(docsEngine).buttons === 3 &&
      JSON.parse(docsEngine).state === 'thinking',
    docsEngine,
  );
  const englishDocGroups = await cdp.evaluate(`
    JSON.stringify([...document.querySelectorAll('.sd-group-head > span:not(.sd-group-hint)')].map(
      (node) => node.textContent.trim(),
    ))
  `);
  ok(
    'docs protocol groups switch to English',
    englishDocGroups === JSON.stringify(['Lifecycle', 'Feelings', 'Agent work']),
    englishDocGroups,
  );
  await cdp.evaluate(`document.querySelector('#lang [data-lang="zh"]').click(); true;`);

  // Twenty route changes, then a timer census.
  for (let i = 0; i < 20; i += 1) {
    const route = ['#/console', '#/gallery', '#/scene', '#/docs'][i % 4];
    await cdp.evaluate("location.hash = " + JSON.stringify(route) + "; true;");
    await sleep(60);
  }
  await sleep(400);
  const live = await cdp.evaluate('window.__timers.intervals.size');
  ok('no interval survives twenty route changes', live === 0, 'live intervals: ' + live);

  // Scene is the only page that starts intervals; check it cleans up too.
  await renderRoute('#/scene');
  const duringScene = await cdp.evaluate('window.__timers.intervals.size');
  await renderRoute('#/docs');
  await sleep(300);
  const afterScene = await cdp.evaluate('window.__timers.intervals.size');
  ok('scene timers stop when the route changes', duringScene > 0 && afterScene === 0, duringScene + ' → ' + afterScene);

  // 375 px, no horizontal overflow.
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 812,
    deviceScaleFactor: 2,
    mobile: true,
  });
  for (const route of ['#/console', '#/gallery', '#/scene', '#/docs']) {
    await renderRoute(route);
    const overflow = await cdp.evaluate('document.documentElement.scrollWidth - 375');
    ok('no horizontal overflow at 375px: ' + route, overflow <= 0, 'overflow: ' + overflow + 'px');
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride');

  /*
   * Focus ring, reached the way a keyboard user reaches it.
   *
   * focus() from script does not set :focus-visible, so the old check was
   * testing the wrong thing — it failed while the CSS was correct.
   */
  await cdp.evaluate("document.body.focus(); document.querySelector('#nav a').blur(); true;");
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
  await sleep(150);
  const focusStyle = await cdp.evaluate(`
    (() => {
      const active = document.activeElement;
      if (!active || active === document.body) return 'no-focusable-element';
      const style = getComputedStyle(active);
      return (active.tagName + ':' + (active.textContent || '').trim().slice(0, 12)) + ' ' + style.outlineStyle + ' ' + style.outlineWidth;
    })()
  `);
  ok('keyboard focus is visible', !focusStyle.includes('no-focusable') && !focusStyle.includes('none'), focusStyle);
} catch (error) {
  ok('run completed', false, String(error && error.message));
} finally {
  cdp?.close();
  chrome.kill();
  preview.close();
  try {
    rmSync(CHROME_PROFILE, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    // Chrome may still be releasing its profile on Windows; the OS temp
    // directory can clean this up later without affecting the test result.
  }
}

const failed = results.filter((item) => !item.pass);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
process.exit(failed.length === 0 ? 0 : 1);
