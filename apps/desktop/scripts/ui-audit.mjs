#!/usr/bin/env node
/**
 * ui-audit.mjs — measure the UI the tabs are not allowed to lie about.
 *
 * Why this file exists
 * --------------------
 * Every UI round used to start with a fresh throwaway CDP script: measure the
 * island pages, measure the settings pages, repeat under extreme prefs, then
 * throw the script away. The same measurements were written five or six times
 * and the numbers were never comparable between rounds. This is that script,
 * checked in, with the thresholds written down next to the code that applies
 * them.
 *
 * What it measures
 * ----------------
 *   island (10 pages)   .pages is a fixed 217px box with 12px of top padding,
 *                       so 205px of content is visible and 200px is the working
 *                       budget (every page leaves the bottom 5px clear).
 *                       scrollHeight above the box, content that spills out of
 *                       it, text that is clipped without an ellipsis, scroll
 *                       areas that collapsed to zero height, and interactive
 *                       controls under 20px.
 *   settings (14 pages) horizontal overflow of the content column, elements
 *                       that escape their card, clipped text, and controls
 *                       under 20px. The settings window scrolls vertically by
 *                       design, so only the horizontal axis is a bug there.
 *
 * The installed build is the thing being audited: this attaches to the app the
 * user actually runs (LOCALAPPDATA\Programs\@emojitotdesktop\EmojiTot.exe) in
 * a throwaway profile, exactly like the desktop smoke test. The renderer
 * source is never modified.
 *
 * Usage
 * -----
 *   pnpm ui:audit                 # one pass at defaults
 *   pnpm ui:audit -- --stress     # defaults plus mono / weight 600 / scale 140%
 *   pnpm ui:audit -- --json       # machine-readable result on stdout
 *   pnpm ui:audit -- --port 9580  # another CDP port (default 9576)
 *   pnpm ui:audit -- --exe <path> # another installed build
 *   pnpm ui:audit -- --skin solid # one skin; written to prefs.json before launch
 *   pnpm ui:audit -- --skins all  # all five skins, 10 island pages each
 *   pnpm ui:audit -- --skins all --stress  # skin × stress matrix: 5 × 10 island pages
 *
 * A first launch can be measured before the island has a box: every page then
 * reads scrollHeight 0. That pass is relaunched once and the report says
 * "retried"; two zero passes in a row are a violation, never a PASS.
 *
 * Exit code is 1 as soon as one page violates the contract, so this can be a
 * gate. Every failure carries the page, the metric and the offending element.
 *
 * Cleanup is part of the contract: the child process tree and the throwaway
 * profile are removed on success, on violation, on SIGNAL and on uncaught
 * errors. Nothing is left under %TEMP% for the next run to trip over.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_PORT = 9576;
/**
 * The island skins, in shipping order. This list mirrors the 皮肤 row in
 * renderer/settings.js (rowSeg) and DEFAULTS.skin in shared/schema.js; the
 * product has no exported SKINS constant to import, so keep the three in step.
 */
const SKINS = ['frost', 'solid', 'plain', 'magazine', 'console'];
/** The smallest control we are willing to call usable. Documented in docs/UI-AUDIT.md. */
const MIN_CONTROL_HEIGHT = 20;
/** Layout measurements come back fractional; one pixel of dust is not a bug. */
const TOLERANCE = 1;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = resolve(SCRIPT_DIR, '..');

/* --------------------------------------------------------------- manifests */

/**
 * The page lists come from the schema, not from a copy in this file.
 *
 * The island's dots and the settings rail are still read from the running DOM —
 * that is what makes the audit notice a page that failed to render — but the
 * expected counts and titles are the schema's. Adding a page there updates the
 * audit with no edit here; forgetting to expose it in the UI shows up as a
 * count mismatch instead of silently shrinking the audit.
 */
async function loadSchema() {
  const file = pathToFileURL(join(DESKTOP_ROOT, 'src', 'shared', 'schema.js')).href;
  try {
    return await import(file);
  } catch (error) {
    throw new Error('cannot load apps/desktop/src/shared/schema.js: ' + (error?.message ?? error));
  }
}

/* ------------------------------------------------------------------- args */

function defaultExe() {
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return join(process.env.LOCALAPPDATA, 'Programs', '@emojitotdesktop', 'EmojiTot.exe');
  }
  return '';
}

function usage() {
  return [
    'Usage: node apps/desktop/scripts/ui-audit.mjs [options]',
    '',
    '  --stress        measure with mono font, weight 600, 140% scale; combines with --skin/--skins',
    '  --json          print one JSON document on stdout (nothing else on stdout)',
    '  --port <n>      CDP port (default 9576; the default moves to the next free port)',
    '  --exe <path>    installed EmojiTot.exe (default %LOCALAPPDATA%\\Programs\\@emojitotdesktop\\EmojiTot.exe)',
    '  --skin <key>    one island skin: ' + SKINS.join(', '),
    '  --skins all     all five island skins; settings pages are measured once',
    '  -h, --help      this text',
    '',
    '  --skin cannot be combined with --skins.',
    '  --stress with --skins all measures the five-skin matrix: 5 × 10 island pages,',
    '  all at mono / 600 / 140%; the settings pages are still measured once.',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    json: false,
    stress: false,
    port: DEFAULT_PORT,
    exe: process.env.EMOJITOT_APP_EXE || defaultExe(),
    help: false,
    portExplicit: false,
    skin: null,
    skins: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const takeValue = (name) => {
      if (arg.includes('=')) return arg.slice(arg.indexOf('=') + 1);
      index += 1;
      if (index >= argv.length) throw new Error(name + ' needs a value');
      return argv[index];
    };
    if (arg === '--') continue;
    else if (arg === '--json') options.json = true;
    else if (arg === '--stress') options.stress = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--port' || arg.startsWith('--port=')) {
      const value = Number(takeValue('--port'));
      if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error('--port must be an integer between 1 and 65535');
      options.port = value;
      options.portExplicit = true;
    } else if (arg === '--exe' || arg.startsWith('--exe=')) {
      options.exe = takeValue('--exe');
    } else if (arg === '--skin' || arg.startsWith('--skin=')) {
      const value = takeValue('--skin');
      if (!SKINS.includes(value)) {
        throw new Error('--skin must be one of ' + SKINS.join(', ') + ' (got "' + value + '")');
      }
      options.skin = value;
    } else if (arg === '--skins' || arg.startsWith('--skins=')) {
      const value = takeValue('--skins');
      if (value !== 'all') throw new Error('--skins only accepts "all" (got "' + value + '")');
      options.skins = 'all';
    } else {
      throw new Error('unknown argument: ' + arg + '\n\n' + usage());
    }
  }
  if (options.skin && options.skins) throw new Error('--skin and --skins are mutually exclusive');
  options.exe = options.exe ? resolve(options.exe) : '';
  return options;
}

/* ------------------------------------------------------------------- CDP */

/**
 * One browser-level websocket. Page-level sockets accept the handshake but do
 * not answer Runtime.evaluate on this Electron build, so everything is routed
 * through the browser endpoint and Target.attachToTarget(flatten) — the same
 * lesson window-smoke.mjs carries in its header.
 */
class Cdp {
  #ws;
  #id = 0;
  #pending = new Map();
  #listeners = new Map();

  static async connect(url) {
    const cdp = new Cdp();
    cdp.#ws = new WebSocket(url);
    await new Promise((resolveOpen, rejectOpen) => {
      cdp.#ws.addEventListener('open', resolveOpen, { once: true });
      cdp.#ws.addEventListener('error', rejectOpen, { once: true });
    });
    cdp.#ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const pending = cdp.#pending.get(message.id);
        if (!pending) return;
        cdp.#pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message || 'CDP error'));
        else pending.resolve(message.result);
        return;
      }
      if (message.method) {
        for (const handler of cdp.#listeners.get(message.method) ?? []) handler(message);
      }
    });
    return cdp;
  }

  on(method, handler) {
    const list = this.#listeners.get(method) ?? [];
    list.push(handler);
    this.#listeners.set(method, list);
  }

  send(method, params = {}, sessionId, timeoutMs = 20000) {
    const id = ++this.#id;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    this.#ws.send(JSON.stringify(message));
    return new Promise((resolveSend, rejectSend) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        rejectSend(new Error(method + ' timed out after ' + timeoutMs + 'ms'));
      }, timeoutMs);
      this.#pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolveSend(value); },
        reject: (error) => { clearTimeout(timer); rejectSend(error); },
      });
    });
  }

  close() {
    try { this.#ws.close(); } catch { /* already gone */ }
  }
}

async function evaluate(cdp, sessionId, expression, timeoutMs = 20000) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId, timeoutMs);
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'evaluation failed';
    throw new Error(description);
  }
  if (result.result?.subtype === 'error') throw new Error(result.result.description || 'evaluation failed');
  return result.result?.value;
}

async function waitFor(cdp, sessionId, expression, label, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(cdp, sessionId, expression, 5000)) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(120);
  }
  throw new Error('timed out waiting for ' + label + (lastError ? ': ' + lastError.message : ''));
}

async function waitForTarget(cdp, predicate, label, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const target = targetInfos.find(predicate);
    if (target) return target;
    await sleep(200);
  }
  throw new Error('timed out waiting for ' + label);
}

/* --------------------------------------------------------------- in page */

/**
 * The DOM measurement, serialised into the renderer with toString().
 *
 * Everything this function uses must stay inside it (no imports, no closure):
 * it is evaluated in the page, not in Node. It returns two probes so the shared
 * helpers exist once.
 */
function pageProbeFactory(minimumControlHeight) {
  const number = (value) => parseFloat(value) || 0;
  const round = (value) => Math.round(value * 10) / 10;
  const describe = (element) => {
    const classes = typeof element.className === 'string' ? element.className.trim().split(/\s+/).filter(Boolean).join('.') : '';
    const label = element.tagName.toLowerCase() + (element.id ? '#' + element.id : '') + (classes ? '.' + classes : '');
    return label.length > 90 ? label.slice(0, 87) + '...' : label;
  };
  const sample = (element) => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48);
  const visible = (element) => {
    const box = element.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.01;
  };
  const ellipsis = (style) => style.textOverflow === 'ellipsis' && (style.whiteSpace === 'nowrap' || style.whiteSpace === 'pre');
  const clippedByAncestor = (element, stopAt) => {
    const box = element.getBoundingClientRect();
    let node = element.parentElement;
    while (node && node !== stopAt && node !== document.body) {
      const style = getComputedStyle(node);
      const hideX = style.overflowX === 'hidden' || style.overflowX === 'clip';
      const hideY = style.overflowY === 'hidden' || style.overflowY === 'clip';
      if (hideX || hideY) {
        const outer = node.getBoundingClientRect();
        if (
          (hideX && (box.right > outer.right + 1 || box.left < outer.left - 1)) ||
          (hideY && (box.bottom > outer.bottom + 1 || box.top < outer.top - 1))
        ) return true;
      }
      node = node.parentElement;
    }
    return false;
  };
  /**
   * Text that is cut off without an ellipsis is a bug; an ellipsis is the
   * acknowledgement that the text does not fit. Only elements that own a text
   * node count, so a decorative wrapper with hidden overflow is not reported.
   */
  const clippedText = (root, stopAt) => {
    const found = [];
    const elements = [...root.querySelectorAll('*')].filter((element) =>
      [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim()),
    );
    for (const element of elements) {
      if (!visible(element)) continue;
      const style = getComputedStyle(element);
      if (!ellipsis(style) && (style.overflowX === 'hidden' || style.overflowX === 'clip' || style.overflowY === 'hidden' || style.overflowY === 'clip')) {
        const horizontal = element.scrollWidth > element.clientWidth + 1;
        const vertical = element.scrollHeight > element.clientHeight + 1;
        if (horizontal || vertical) {
          found.push({ element: describe(element), axis: horizontal ? 'x' : 'y', text: sample(element) });
          continue;
        }
      }
      const box = element.getBoundingClientRect();
      let node = element.parentElement;
      while (node && node !== stopAt && node !== document.body) {
        const outerStyle = getComputedStyle(node);
        const hideX = outerStyle.overflowX === 'hidden' || outerStyle.overflowX === 'clip';
        const hideY = outerStyle.overflowY === 'hidden' || outerStyle.overflowY === 'clip';
        if ((hideX || hideY) && !ellipsis(outerStyle)) {
          const outer = node.getBoundingClientRect();
          const x = hideX && (box.right > outer.right + 1 || box.left < outer.left - 1);
          const y = hideY && (box.bottom > outer.bottom + 1 || box.top < outer.top - 1);
          if (x || y) {
            found.push({ element: describe(element), by: describe(node), axis: x ? 'x' : 'y', text: sample(element) });
            break;
          }
        }
        node = node.parentElement;
      }
    }
    return found;
  };
  const smallControls = (root) => {
    const found = [];
    for (const element of root.querySelectorAll('button, input, select, textarea, a[href], [role="button"]')) {
      if (!visible(element)) continue;
      const box = element.getBoundingClientRect();
      if (box.height < minimumControlHeight) found.push({ element: describe(element), height: round(box.height), width: round(box.width), text: sample(element) });
    }
    return found;
  };
  const horizontalOverflow = (root, bounds, stopAt) => {
    const found = [];
    for (const element of root.querySelectorAll('*')) {
      if (!visible(element)) continue;
      const box = element.getBoundingClientRect();
      const right = box.right - bounds.right;
      const left = bounds.left - box.left;
      if (right <= 1 && left <= 1) continue;
      if (clippedByAncestor(element, stopAt)) continue;
      found.push({ element: describe(element), left: round(left), right: round(right), text: sample(element) });
    }
    return found;
  };

  function island() {
    const pages = document.getElementById('pages');
    if (!pages) throw new Error('missing #pages');
    const box = pages.getBoundingClientRect();
    const style = getComputedStyle(pages);
    const paddingTop = number(style.paddingTop);
    const paddingBottom = number(style.paddingBottom);
    const paddingLeft = number(style.paddingLeft);
    const paddingRight = number(style.paddingRight);
    const contentTop = box.top + paddingTop;
    const contentBottom = box.bottom - paddingBottom;
    const contentLeft = box.left + paddingLeft;
    const contentRight = box.right - paddingRight;
    const available = contentBottom - contentTop;
    let used = 0;
    for (const child of pages.children) {
      const childBox = child.getBoundingClientRect();
      if (childBox.height > 0) used = Math.max(used, childBox.bottom - contentTop);
    }
    const bounds = { left: contentLeft, right: contentRight };
    const scrollZones = [];
    for (const element of pages.querySelectorAll('*')) {
      const zoneStyle = getComputedStyle(element);
      if ((zoneStyle.overflowY === 'auto' || zoneStyle.overflowY === 'scroll') && element.clientHeight === 0 && element.scrollHeight > 0) {
        scrollZones.push(describe(element));
      }
    }
    return {
      boxHeight: round(box.height),
      clientHeight: pages.clientHeight,
      scrollHeight: pages.scrollHeight,
      scrollWidth: pages.scrollWidth,
      clientWidth: pages.clientWidth,
      paddingTop: round(paddingTop),
      availableHeight: round(available),
      usedHeight: round(used),
      horizontalOverflow: horizontalOverflow(pages, bounds, pages),
      clippedText: clippedText(pages, pages),
      zeroScrollZones: scrollZones,
      smallControls: smallControls(pages),
    };
  }

  function settings() {
    const content = document.getElementById('content');
    if (!content) throw new Error('missing #content');
    const box = content.getBoundingClientRect();
    const style = getComputedStyle(content);
    const contentLeft = box.left + number(style.paddingLeft);
    const contentRight = box.right - number(style.paddingRight);
    const bounds = { left: contentLeft, right: contentRight };
    const cardOverflow = [];
    for (const element of content.querySelectorAll('*')) {
      if (!visible(element)) continue;
      const card = element.closest('.card');
      if (!card || card === element) continue;
      const cardBox = card.getBoundingClientRect();
      const elementBox = element.getBoundingClientRect();
      const right = elementBox.right - cardBox.right;
      const left = cardBox.left - elementBox.left;
      if (right > 1 || left > 1) {
        cardOverflow.push({ element: describe(element), left: round(left), right: round(right), text: sample(element) });
      }
    }
    return {
      contentClientWidth: content.clientWidth,
      contentScrollWidth: content.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      innerWidth,
      zoom: document.documentElement.style.zoom || '1',
      horizontalOverflow: horizontalOverflow(content, bounds, content),
      cardOverflow,
      clippedText: clippedText(content, content),
      smallControls: smallControls(content),
    };
  }

  return { island, settings };
}

/* -------------------------------------------------------------- launch */

function seedPrefs(stress, skin) {
  const keys = schema.PAGE_MANIFEST.map((page) => page.key);
  const prefs = {
    displayMode: 'island',
    /* The skin is written before launch, not switched at runtime: a fresh
       profile then measures exactly what prefs.json asked the build to draw. */
    skin: skin ?? 'frost',
    pages: Object.fromEntries(keys.map((key) => [key, true])),
    pageOrder: keys,
    defaultPage: 'music',
    /* Measuring a page is not the same as watching it appear: turn the open and
       page-swap animations off so the first layout is the measured layout. */
    motion: false,
    reduceMotion: true,
    /* Auto-avoid can collapse the panel when another window covers it. It only
       hides the island; it has no opinion about the layout being measured. */
    avoidEnabled: false,
    font: 'system',
    weight: 400,
    uiScale: 100,
  };
  if (stress) {
    prefs.font = 'mono';
    prefs.weight = 600;
    prefs.uiScale = 140;
  }
  return prefs;
}

async function portServesCdp(port) {
  try {
    const response = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(500) });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 9576 is the documented default, but this machine often has another EmojiTot
 * dev instance with remote debugging on it (the main checkout, a smoke run, a
 * previous audit). Moving to the next free port keeps "pnpm ui:audit" a no-arg
 * command instead of teaching everyone to hand-pick a port. An explicit --port
 * is still honoured literally.
 */
async function freePort(start) {
  for (let candidate = start; candidate < start + 10; candidate += 1) {
    if (!(await portServesCdp(candidate))) return candidate;
  }
  throw new Error('ports ' + start + '-' + (start + 9) + ' are all serving CDP; pass --port <other>.');
}

function forceKillTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    /* /T matters: Electron is a main process plus renderer, GPU and utility
       children, and killing only the parent leaves those windows alive. */
    try { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* already gone */ }
  } else {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

let activeChild = null;
let activeProfile = null;

function cleanupSync() {
  const child = activeChild;
  const profile = activeProfile;
  activeChild = null;
  activeProfile = null;
  if (child && child.exitCode === null) forceKillTree(child.pid);
  if (profile) {
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* best effort on exit */ }
  }
}

process.on('exit', cleanupSync);
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
  process.on(signal, () => {
    cleanupSync();
    process.exit(code);
  });
}

async function launchApp(options) {
  if (!options.exe || !existsSync(options.exe)) {
    throw new Error(
      'installed EmojiTot.exe not found' + (options.exe ? ' at ' + options.exe : '') +
      '. Build and install it, or pass --exe <path>.',
    );
  }
  if (await portServesCdp(options.port)) {
    throw new Error(
      'port ' + options.port + ' already serves a CDP endpoint. Stop that app/audit, or pass --port <other>.',
    );
  }

  const profile = mkdtempSync(join(tmpdir(), 'emojitot-ui-audit-'));
  const prefs = seedPrefs(options.stress, options.skin);
  writeFileSync(join(profile, 'prefs.json'), JSON.stringify(prefs, null, 2), 'utf8');

  /* The DSH session exports ELECTRON_RUN_AS_NODE=1. Without deleting it,
     Electron runs as a plain Node process: no window, no CDP page, exit 0.
     That is the single most confusing failure mode of this script. */
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ATTACH_CONSOLE;

  const child = spawn(options.exe, ['--remote-debugging-port=' + options.port, '--user-data-dir=' + profile], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  activeChild = child;
  activeProfile = profile;

  let output = '';
  const append = (chunk) => { output = (output + chunk.toString()).slice(-8000); };
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
  child.on('error', (error) => { output += '\n[spawn] ' + error.message; });

  try {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error('EmojiTot exited before CDP was ready (code ' + child.exitCode + ').\n' + output);
      }
      try {
        const response = await fetch('http://127.0.0.1:' + options.port + '/json/version', { signal: AbortSignal.timeout(700) });
        if (response.ok) return { child, profile, prefs };
      } catch { /* not up yet */ }
      await sleep(250);
    }
    throw new Error('timed out waiting for the CDP endpoint on port ' + options.port + '.\n' + output);
  } catch (error) {
    /* A launch that never reached CDP still owns a profile and (possibly) a
       process. Clean both before the error travels up, so a failed run does
       not leave a locked %TEMP% directory for the next one. */
    await stopApp(child, profile);
    throw error;
  }
}

async function stopApp(child, profile) {
  if (child && child.exitCode === null) {
    forceKillTree(child.pid);
    const deadline = Date.now() + 5000;
    while (child.exitCode === null && Date.now() < deadline) await sleep(100);
  }
  if (activeChild === child) activeChild = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      rmSync(profile, { recursive: true, force: true });
      if (activeProfile === profile) activeProfile = null;
      return true;
    } catch {
      await sleep(250);
    }
  }
  if (activeProfile === profile) activeProfile = null;
  console.error('[ui-audit] warning: could not remove the temporary profile ' + profile);
  return false;
}

/* --------------------------------------------------------------- audit */

function issue(code, message, detail) {
  return { code, message, detail };
}

const surfaces = new Map();
function surfaceOf(sessionId) {
  return surfaces.get(sessionId) || 'unknown';
}

async function auditIsland(cdp, sessionId, errors, label) {
  /* A synthetic pointerdown on the pill is the documented way in (the desktop
     smoke test does the same); retry because a fresh profile can still be
     loading island.js when the first event lands. */
  let opened = false;
  for (let attempt = 0; attempt < 24 && !opened; attempt += 1) {
    opened = Boolean(await evaluate(cdp, sessionId, [
      "(() => {",
      "  const panel = document.getElementById('panel');",
      "  if (panel && !panel.hidden && document.querySelectorAll('#dots button').length) return true;",
      "  const pill = document.getElementById('pill');",
      "  if (pill) pill.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));",
      "  return false;",
      "})()",
    ].join('\n')));
    if (!opened) await sleep(250);
  }
  if (!opened) throw new Error('island panel did not open');
  await sleep(700);
  await waitFor(cdp, sessionId, "document.querySelectorAll('#dots button').length > 0", 'island dots');

  const dots = JSON.parse(await evaluate(cdp, sessionId,
    "JSON.stringify([...document.querySelectorAll('#dots button')].map((button) => button.getAttribute('aria-label') || ''))"));
  console.error('[ui-audit] ' + label + ': island ' + dots.length + ' pages');
  const expected = schema.PAGE_MANIFEST;
  const pages = [];
  const issues = [];
  let consumedErrors = 0;
  if (dots.length !== expected.length) {
    issues.push(issue('page-count', '岛应有 ' + expected.length + ' 页，实际 ' + dots.length + ' 页'));
  }

  for (let index = 0; index < dots.length; index += 1) {
    const title = dots[index];
    const manifest = expected.find((page) => page.title === title) ?? expected[index];
    const page = { index, key: manifest?.key ?? null, title, issues: [], metrics: null };
    console.error('[ui-audit] ' + label + ': island ' + (index + 1) + '/' + dots.length + ' ' + title);
    try {
      await evaluate(cdp, sessionId, 'document.querySelectorAll(\'#dots button\')[' + index + '].click()');
      await waitFor(cdp, sessionId, 'document.getElementById(\'page-name\')?.textContent === ' + JSON.stringify(title), 'island page ' + title);
      await sleep(380);
      const raw = await evaluate(cdp, sessionId, 'JSON.stringify((' + pageProbeFactory.toString() + ')(' + MIN_CONTROL_HEIGHT + ').island())', 30000);
      const metrics = JSON.parse(raw);
      page.metrics = metrics;
      const overflow = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
      const usedOverflow = Math.max(0, metrics.usedHeight - metrics.availableHeight);
      if (overflow > TOLERANCE || usedOverflow > TOLERANCE) {
        page.issues.push(issue(
          'vertical-overflow',
          '内容超出可视区：scrollHeight ' + metrics.scrollHeight + ' > ' + metrics.clientHeight +
            '（可用 ' + metrics.availableHeight + 'px，实际占用 ' + metrics.usedHeight + 'px）',
        ));
      }
      if (metrics.scrollWidth > metrics.clientWidth + TOLERANCE) {
        page.issues.push(issue('horizontal-overflow', '页面横向溢出 ' + (metrics.scrollWidth - metrics.clientWidth) + 'px'));
      }
      if (metrics.horizontalOverflow.length) {
        page.issues.push(issue('horizontal-overflow', metrics.horizontalOverflow.length + ' 个元素越出内容盒的左右边', metrics.horizontalOverflow));
      }
      if (metrics.clippedText.length) {
        page.issues.push(issue('clipped-text', metrics.clippedText.length + ' 处文字被裁且没有省略号', metrics.clippedText));
      }
      if (metrics.zeroScrollZones.length) {
        page.issues.push(issue('zero-scroll', metrics.zeroScrollZones.length + ' 个滚动区高度为 0', metrics.zeroScrollZones));
      }
      if (metrics.smallControls.length) {
        page.issues.push(issue('small-control', metrics.smallControls.length + ' 个控件低于 ' + MIN_CONTROL_HEIGHT + 'px', metrics.smallControls));
      }
    } catch (error) {
      page.issues.push(issue('page-error', '测量失败：' + error.message));
    }
    for (const error of errors.slice(consumedErrors)) {
      page.issues.push(issue('page-error', '页面异常：' + error.text));
    }
    consumedErrors = errors.length;
    pages.push(page);
    issues.push(...page.issues);
  }

  for (const error of errors.slice(consumedErrors)) {
    issues.push(issue('page-error', '页面异常：' + error.text));
  }
  return { expectedPages: expected.length, foundPages: dots.length, pages, issues };
}

async function openSettings(cdp, islandSessionId, label) {
  await evaluate(cdp, islandSessionId, 'window.islandAPI.openSettings()');
  const target = await waitForTarget(cdp, (item) => item.type === 'page' && item.url.includes('settings.html'), 'settings window');
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  surfaces.set(sessionId, 'settings');
  await cdp.send('Runtime.enable', {}, sessionId);
  await waitFor(cdp, sessionId, "document.querySelectorAll('#rail .rail-item').length > 0 && !!document.getElementById('content')", 'settings rail');
  await sleep(400);
  console.error('[ui-audit] ' + label + ': settings window ready');
  return sessionId;
}

async function auditSettings(cdp, sessionId, errors, label) {
  const rail = JSON.parse(await evaluate(cdp, sessionId,
    "JSON.stringify([...document.querySelectorAll('#rail .rail-item')].map((button) => ({ key: button.dataset.nav || '', label: (button.textContent || '').trim() })))"));
  console.error('[ui-audit] ' + label + ': settings ' + rail.length + ' pages');
  const expected = schema.SETTINGS_NAV.flatMap((group) => group.items);
  const pages = [];
  const issues = [];
  let consumedErrors = 0;
  if (rail.length !== expected.length) {
    issues.push(issue('page-count', '设置窗应有 ' + expected.length + ' 页，实际 ' + rail.length + ' 页'));
  }

  for (let index = 0; index < rail.length; index += 1) {
    const item = rail[index];
    const page = { index, key: item.key, label: item.label, issues: [], metrics: null };
    console.error('[ui-audit] ' + label + ': settings ' + (index + 1) + '/' + rail.length + ' ' + item.label);
    try {
      const selector = '#rail .rail-item[data-nav=' + JSON.stringify(item.key) + ']';
      await evaluate(cdp, sessionId, 'document.querySelector(' + JSON.stringify(selector) + ')?.click()');
      await waitFor(cdp, sessionId, "document.querySelector('#rail .rail-item[aria-current=\"true\"]')?.dataset.nav === " + JSON.stringify(item.key), 'settings page ' + item.key);
      await sleep(380);
      const raw = await evaluate(cdp, sessionId, 'JSON.stringify((' + pageProbeFactory.toString() + ')(' + MIN_CONTROL_HEIGHT + ').settings())', 30000);
      const metrics = JSON.parse(raw);
      page.metrics = metrics;
      if (metrics.contentScrollWidth > metrics.contentClientWidth + TOLERANCE ||
          metrics.documentScrollWidth > metrics.documentClientWidth + TOLERANCE) {
        page.issues.push(issue('horizontal-overflow',
          '设置页横向溢出：内容 ' + metrics.contentScrollWidth + '/' + metrics.contentClientWidth +
          '，文档 ' + metrics.documentScrollWidth + '/' + metrics.documentClientWidth));
      }
      if (metrics.horizontalOverflow.length) {
        page.issues.push(issue('horizontal-overflow', metrics.horizontalOverflow.length + ' 个元素越出内容列的左右边', metrics.horizontalOverflow));
      }
      if (metrics.cardOverflow.length) {
        page.issues.push(issue('card-overflow', metrics.cardOverflow.length + ' 个元素越出卡片', metrics.cardOverflow));
      }
      if (metrics.clippedText.length) {
        page.issues.push(issue('clipped-text', metrics.clippedText.length + ' 处文字被裁且没有省略号', metrics.clippedText));
      }
      if (metrics.smallControls.length) {
        page.issues.push(issue('small-control', metrics.smallControls.length + ' 个控件低于 ' + MIN_CONTROL_HEIGHT + 'px', metrics.smallControls));
      }
    } catch (error) {
      page.issues.push(issue('page-error', '测量失败：' + error.message));
    }
    for (const error of errors.slice(consumedErrors)) {
      page.issues.push(issue('page-error', '页面异常：' + error.text));
    }
    consumedErrors = errors.length;
    pages.push(page);
    issues.push(...page.issues);
  }

  for (const error of errors.slice(consumedErrors)) {
    issues.push(issue('page-error', '页面异常：' + error.text));
  }
  return { expectedPages: expected.length, foundPages: rail.length, pages, issues };
}

async function runPass(options, name, skin, measureSettings, stress) {
  const passOptions = { ...options, stress: Boolean(stress), skin };
  const { child, profile, prefs } = await launchApp(passOptions);
  let browser = null;
  const errors = [];
  surfaces.clear();
  try {
    const version = await (await fetch('http://127.0.0.1:' + options.port + '/json/version')).json();
    browser = await Cdp.connect(version.webSocketDebuggerUrl);
    browser.on('Runtime.exceptionThrown', (message) => {
      const details = message.params?.exceptionDetails ?? {};
      const text = details.exception?.description || details.text || 'uncaught exception';
      errors.push({ surface: surfaceOf(message.sessionId), text: String(text).split('\n')[0].slice(0, 300) });
    });

    const islandTarget = await waitForTarget(browser, (item) => item.type === 'page' && item.url.includes('island.html'), 'island window');
    const islandSession = (await browser.send('Target.attachToTarget', { targetId: islandTarget.targetId, flatten: true })).sessionId;
    surfaces.set(islandSession, 'island');
    await browser.send('Runtime.enable', {}, islandSession);
    await waitFor(browser, islandSession, "document.readyState === 'complete' && typeof window.islandAPI === 'object' && !!document.getElementById('pill')", 'island ready');
    await sleep(900);

    /*
     * A skin is only audited once the build has actually applied it. An
     * unknown value silently falls back to frost, and a report under the
     * wrong heading is worse than no report: the numbers would describe a
     * layout nobody asked about.
     */
    if (skin) {
      const applied = await evaluate(browser, islandSession, 'document.body.dataset.skin');
      if (applied !== skin) {
        throw new Error('skin "' + skin + '" did not apply: body[data-skin]="' + applied + '" — this build may not ship that skin');
      }
    }

    const island = await auditIsland(browser, islandSession, errors, name);
    let settings = null;
    /*
     * Skins only restyle the island window; the settings window keeps one
     * layout. So --skins all measures the 14 settings pages once, on the
     * first skin, instead of re-reading the same layout five times.
     */
    if (measureSettings) {
      const settingsSession = await openSettings(browser, islandSession, name);
      settings = await auditSettings(browser, settingsSession, errors, name);
    }
    const allIssues = [...island.issues, ...(settings?.issues ?? [])];
    return {
      name,
      skin: skin ?? prefs.skin ?? 'frost',
      stress: Boolean(stress),
      prefs,
      island,
      settings,
      settingsMeasured: measureSettings,
      errors,
      issues: allIssues,
    };
  } finally {
    browser?.close();
    await stopApp(child, profile);
  }
}

/**
 * Did this pass measure a window that had not been laid out yet?
 *
 * A first launch can reach CDP before the island has a box: the panel answers
 * every DOM query, but it is still display:none, so `.pages` measures 0 on all
 * ten pages. That is not a layout, it is a window that never got ready — and
 * reporting it as PASS would publish ten zeros as if they were measurements.
 * The pass is relaunched once; two zero passes in a row are a real failure.
 */
function windowNotReady(pass) {
  const pages = pass.island?.pages ?? [];
  return pages.length > 0 && pages.every((page) => page.metrics && page.metrics.scrollHeight === 0);
}

/* --------------------------------------------------------------- output */

const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;
const displayWidth = (text) => [...String(text)].reduce((width, character) => width + (WIDE.test(character) ? 2 : 1), 0);
const pad = (text, width) => String(text) + ' '.repeat(Math.max(0, width - displayWidth(text)));
const verdict = (page) => (page.issues.length ? 'FAIL (' + page.issues.length + ')' : 'ok');
const detailOf = (item) => {
  const first = Array.isArray(item.detail) ? item.detail[0] : null;
  if (!first) return '';
  const name = first.element || '';
  const height = first.height !== undefined ? ' h=' + first.height : '';
  const text = first.text ? ' "' + first.text + '"' : '';
  return ' — ' + name + height + text;
};

function printPass(pass, skinsMode, settingsMeasuredOn) {
  const island = pass.island;
  const settings = pass.settings;
  const first = island.pages.find((page) => page.metrics)?.metrics;
  /* A stressed skin pass is not "the stress pass, on frost": name it by both
     axes so no line of the report can be read under the wrong prefs. */
  const heading = pass.stress && pass.name === pass.skin
    ? pass.skin + ' @ stress'
    : pass.name + (pass.name === pass.skin ? '' : ' · skin ' + pass.skin);
  console.log('');
  console.log('== ' + heading +
    ' · ' + pass.prefs.font + ' / ' + pass.prefs.weight + ' / ' + pass.prefs.uiScale + '%');
  /* A relaunched pass has to say so: its numbers came from the second launch,
     and a reader comparing two reports must be able to see why they differ. */
  if (pass.retried) console.log('  retried: the first launch had not laid the window out yet (ten pages measured 0)');
  console.log('');
  console.log('Island · ' + island.foundPages + '/' + island.expectedPages + ' pages · .pages ' +
    (first ? first.boxHeight + 'px − ' + first.paddingTop + 'px padding = ' + first.availableHeight + 'px available' : 'n/a'));
  console.log('  ' + pad('#', 3) + pad('page', 12) + pad('key', 11) + pad('scroll', 8) + pad('used/avail', 12) +
    pad('h-overflow', 11) + pad('clipped', 9) + pad('zero', 6) + pad('small', 7) + 'verdict');
  for (const page of island.pages) {
    const m = page.metrics;
    const used = m ? Math.round(m.usedHeight) + '/' + Math.round(m.availableHeight) : '-';
    console.log('  ' + pad(String(page.index + 1), 3) + pad(page.title, 12) + pad(page.key || '-', 11) +
      pad(m ? m.scrollHeight : '-', 8) + pad(used, 12) +
      pad(m ? m.horizontalOverflow.length : '-', 11) +
      pad(m ? m.clippedText.length : '-', 9) +
      pad(m ? m.zeroScrollZones.length : '-', 6) +
      pad(m ? m.smallControls.length : '-', 7) + verdict(page));
  }

  console.log('');
  if (settings) {
    console.log('Settings · ' + settings.foundPages + '/' + settings.expectedPages + ' pages · 1080×760 window');
    console.log('  ' + pad('#', 3) + pad('page', 18) + pad('key', 12) + pad('content', 12) +
      pad('h-overflow', 11) + pad('card', 7) + pad('clipped', 9) + pad('small', 7) + 'verdict');
    for (const page of settings.pages) {
      const m = page.metrics;
      console.log('  ' + pad(String(page.index + 1), 3) + pad(page.label, 18) + pad(page.key, 12) +
        pad(m ? m.contentScrollWidth + '/' + m.contentClientWidth : '-', 12) +
        pad(m ? m.horizontalOverflow.length : '-', 11) +
        pad(m ? m.cardOverflow.length : '-', 7) +
        pad(m ? m.clippedText.length : '-', 9) +
        pad(m ? m.smallControls.length : '-', 7) + verdict(page));
    }
  } else {
    const measuredOn = settingsMeasuredOn
      ? settingsMeasuredOn.skin + (settingsMeasuredOn.stress ? ' @ stress' : '')
      : 'the first skin';
    console.log('Settings · skipped — measured once on ' + measuredOn +
      ' (skins restyle the island window only)');
  }

  const settingsIssues = settings?.issues ?? [];
  const surfaceIssues = [
    ...island.issues.filter((item) => item.code === 'page-count' || item.code === 'window-not-ready' ||
      (item.code === 'page-error' && !island.pages.some((page) => page.issues.includes(item)))),
    ...settingsIssues.filter((item) => item.code === 'page-count' || (item.code === 'page-error' && !settings.pages.some((page) => page.issues.includes(item)))),
  ];
  if (pass.issues.length) {
    console.log('');
    console.log('Violations');
    let shown = 0;
    for (const item of surfaceIssues) {
      if (shown >= 24) { console.log('  ...'); break; }
      console.log('  - ' + item.message);
      shown += 1;
    }
    for (const surface of [island, settings].filter(Boolean)) {
      for (const page of surface.pages) {
        for (const item of page.issues) {
          if (shown >= 24) { console.log('  ...'); break; }
          const label = page.title ?? page.label ?? page.key ?? page.index;
          console.log('  - [' + label + '] ' + item.message + detailOf(item));
          shown += 1;
        }
      }
    }
  }
  console.log('');
  const measured = island.foundPages + (settings ? settings.foundPages : 0);
  console.log((pass.issues.length ? 'FAIL  ' : 'PASS  ') + measured + ' pages, ' + pass.issues.length + ' violation(s)');
}

/** Skin × page scrollHeight, the one table that makes five passes comparable. */
function printSkinTable(passes, stress) {
  const skins = passes.filter((pass) => pass.skin);
  if (!skins.length) return;
  const pageCount = Math.max(...skins.map((pass) => pass.island.pages.length));
  const width = Math.max(4, ...skins.map((pass) => displayWidth(pass.skin))) + 2;
  console.log('');
  console.log('Skins' + (stress ? ' @ stress' : '') + ' · island .pages scrollHeight (px) · contract ≤ 217');
  if (stress) console.log('  all skins measured at mono / 600 / 140%');
  console.log('  ' + pad('page', 12) + skins.map((pass) => pad(pass.skin, width)).join(''));
  for (let index = 0; index < pageCount; index += 1) {
    const title = skins[0].island.pages[index]?.title ?? '-';
    console.log('  ' + pad(title, 12) + skins.map((pass) => {
      const metrics = pass.island.pages[index]?.metrics;
      return pad(metrics ? String(metrics.scrollHeight) : '-', width);
    }).join(''));
  }
  console.log('  ' + pad('verdict', 12) + skins.map((pass) => pad(pass.issues.length ? 'FAIL' : 'ok', width)).join(''));
}

/* ---------------------------------------------------------------- main */

let schema = null;
let jsonMode = false;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  jsonMode = options.json;
  if (!options.portExplicit) {
    const requested = options.port;
    options.port = await freePort(requested);
    if (options.port !== requested) console.error('[ui-audit] port ' + requested + ' is busy; using ' + options.port);
  }
  schema = await loadSchema();
  const skinsMode = Boolean(options.skin || options.skins);
  const skinPlan = options.skins === 'all' ? SKINS : (options.skin ? [options.skin] : []);
  const passNames = options.stress ? ['default', 'stress'] : ['default'];
  /*
   * One skin per launch: the profile is seeded with that skin and the app is
   * started again for the next one. Measuring a skin from a profile that never
   * asked for it would make "frost" and "console" the same picture.
   */
  const plan = skinsMode
    ? skinPlan.map((skin, index) => ({ name: skin, skin, stress: options.stress, measureSettings: index === 0 }))
    : passNames.map((name) => ({ name, skin: null, stress: name === 'stress', measureSettings: true }));
  const report = {
    tool: 'ui-audit',
    generatedAt: new Date().toISOString(),
    exe: options.exe,
    port: options.port,
    passes: [],
    issues: [],
    ok: true,
  };
  if (skinsMode) report.skins = {};

  const passes = [];
  for (const item of plan) {
    console.error('[ui-audit] ' + item.name + ' pass: launching ' + options.exe);
    let pass;
    let retried = false;
    try {
      pass = await runPass(options, item.name, item.skin, item.measureSettings, item.stress);
      /* The launch is the flaky part, not the page: when all ten pages read
         scrollHeight 0 nothing was laid out, so relaunch this skin once
         instead of reporting zeros. The retry is marked on the pass and in
         the console, and the second zero pass is the failure. */
      if (windowNotReady(pass)) {
        retried = true;
        console.error('[ui-audit] ' + item.name + ': all ten island pages measured scrollHeight 0 — window not ready, relaunching this pass once (retried)');
        pass = await runPass(options, item.name, item.skin, item.measureSettings, item.stress);
        pass.retried = true;
        if (windowNotReady(pass)) {
          const notReady = issue('window-not-ready',
            '窗口未就绪：十页 scrollHeight 全为 0，自动重启该皮肤一次后仍为 0');
          pass.issues.push(notReady);
          pass.island.issues.push(notReady);
        }
      }
    } catch (error) {
      /* One skin that cannot start must not erase the four that already did:
         the failure becomes a FAIL report for that skin and the run goes on. */
      console.error('[ui-audit] ' + item.name + ': ' + (error?.stack || error?.message || error));
      pass = failedPass(item.name, item.skin, error, item.stress);
      if (retried) pass.retried = true;
    }
    passes.push(pass);
    report.passes.push(stripPass(pass));
    report.issues.push(...pass.issues.map((entry) => ({ pass: item.name, ...entry })));
    if (skinsMode) report.skins[pass.skin] = { ...stripPass(pass), settingsMeasured: pass.settingsMeasured };
    if (!options.json) printPass(pass, skinsMode, passes.find((item) => item.settingsMeasured));
  }

  if (skinsMode) {
    report.settingsMeasuredOn = passes.find((pass) => pass.settingsMeasured)?.skin ?? null;
    report.notes = [
      'settings pages are measured once, on ' + report.settingsMeasuredOn +
        ': skins restyle the island window only, the settings window keeps one layout',
    ];
    if (options.stress) {
      report.notes.push('every skin pass ran at mono / 600 / 140% (the stress prefs)');
    }
  }

  report.ok = report.issues.length === 0;
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    if (skinsMode) printSkinTable(passes, options.stress);
    console.log('');
    const islandPages = passes.reduce((total, pass) => total + pass.island.foundPages, 0);
    const settingsPages = passes.reduce((total, pass) => total + (pass.settings ? pass.settings.foundPages : 0), 0);
    const failedSkins = [...new Set(passes.filter((pass) => pass.issues.length).map((pass) => pass.skin))];
    const scope = skinsMode
      ? passes.length + ' skins' + (options.stress ? ' @ stress' : '') + ' · ' +
        islandPages + ' island pages · ' + settingsPages + ' settings pages'
      : islandPages + settingsPages + ' pages';
    const blame = skinsMode && failedSkins.length
      ? ' — ' + failedSkins.join(', ') + (failedSkins.length === 1 ? ' has violations' : ' have violations')
      : '';
    console.log((report.ok ? 'PASS  ' : 'FAIL  ') + scope + ', ' + report.issues.length + ' violation(s)' + blame);
  }
  process.exitCode = report.ok ? 0 : 1;
}

/** A pass that never produced measurements still has to fail the run loudly. */
function failedPass(name, skin, error, stress = false) {
  const failure = issue('pass-error', '本轮未完成：' + (error?.message ?? error));
  return {
    name,
    skin: skin ?? 'frost',
    stress: Boolean(stress),
    prefs: seedPrefs(stress, skin),
    island: { expectedPages: schema.PAGE_MANIFEST.length, foundPages: 0, pages: [], issues: [failure] },
    settings: null,
    settingsMeasured: false,
    errors: [],
    issues: [failure],
  };
}

/** Keep the JSON result bounded: each detail list already carries examples. */
function stripPass(pass) {
  return {
    name: pass.name,
    retried: Boolean(pass.retried),
    stress: Boolean(pass.stress),
    prefs: pass.prefs,
    island: pass.island,
    settings: pass.settings,
    errors: pass.errors,
    violations: pass.issues.length,
  };
}

main().catch((error) => {
  console.error('[ui-audit] ' + (error?.stack || error?.message || error));
  if (jsonMode) {
    console.log(JSON.stringify({ tool: 'ui-audit', ok: false, error: String(error?.message || error) }, null, 2));
  }
  process.exitCode = 1;
}).finally(() => {
  cleanupSync();
});
