#!/usr/bin/env node
/**
 * Capture the real renderer (not a static mock) for visual review.
 *
 * The desktop smoke test proves behavior and the UI audit measures layout, but
 * neither leaves page-by-page images for design comparison. This script runs
 * the source app in a throwaway profile and writes one PNG for the collapsed
 * pill, every island page, and every settings page.
 *
 * Usage:
 *   pnpm --filter @emojitot/desktop capture:ui -- --out <directory> [--theme light]
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { resolveElectronBinary } from './electron-runtime.mjs';
import { createMasterFixture } from '../src/renderer/island-fixtures.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(SCRIPT_DIR, '..');
const PORT = 9581;
const MASTER_ARTBOARD = join(
  process.env.USERPROFILE || '',
  '.codex',
  'visualizations',
  '2026',
  '11',
  '24',
  '01a20af5-3034-71d3-b9f2-f2324ff75e5d',
  'polar-graphite-master.html',
);

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const outputDir = resolve(argValue('--out', join(APP_DIR, '.ui-capture')));
const requestedTheme = argValue('--theme', 'dark');
const theme = ['dark', 'light', 'system'].includes(requestedTheme) ? requestedTheme : 'dark';
const includeAvoid = process.argv.includes('--avoid');
const profileDir = mkdtempSync(join(tmpdir(), 'emojitot-ui-capture-'));
const electron = resolveElectronBinary();

function readMasterAlbumArt() {
  if (!existsSync(MASTER_ARTBOARD)) return '';
  const source = readFileSync(MASTER_ARTBOARD, 'utf8');
  return source.match(/<img class="pgm-true-image" src="(data:image\/[^"]+)"/)?.[1] ?? '';
}

const masterFixture = createMasterFixture(readMasterAlbumArt());

if (!existsSync(electron)) {
  throw new Error('Electron binary is missing. Run `pnpm --filter @emojitot/desktop exec install-electron` first.');
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(
  join(profileDir, 'prefs.json'),
  JSON.stringify({ avoidEnabled: false, rendererDebug: true, theme }, null, 2),
  'utf8',
);

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_NO_ATTACH_CONSOLE;

const app = spawn(
  electron,
  ['--remote-debugging-port=' + PORT, '--user-data-dir=' + profileDir, APP_DIR],
  { cwd: APP_DIR, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
);

let appOutput = '';
app.stdout?.on('data', (chunk) => { appOutput = (appOutput + chunk.toString()).slice(-12000); });
app.stderr?.on('data', (chunk) => { appOutput = (appOutput + chunk.toString()).slice(-12000); });

class Cdp {
  #ws;
  #id = 0;
  #pending = new Map();

  static async connect(url) {
    const client = new Cdp();
    client.#ws = new WebSocket(url);
    await new Promise((resolveOpen, rejectOpen) => {
      client.#ws.addEventListener('open', resolveOpen, { once: true });
      client.#ws.addEventListener('error', rejectOpen, { once: true });
    });
    client.#ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id === undefined) return;
      const pending = client.#pending.get(message.id);
      if (!pending) return;
      client.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || 'CDP error'));
      else pending.resolve(message.result);
    });
    return client;
  }

  send(method, params = {}, sessionId, timeoutMs = 20000) {
    const id = ++this.#id;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    this.#ws.send(JSON.stringify(message));
    return new Promise((resolveSend, rejectSend) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        rejectSend(new Error(method + ' timed out'));
      }, timeoutMs);
      this.#pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolveSend(value); },
        reject: (error) => { clearTimeout(timer); rejectSend(error); },
      });
    });
  }

  close() {
    try { this.#ws.close(); } catch { /* already closed */ }
  }
}

async function waitForEndpoint() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (app.exitCode !== null) {
      throw new Error('EmojiTot exited before CDP was ready.\n' + appOutput);
    }
    try {
      const response = await fetch('http://127.0.0.1:' + PORT + '/json/version', {
        signal: AbortSignal.timeout(700),
      });
      if (response.ok) return response.json();
    } catch { /* still starting */ }
    await sleep(200);
  }
  throw new Error('Timed out waiting for EmojiTot CDP.\n' + appOutput);
}

async function evaluate(client, sessionId, expression) {
  const result = await client.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
    30000,
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(client, sessionId, expression, label) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await evaluate(client, sessionId, expression)) return;
    await sleep(200);
  }
  throw new Error('Timed out waiting for ' + label);
}

async function findTarget(client, fragment) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const { targetInfos } = await client.send('Target.getTargets');
    const target = targetInfos.find((item) => item.type === 'page' && item.url.includes(fragment));
    if (target) return target;
    await sleep(200);
  }
  throw new Error('Timed out waiting for target ' + fragment);
}

async function normalizeCaptureDensity(client, sessionId, width, height) {
  await client.send(
    'Emulation.setDeviceMetricsOverride',
    {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    },
    sessionId,
  );
}

async function capture(client, sessionId, name, clipExpression = '') {
  await sleep(450);
  const clip = clipExpression
    ? JSON.parse(await evaluate(client, sessionId, clipExpression))
    : null;
  const result = await client.send(
    'Page.captureScreenshot',
    {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
      ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
    },
    sessionId,
  );
  const file = join(outputDir, name + '.png');
  writeFileSync(file, Buffer.from(result.data, 'base64'));
  console.log(file);
}

async function collectLayoutMetrics(client, sessionId, rootSelector) {
  return JSON.parse(await evaluate(
    client,
    sessionId,
    `JSON.stringify((() => {
      const round = (value) => Math.round(Number(value) * 100) / 100;
      const describe = (element) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id || '',
          className: typeof element.className === 'string' ? element.className : '',
          text: (element.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
          rect: {
            x: round(rect.x),
            y: round(rect.y),
            width: round(rect.width),
            height: round(rect.height),
          },
          display: style.display,
          position: style.position,
          overflow: style.overflow,
          padding: style.padding,
          margin: style.margin,
          gap: style.gap,
          gridTemplateColumns: style.gridTemplateColumns,
          gridTemplateRows: style.gridTemplateRows,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          borderRadius: style.borderRadius,
          appearance: style.appearance,
          backgroundImage: style.backgroundImage,
          color: style.color
        };
      };
      const root = document.querySelector(${JSON.stringify(rootSelector)});
      if (!root) return { root: ${JSON.stringify(rootSelector)}, missing: true, elements: [] };
      return {
        root: ${JSON.stringify(rootSelector)},
        elements: [describe(root), ...Array.from(root.querySelectorAll('*'), describe)].filter(Boolean)
      };
    })())`,
  ));
}

let browser;
try {
  const version = await waitForEndpoint();
  browser = await Cdp.connect(version.webSocketDebuggerUrl);

  const islandTarget = await findTarget(browser, 'island.html');
  const islandSession = (await browser.send(
    'Target.attachToTarget',
    { targetId: islandTarget.targetId, flatten: true },
  )).sessionId;
  await browser.send('Runtime.enable', {}, islandSession);
  await waitFor(
    browser,
    islandSession,
    "document.readyState === 'complete' && typeof window.islandAPI === 'object' && !!document.getElementById('pill')",
    'island readiness',
  );
  await normalizeCaptureDensity(browser, islandSession, 420, 310);

  const onboardingTarget = await findTarget(browser, 'onboarding.html');
  const onboardingSession = (await browser.send(
    'Target.attachToTarget',
    { targetId: onboardingTarget.targetId, flatten: true },
  )).sessionId;
  await browser.send('Runtime.enable', {}, onboardingSession);
  await waitFor(
    browser,
    onboardingSession,
    "document.readyState === 'complete' && !!document.getElementById('btn-start')",
    'onboarding readiness',
  );
  await normalizeCaptureDensity(browser, onboardingSession, 780, 630);
  await capture(
    browser,
    onboardingSession,
    'onboarding-01-welcome',
    'JSON.stringify({ x: 0, y: 0, width: innerWidth, height: innerHeight })',
  );
  await evaluate(browser, onboardingSession, 'document.getElementById("btn-start").click(); true');
  await waitFor(
    browser,
    onboardingSession,
    "!document.getElementById('page-setup').hidden",
    'onboarding setup page',
  );
  await capture(
    browser,
    onboardingSession,
    'onboarding-02-setup',
    'JSON.stringify({ x: 0, y: 0, width: innerWidth, height: innerHeight })',
  );

  const boot = JSON.parse(await evaluate(
    browser,
    islandSession,
    '(async () => JSON.stringify(await window.islandAPI.bootstrap()))()',
  ));
  await evaluate(browser, islandSession, [
    'window.islandAPI.patchPrefs({',
    '  ...(' + JSON.stringify(boot.prefs) + '),',
    '  theme: ' + JSON.stringify(theme) + ',',
    '  avoidEnabled: false,',
    '  pages: { ...' + JSON.stringify(boot.prefs.pages || {}) + ', music: true },',
    '})',
  ].join('\n'));
  await sleep(700);
  const fixtureApplied = await evaluate(
    browser,
    islandSession,
    'window.__emojitotUiFixture(' + JSON.stringify(masterFixture) + ')',
  );
  if (fixtureApplied !== true) {
    throw new Error('The renderer rejected the approved master-board fixture.');
  }
  /* The fixture must never be allowed to restore its own theme: a --theme light
     capture that still paints dark is worse than no capture at all. The renderer
     collapses 'system' to dark/light via resolveTheme(), so the dataset value is
     always one of those two. */
  await waitFor(
    browser,
    islandSession,
    'document.body.dataset.theme === "dark" || document.body.dataset.theme === "light"',
    'renderer theme resolution',
  );
  const capturedTheme = await evaluate(browser, islandSession, 'document.body.dataset.theme');
  if (theme !== 'system' && capturedTheme !== theme) {
    throw new Error('Theme mismatch: requested ' + theme + ', renderer painted ' + capturedTheme + '.');
  }
  if (theme === 'system' && !['dark', 'light'].includes(capturedTheme)) {
    throw new Error('Invalid system theme resolution: ' + capturedTheme + '.');
  }
  await sleep(500);
  await capture(
    browser,
    islandSession,
    'island-collapsed',
    'JSON.stringify((() => { const r = document.getElementById("pill").getBoundingClientRect(); return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 16, height: r.height + 16 }; })())',
  );
  if (includeAvoid) {
    await evaluate(browser, islandSession, 'window.__emojitotAvoid(true)');
    await waitFor(
      browser,
      islandSession,
      'document.body.dataset.avoid === "1"',
      'auto-avoid state',
    );
    await capture(
      browser,
      islandSession,
      'island-avoid',
      'JSON.stringify((() => { const r = document.getElementById("frame").getBoundingClientRect(); return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 16, height: r.height + 16 }; })())',
    );
    await evaluate(browser, islandSession, 'window.__emojitotAvoid(false)');
    await waitFor(
      browser,
      islandSession,
      'document.body.dataset.avoid === "0"',
      'auto-avoid release',
    );
  }

  /*
   * Screenshots compare settled, final states. Keep the production spring in
   * the app, but make the capture target land directly so an occluded Electron
   * window cannot be sampled halfway through a throttled animation.
   */
  await evaluate(browser, islandSession, 'document.body.dataset.motion = "off"; true');
  await evaluate(browser, islandSession, [
    '(() => {',
    '  const pill = document.getElementById("pill");',
    '  pill?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));',
    '})()',
  ].join('\n'));
  await waitFor(
    browser,
    islandSession,
    "!document.getElementById('panel')?.hidden && Number(document.body.dataset.pages) > 0",
    'expanded island',
  );
  await waitFor(
    browser,
    islandSession,
    'Number(document.body.dataset.pages) === 11',
    'eleven fixture-backed island pages',
  );
  await sleep(650);
  const islandMetrics = JSON.parse(await evaluate(
    browser,
    islandSession,
    'JSON.stringify((() => { const panel = document.getElementById("panel").getBoundingClientRect(); const island = document.getElementById("island").getBoundingClientRect(); return { innerWidth, innerHeight, open: document.body.dataset.open, motion: document.body.dataset.motion, morphing: document.body.dataset.morphing, panel: { x: panel.x, y: panel.y, width: panel.width, height: panel.height }, island: { x: island.x, y: island.y, width: island.width, height: island.height } }; })())',
  ));
  console.log('island capture metrics', JSON.stringify(islandMetrics));

  const pageCount = Number(await evaluate(browser, islandSession, 'document.body.dataset.pages'));
  if (pageCount !== 11) {
    throw new Error('Expected 11 island pages, captured ' + pageCount + '.');
  }
  const islandLayoutMetrics = [];
  for (let index = 0; index < pageCount; index += 1) {
    const pageKey = await evaluate(
      browser,
      islandSession,
      'document.getElementById("pages")?.dataset.page || ""',
    );
    islandLayoutMetrics.push({
      file: 'island-' + String(index + 1).padStart(2, '0') + '-' + pageKey + '.png',
      page: pageKey,
      layout: await collectLayoutMetrics(browser, islandSession, '#panel'),
    });
    await capture(
      browser,
      islandSession,
      'island-' + String(index + 1).padStart(2, '0') + '-' + pageKey,
      'JSON.stringify((() => { const r = document.getElementById("panel").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })())',
    );
    if (index + 1 < pageCount) {
      await evaluate(
        browser,
        islandSession,
        'document.querySelector(\'[data-page-nav="1"]\').click(); true',
      );
      await waitFor(
        browser,
        islandSession,
        'document.getElementById("page-count")?.textContent.startsWith(' + JSON.stringify(String(index + 2).padStart(2, '0')) + ')',
        'island page after ' + pageKey,
      );
    }
  }
  writeFileSync(
    join(outputDir, 'island-layout-metrics.json'),
    JSON.stringify(islandLayoutMetrics, null, 2),
    'utf8',
  );

  const notificationApplied = await evaluate(
    browser,
    islandSession,
    'window.__emojitotNotification({ title: "修复音乐进度与歌词同步", body: "当前页面将在 3.5 秒后恢复" }, true)',
  );
  if (notificationApplied !== true) {
    throw new Error('The renderer rejected the approved notification state.');
  }
  await waitFor(
    browser,
    islandSession,
    'document.getElementById("pages")?.dataset.page === "notification"',
    'expanded notification state',
  );
  await capture(
    browser,
    islandSession,
    'island-notification',
    'JSON.stringify((() => { const r = document.getElementById("panel").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })())',
  );
  await evaluate(browser, islandSession, 'window.__emojitotClearNotification()');

  await evaluate(browser, islandSession, 'window.islandAPI.openSettings()');
  const settingsTarget = await findTarget(browser, 'settings.html');
  const settingsSession = (await browser.send(
    'Target.attachToTarget',
    { targetId: settingsTarget.targetId, flatten: true },
  )).sessionId;
  await browser.send('Runtime.enable', {}, settingsSession);
  await waitFor(
    browser,
    settingsSession,
    "document.readyState === 'complete' && document.querySelectorAll('#rail .pgm-rail-item').length > 0",
    'settings readiness',
  );
  await normalizeCaptureDensity(browser, settingsSession, 1080, 760);
  await sleep(650);

  const nav = JSON.parse(await evaluate(
    browser,
    settingsSession,
    "JSON.stringify([...document.querySelectorAll('#rail .pgm-rail-item')].map((button) => button.dataset.nav || ''))",
  ));
  if (nav.length !== 16) {
    throw new Error('Expected 16 settings pages, captured ' + nav.length + '.');
  }
  const settingsMetrics = [];
  for (let index = 0; index < nav.length; index += 1) {
    const key = nav[index];
    await evaluate(
      browser,
      settingsSession,
      '[...document.querySelectorAll("#rail .pgm-rail-item")].find((item) => item.dataset.nav === ' +
        JSON.stringify(key) + ')?.click()',
    );
    await waitFor(
      browser,
      settingsSession,
      '[...document.querySelectorAll("#rail .pgm-rail-item")].find((item) => item.getAttribute("aria-current") === "true")?.dataset.nav === ' +
        JSON.stringify(key),
      'settings page ' + key,
    );
    await capture(
      browser,
      settingsSession,
      'settings-' + String(index + 1).padStart(2, '0') + '-' + key,
      'JSON.stringify({ x: 0, y: 0, width: Math.min(innerWidth, 1080), height: Math.min(innerHeight, 760) })',
    );
    settingsMetrics.push({
      file: 'settings-' + String(index + 1).padStart(2, '0') + '-' + key + '.png',
      page: key,
      layout: await collectLayoutMetrics(browser, settingsSession, '.pgm-settings'),
    });
  }
  writeFileSync(
    join(outputDir, 'settings-layout-metrics.json'),
    JSON.stringify(settingsMetrics, null, 2),
    'utf8',
  );
} finally {
  browser?.close();
  if (app.exitCode === null) {
    app.kill();
    await sleep(800);
  }
  try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* Windows may still hold files */ }
}
