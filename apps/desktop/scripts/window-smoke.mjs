/**
 * Attach to the running Electron app the way Chromium's own protocol expects:
 * through the browser endpoint plus Target.attachToTarget, not by dialling a
 * page target directly. The page socket accepts the handshake but never
 * answers Runtime.evaluate, which is what made the first attempt hang.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolveElectronBinary } from './electron-runtime.mjs';

const PACKAGED_EXE = process.env.EMOJITOT_APP_EXE ? resolve(process.env.EMOJITOT_APP_EXE) : '';
const SMOKE_SCREENSHOT = process.env.EMOJITOT_SMOKE_SCREENSHOT
  ? resolve(process.env.EMOJITOT_SMOKE_SCREENSHOT)
  : '';
const ELECTRON = PACKAGED_EXE || resolveElectronBinary();
const DESKTOP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 9555;
const cleanEnv = { ...process.env };
delete cleanEnv.ELECTRON_RUN_AS_NODE;
delete cleanEnv.ELECTRON_NO_ATTACH_CONSOLE;

const out = [];
const ok = (n, p, d = '') => { out.push(p); console.log((p ? '  PASS  ' : '  FAIL  ') + n + (d ? '  — ' + d : '')); };

if (!existsSync(ELECTRON)) {
  console.error('Electron binary is missing. Run `pnpm --filter @emojitot/desktop exec install-electron` before the desktop smoke test.');
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

  /*
   * 25s, not 8: one of these expressions clicks through the pages up to twelve
   * times with a real 80ms wait between clicks, and on a loaded CI runner that
   * ran past the old budget — "Runtime.evaluate timed out" was the whole failure.
   * The window it drives is the same either way; only the patience changed.
   */
  const evaluate = async (expression) => {
    const r = await browser.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, 25000, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };

  /*
   * Auto-avoid replaces the pill with a 6px strip while the smoke runner owns
   * the foreground. Measurements of the compact capsule and its hand-off must
   * keep the normal pill path, so this temporary test profile turns avoidance
   * off before any fold is sampled.
   */
  await evaluate(`
    (async () => {
      const boot = await window.islandAPI.bootstrap();
      await window.islandAPI.patchPrefs({
        avoidEnabled: false,
        pages: { ...boot.prefs.pages, music: false },
        statusItems: ['clock'],
      });
    })()
  `);
  await sleep(1000);

  const sandbox = await evaluate("JSON.stringify({ process: typeof process, require: typeof require, api: typeof window.islandAPI, outer: window.outerWidth + 'x' + window.outerHeight })");
  const parsed = JSON.parse(sandbox);
  ok('renderer has no Node globals (sandbox on)', parsed.process === 'undefined' && parsed.require === 'undefined', sandbox);
  ok('preload bridge present', parsed.api === 'object');
  ok('outer window size sane', /^\d+x\d+$/.test(parsed.outer) && !parsed.outer.startsWith('0'), parsed.outer);
  const liveFace = JSON.parse(await evaluate(`
    (async () => {
      const face = document.querySelector('.pill-face emojitot-ball');
      for (let i = 0; i < 40 && !face?.shadowRoot?.querySelector('[data-et-runtime]'); i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const root = face?.shadowRoot;
      return JSON.stringify({
        runtime: Boolean(root?.querySelector('[data-et-runtime]')),
        eyes: root?.querySelectorAll('.et-polygon-eyes [data-eye]').length ?? 0,
        paused: root?.querySelector('[data-et-runtime]')?.getAttribute('data-paused') ?? '',
      });
    })()
  `));
  ok(
    'island faces mount the stateful polygon-eye runtime',
    liveFace.runtime && liveFace.eyes === 2,
    JSON.stringify(liveFace),
  );
  const motionPause = JSON.parse(await evaluate(`
    (async () => {
      const face = document.querySelector('.pill-face emojitot-ball');
      await window.islandAPI.patchPrefs({ motion: true, reduceMotion: true });
      for (let i = 0; i < 30 && face?.shadowRoot?.querySelector('[data-et-runtime]')?.dataset.paused !== 'true'; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const paused = face?.shadowRoot?.querySelector('[data-et-runtime]')?.dataset.paused ?? '';
      await window.islandAPI.patchPrefs({ motion: true, reduceMotion: false });
      return JSON.stringify({ paused });
    })()
  `));
  ok(
    'reduce-motion preference pauses the live character',
    motionPause.paused === 'true',
    JSON.stringify(motionPause),
  );
  const ballTarget = pages.find((page) => page.url.includes('index.html'));
  if (ballTarget) {
    const ballSession = await browser.send(
      'Target.attachToTarget',
      { targetId: ballTarget.targetId, flatten: true },
    );
    await browser.send('Runtime.enable', {}, 8000, ballSession.sessionId).catch(() => {});
    const ballRuntime = await browser.send(
      'Runtime.evaluate',
      {
        expression: `(async () => {
          const face = document.querySelector('#pet emojitot-ball');
          for (let i = 0; i < 40 && !face?.shadowRoot?.querySelector('[data-et-runtime]'); i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          const root = face?.shadowRoot;
          return JSON.stringify({
            ready: document.readyState,
            defined: Boolean(customElements.get('emojitot-ball')),
            runtime: Boolean(root?.querySelector('[data-et-runtime]')),
            eyes: root?.querySelectorAll('.et-polygon-eyes [data-eye]').length ?? 0,
            html: root?.innerHTML.slice(0, 160) ?? '',
          });
        })()`,
        awaitPromise: true,
        returnByValue: true,
      },
      8000,
      ballSession.sessionId,
    );
    const ballFace = JSON.parse(ballRuntime.result.value);
    ok(
      'desktop ball mounts the stateful polygon-eye runtime',
      ballFace.runtime && ballFace.eyes === 2,
      JSON.stringify(ballFace),
    );
  }
  const material = JSON.parse(await evaluate(`
    (async () => {
      for (let i = 0; i < 30 && !document.body.dataset.material; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return JSON.stringify({
        bridge: window.islandAPI.material(),
        body: document.body.dataset.material,
      });
    })()
  `));
  ok(
    'island leaves the window material to CSS',
    material.bridge === 'none' && material.body === 'none',
    JSON.stringify(material),
  );
  const surface = JSON.parse(await evaluate(`
    JSON.stringify((() => {
      const pill = document.querySelector('.pill');
      if (!pill) return {};
      const style = getComputedStyle(pill);
      return {
        radius: [
          style.borderTopLeftRadius,
          style.borderTopRightRadius,
          style.borderBottomRightRadius,
          style.borderBottomLeftRadius,
        ],
        gradients: (style.backgroundImage.match(/gradient\\(/g) || []).length,
        backdrop: style.backdropFilter,
      };
    })())
  `));
  ok(
    'collapsed liquid glass has rounded corners and layered CSS',
    surface.radius?.every((value) => value === surface.radius[0]) &&
      surface.radius?.[0] !== '0px' &&
      surface.gradients >= 3 &&
      surface.backdrop === 'none',
    JSON.stringify(surface),
  );
  const compactContent = JSON.parse(await evaluate(`
    JSON.stringify((() => {
      const status = document.querySelector('.pill-status');
      return {
        hasLegacyBars: Boolean(document.querySelector('.pill-live')),
        hasStatusRow: Boolean(status),
        text: status?.textContent.trim() ?? '',
      };
    })())
  `));
  ok(
    'collapsed pill has no legacy playing-bars indicator',
    compactContent.hasLegacyBars === false,
    JSON.stringify(compactContent),
  );
  ok(
    'collapsed pill keeps its text row',
    compactContent.hasStatusRow === true,
    JSON.stringify(compactContent),
  );
  const compactLayout = JSON.parse(await evaluate(`
    (async () => {
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const pill = document.querySelector('.pill');
      const face = document.querySelector('.pill-face');
      const status = document.querySelector('.pill-status');
      const frame = document.querySelector('#frame');
      const rootStyle = getComputedStyle(document.documentElement);
      const fixedWidth = parseFloat(rootStyle.getPropertyValue('--island-w'));
      const original = status.innerHTML;
      /*
       * The first compact report still crosses from the app's startup guess to
       * the measured stage. Take the baseline only after the native edge has
       * stopped moving; this test is about a content change, not startup.
       */
      let stableFrames = 0;
      let nativeSignature = '';
      for (let i = 0; i < 120 && stableFrames < 8; i += 1) {
        await nextFrame();
        const next = [window.innerWidth, window.innerHeight, frame.getBoundingClientRect().width].join(':');
        stableFrames = next === nativeSignature ? stableFrames + 1 : 0;
        nativeSignature = next;
      }
      const before = {
        frame: frame.getBoundingClientRect().width,
        pill: pill.getBoundingClientRect().width,
        inner: window.innerWidth,
      };
      status.innerHTML = '<span class="stat now-playing-pill"><span class="now-playing-pill__text">gta6! 赚够100W再下播 - 棉花大哥哥 - 哔哩哔哩直播，二次元</span></span>';
      /*
       * Probe the new content at its settled width once, before the spring.
       * This is the only state in which the face and the last glyph have their
       * final breathing room; an intermediate width intentionally clips text.
       */
      const previousWidth = pill.style.getPropertyValue('--pill-content-w');
      pill.style.setProperty('--pill-content-w', 'max-content');
      const targetPillBox = pill.getBoundingClientRect();
      const targetFaceBox = face.getBoundingClientRect();
      const targetStatusBox = status.getBoundingClientRect();
      const titleViewport = status.querySelector('.now-playing-pill');
      const titleViewportBox = titleViewport.getBoundingClientRect();
      const faceArt = face.querySelector('emojitot-ball');
      const facePaths = faceArt?.shadowRoot
        ? [...faceArt.shadowRoot.querySelectorAll('svg path')]
        : [];
      const faceInkLeft = facePaths.length
        ? Math.min(...facePaths.map((path) => path.getBoundingClientRect().left))
        : targetFaceBox.left;
      const targetGaps = {
        left: targetFaceBox.left - targetPillBox.left,
        right: targetPillBox.right - targetStatusBox.right,
      };
      const opticalGaps = {
        left: faceInkLeft - targetPillBox.left,
        right: targetPillBox.right - titleViewportBox.right,
      };
      const gutters = {
        left: parseFloat(getComputedStyle(pill).paddingLeft) || 0,
        right: parseFloat(getComputedStyle(pill).paddingRight) || 0,
      };
      if (previousWidth) pill.style.setProperty('--pill-content-w', previousWidth);
      else pill.style.removeProperty('--pill-content-w');
      const samples = [];
      for (let i = 0; i < 40; i += 1) {
        await nextFrame();
        samples.push({
          frame: frame.getBoundingClientRect().width,
          pill: pill.getBoundingClientRect().width,
          inner: window.innerWidth,
        });
      }
      const pillBox = pill.getBoundingClientRect();
      const result = {
        fixedWidth,
        before,
        after: {
          frame: frame.getBoundingClientRect().width,
          pill: pillBox.width,
          inner: window.innerWidth,
        },
        targetPill: targetPillBox.width,
        nativePadding: window.innerWidth - frame.getBoundingClientRect().width,
        leftGap: targetGaps.left,
        rightGap: targetGaps.right,
        opticalLeftGap: opticalGaps.left,
        opticalRightGap: opticalGaps.right,
        gutterLeft: gutters.left,
        gutterRight: gutters.right,
        titleOver: status.querySelector('.now-playing-pill')?.dataset.over ?? '',
        titleShift: status.querySelector('.now-playing-pill')?.style.getPropertyValue('--pill-title-shift') ?? '',
        titleWidth: titleViewport?.getBoundingClientRect().width ?? 0,
        titleMaxWidth: titleViewport ? parseFloat(getComputedStyle(titleViewport).maxWidth) || 0 : 0,
        samples,
      };
      window.__emojiTotSmokeStatus = original;
      return JSON.stringify(result);
    })()
  `));
  const compactWidthRange = {
    low: Math.min(...compactLayout.samples.map((sample) => sample.pill)),
    high: Math.max(...compactLayout.samples.map((sample) => sample.pill)),
  };
  const compactIntermediate = compactLayout.samples.some(
    (sample) =>
      sample.pill > compactWidthRange.low + 8 &&
      sample.pill < compactWidthRange.high - 8,
  );
  const compactPeakFrame = Math.max(...compactLayout.samples.map((sample) => sample.frame));
  const compactPeakPill = Math.max(...compactLayout.samples.map((sample) => sample.pill));
  const compactPeakInner = Math.max(...compactLayout.samples.map((sample) => sample.inner));
  ok(
    'collapsed native window follows content without exceeding the island cap',
    Math.abs(compactLayout.before.frame - compactLayout.before.pill) <= 1 &&
      Math.abs(compactPeakFrame - compactLayout.targetPill) <= 1 &&
      compactPeakPill > compactLayout.before.pill + 8 &&
      compactLayout.targetPill <= compactLayout.fixedWidth + 1 &&
      compactPeakInner > compactLayout.before.inner &&
      compactLayout.samples.every((sample) => sample.frame + 1 >= sample.pill) &&
      compactLayout.samples.some(
        (sample) =>
          Math.abs(sample.inner - sample.frame - compactLayout.nativePadding) <= 1,
      ),
    JSON.stringify(compactLayout),
  );
  ok(
    'collapsed pill animates between measured content widths',
    compactWidthRange.high - compactWidthRange.low > 8 && compactIntermediate,
    JSON.stringify({
      before: compactLayout.before.pill,
      after: compactLayout.after.pill,
      range: compactWidthRange,
      samples: compactLayout.samples.map((sample) => Number(sample.pill.toFixed(2))),
    }),
  );
  ok(
    'collapsed pill matches the face inset with the right breathing room',
    compactLayout.gutterRight > compactLayout.gutterLeft + 8 &&
      Math.abs(compactLayout.opticalLeftGap - compactLayout.opticalRightGap) <= 1,
    JSON.stringify(compactLayout),
  );
  ok(
    'overlong title scrolls inside the shorter red-box viewport',
    compactLayout.titleOver === 'true' &&
      parseFloat(compactLayout.titleShift) > 0 &&
      compactLayout.titleWidth <= compactLayout.titleMaxWidth + 1 &&
      compactLayout.titleMaxWidth <= 241,
    JSON.stringify({
      titleOver: compactLayout.titleOver,
      titleShift: compactLayout.titleShift,
      titleWidth: compactLayout.titleWidth,
      titleMaxWidth: compactLayout.titleMaxWidth,
    }),
  );
  if (SMOKE_SCREENSHOT) {
    const shot = await browser.send(
      'Page.captureScreenshot',
      { format: 'png', fromSurface: true },
      10000,
      sessionId,
    );
    writeFileSync(SMOKE_SCREENSHOT, Buffer.from(shot.data, 'base64'));
    console.log('  INFO  compact screenshot: ' + SMOKE_SCREENSHOT);
  }
  await evaluate(`
    (() => {
      const status = document.querySelector('.pill-status');
      status.innerHTML = window.__emojiTotSmokeStatus;
    })()
  `);
  await sleep(300);

  const statusAlignment = JSON.parse(await evaluate(`
    (async () => {
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const status = document.querySelector('.pill-status');
      const original = status.innerHTML;
      status.innerHTML = [
        '<span class="stat"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1.2" y="7" width="17" height="10" rx="2.6"></rect></svg><b>82%</b></span>',
        '<span class="stat dim">17°</span>',
        '<span class="stat dim">¥20.8</span>',
        '<span class="stat dim kaomoji">(｡･ω･｡)</span>',
      ].join('');
      await nextFrame();
      await nextFrame();
      const row = status.getBoundingClientRect();
      const samples = [...status.querySelectorAll('.stat')].map((el) => {
        const box = el.getBoundingClientRect();
        return {
          text: el.textContent.trim(),
          centerY: box.top + box.height / 2,
          height: box.height,
        };
      });
      status.innerHTML = original;
      await nextFrame();
      return JSON.stringify({
        rowCenterY: row.top + row.height / 2,
        samples,
        maxCenterDelta: Math.max(...samples.map((sample) => sample.centerY)) -
          Math.min(...samples.map((sample) => sample.centerY)),
      });
    })()
  `));
  ok(
    'kaomoji and readings share one centred line',
    statusAlignment.samples.length === 4 && statusAlignment.maxCenterDelta < 0.5,
    JSON.stringify(statusAlignment),
  );

  /*
   * Exercise the interrupted fold, not only its resting state.
   *
   * The old test waited for the panel and checked one frame, which let a
   * window that grew after the first spring frame pass. This sample starts at
   * the pointerdown and reverses through Escape halfway through the open, so
   * the same run catches a clipped first frame, content drift, a per-corner
   * radius mismatch, and the compositor-only shadow that caused the grey halo.
   */
  const motion = JSON.parse(await evaluate(`
    (async () => {
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const rect = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { x: box.x, y: box.y, w: box.width, h: box.height };
      };
      /*
       * The native window is placed after the renderer reports its compact box.
       * Sampling the first visible frame treats that startup move as fold drift,
       * so wait until the size and origin have stopped changing before taking
       * the baseline.
       */
      let stableFrames = 0;
      let windowSignature = '';
      for (let i = 0; i < 120 && stableFrames < 8; i += 1) {
        await nextFrame();
        const nextSignature = [
          window.screenX,
          window.screenY,
          window.outerWidth,
          window.outerHeight,
        ].join(':');
        stableFrames = nextSignature === windowSignature ? stableFrames + 1 : 0;
        windowSignature = nextSignature;
      }
      const initialPill = rect('#pill');
      const initialScreen = {
        x: window.screenX + (initialPill?.x ?? 0) + (initialPill?.w ?? 0) / 2,
        y: window.screenY + (initialPill?.y ?? 0) + (initialPill?.h ?? 0) / 2,
      };
      const start = performance.now();
      let reversed = false;
      let started = false;
      let startedAt = 0;
      const samples = [];
      document.getElementById('pill')?.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
      }));
      while (performance.now() - start < 1400) {
        await nextFrame();
        const panel = document.getElementById('panel');
        const style = panel ? getComputedStyle(panel) : null;
        const morphing = document.body.dataset.morphing === 'true';
        const island = rect('#island');
        const panelBody = document.getElementById('panel-body');
        const bodyOpacity = panelBody ? parseFloat(getComputedStyle(panelBody).opacity) : 0;
        if (!started && morphing && island?.w > 172) {
          started = true;
          startedAt = performance.now() - start;
        }
        samples.push({
          t: performance.now() - start,
          started,
          reversed,
          morphing,
          outerW: window.outerWidth,
          outerH: window.outerHeight,
          screenX: window.screenX,
          screenY: window.screenY,
          island,
          panelSize: panel ? [panel.offsetWidth, panel.offsetHeight, panel.hidden] : null,
          frame: rect('#frame'),
          topBall: rect('.top-face emojitot-ball'),
          bodyOpacity,
          radius: style ? [
            parseFloat(style.borderTopLeftRadius),
            parseFloat(style.borderTopRightRadius),
            parseFloat(style.borderBottomRightRadius),
            parseFloat(style.borderBottomLeftRadius),
          ] : [],
          shadow: style?.boxShadow ?? '',
          transform: style?.transform ?? '',
          pill: rect('#pill'),
        });
        if (started && !reversed && performance.now() - start >= startedAt + 100) {
          reversed = true;
          document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
          }));
        }
        if (started && reversed && !morphing) break;
      }
      /* Let the native window finish the post-morph setBounds call. */
      const settledSamples = [];
      for (let i = 0; i < 40; i += 1) {
        await nextFrame();
        const pill = rect('#pill');
        settledSamples.push({
          x: window.screenX + (pill?.x ?? 0) + (pill?.w ?? 0) / 2,
          y: window.screenY + (pill?.y ?? 0) + (pill?.h ?? 0) / 2,
          screenX: window.screenX,
          island: rect('#island'),
          frame: rect('#frame'),
          pill,
          outerW: window.outerWidth,
        });
      }
      const settledPill = rect('#pill');
      const settledScreen = {
        x: window.screenX + (settledPill?.x ?? 0) + (settledPill?.w ?? 0) / 2,
        y: window.screenY + (settledPill?.y ?? 0) + (settledPill?.h ?? 0) / 2,
      };
      return JSON.stringify({
        initialScreen,
        settledScreen,
        initialWindow: {
          x: window.screenX,
          outerW: window.outerWidth,
          innerW: window.innerWidth,
          pill: initialPill,
        },
        settledWindow: {
          x: window.screenX,
          outerW: window.outerWidth,
          innerW: window.innerWidth,
          pill: settledPill,
          island: rect('#island'),
          frame: rect('#frame'),
        },
        settledSamples,
        samples,
        open: document.getElementById('island')?.dataset.open,
        morphing: document.body.dataset.morphing,
      });
    })()
  `));
  const moving = motion.samples.filter((sample) => sample.started && sample.morphing);
  const firstMoving = moving[0];
  const maxOuterW = Math.max(...motion.samples.map((sample) => sample.outerW));
  const maxOuterH = Math.max(...motion.samples.map((sample) => sample.outerH));
  const ballCentres = moving
    .filter((sample) => sample.bodyOpacity > 0.05)
    .filter((sample) => sample.topBall)
    .map((sample) => ({
      /* getBoundingClientRect is window-local; the OS window grows around its
         centre, so screenX is what tells us whether the character moved. */
      x: sample.screenX + sample.topBall.x + sample.topBall.w / 2,
      y: sample.screenY + sample.topBall.y + sample.topBall.h / 2,
    }));
  const driftX = ballCentres.length
    ? Math.max(...ballCentres.map((point) => point.x)) - Math.min(...ballCentres.map((point) => point.x))
    : Infinity;
  const driftY = ballCentres.length
    ? Math.max(...ballCentres.map((point) => point.y)) - Math.min(...ballCentres.map((point) => point.y))
    : Infinity;
  const cornerSpread = moving.length
    ? Math.max(...moving.map((sample) => Math.max(...sample.radius) - Math.min(...sample.radius)))
    : Infinity;
  const widthDelta = moving.length > 1
    ? Math.max(...moving.slice(1).map((sample, index) => Math.abs(sample.island.w - moving[index].island.w)))
    : Infinity;
  const heightDelta = moving.length > 1
    ? Math.max(...moving.slice(1).map((sample, index) => Math.abs(sample.island.h - moving[index].island.h)))
    : Infinity;
  const radiusDelta = moving.length > 1
    ? Math.max(...moving.slice(1).map((sample, index) => Math.abs(sample.radius[0] - moving[index].radius[0])))
    : Infinity;
  const preExpanded =
    firstMoving &&
    Math.abs(firstMoving.outerW - maxOuterW) <= 1 &&
    Math.abs(firstMoving.outerH - maxOuterH) <= 1;
  const returnDriftX = Math.abs(motion.settledScreen.x - motion.initialScreen.x);
  const returnDriftY = Math.abs(motion.settledScreen.y - motion.initialScreen.y);
  const returnDrifts = motion.settledSamples.map((sample) => ({
    x: Math.abs(sample.x - motion.initialScreen.x),
    y: Math.abs(sample.y - motion.initialScreen.y),
  }));
  const returnMaxDriftX = Math.max(returnDriftX, ...returnDrifts.map((drift) => drift.x));
  const returnMaxDriftY = Math.max(returnDriftY, ...returnDrifts.map((drift) => drift.y));
  const settledCompactWidth = motion.settledWindow.frame?.w ?? Infinity;
  const closingMoving = moving.filter((sample) => sample.reversed);
  const narrowestMovingWidth = closingMoving.length
    ? Math.min(...closingMoving.map((sample) => sample.island?.w ?? Infinity))
    : Infinity;
  const compactHandoffTracksPill =
    Math.abs((motion.settledWindow.frame?.w ?? Infinity) - (motion.settledWindow.pill?.w ?? 0)) <= 1;
  ok(
    'island folds continuously without drift, a narrow intermediate target, or unequal corners',
    moving.length >= 8 &&
      motion.open === 'false' &&
      motion.morphing === undefined &&
      preExpanded &&
      compactHandoffTracksPill &&
      closingMoving.length >= 6 &&
      narrowestMovingWidth >= settledCompactWidth - 1 &&
      driftX <= 1 &&
      driftY <= 1 &&
      returnMaxDriftX <= 1 &&
      returnMaxDriftY <= 1 &&
      cornerSpread <= 0.05 &&
      moving.every((sample) => sample.shadow === 'none'),
    JSON.stringify({
      frames: moving.length,
      driftX: Number(driftX.toFixed(2)),
      driftY: Number(driftY.toFixed(2)),
      cornerSpread,
      widthDelta: Number(widthDelta.toFixed(2)),
      heightDelta: Number(heightDelta.toFixed(2)),
      radiusDelta: Number(radiusDelta.toFixed(2)),
      preExpanded,
      compactHandoffTracksPill,
      closingFrames: closingMoving.length,
      narrowestMovingWidth: Number(narrowestMovingWidth.toFixed(2)),
      settledCompactWidth: Number(settledCompactWidth.toFixed(2)),
      returnDrift: {
        x: Number(returnDriftX.toFixed(2)),
        y: Number(returnDriftY.toFixed(2)),
      },
      returnMaxDrift: {
        x: Number(returnMaxDriftX.toFixed(2)),
        y: Number(returnMaxDriftY.toFixed(2)),
      },
      returnSamples: motion.settledSamples.slice(0, 6).map((sample) => ({
        x: Number(sample.x.toFixed(2)),
        screenX: sample.screenX,
        outerW: sample.outerW,
        island: sample.island && {
          x: Number(sample.island.x.toFixed(2)),
          w: Number(sample.island.w.toFixed(2)),
        },
        frame: sample.frame && {
          x: Number(sample.frame.x.toFixed(2)),
          w: Number(sample.frame.w.toFixed(2)),
        },
        pill: sample.pill && {
          x: Number(sample.pill.x.toFixed(2)),
          w: Number(sample.pill.w.toFixed(2)),
        },
      })),
      initialWindow: motion.initialWindow,
      settledWindow: motion.settledWindow,
      outer: [maxOuterW, maxOuterH],
      first: firstMoving && {
        t: Number(firstMoving.t.toFixed(1)),
        outer: [firstMoving.outerW, firstMoving.outerH],
        island: firstMoving.island,
        panelSize: firstMoving.panelSize,
        frame: firstMoving.frame,
        topBall: firstMoving.topBall,
      },
      last: moving.at(-1) && {
        t: Number(moving.at(-1).t.toFixed(1)),
        outer: [moving.at(-1).outerW, moving.at(-1).outerH],
        island: moving.at(-1).island,
        panelSize: moving.at(-1).panelSize,
        frame: moving.at(-1).frame,
        topBall: moving.at(-1).topBall,
      },
    }),
  );

  /*
   * The ghost is intermittent, so one fold is not enough evidence. Repeat the
   * complete open/close hand-off and require every cycle to keep the same
   * native width and centre. Only the height may change.
   */
  const cycleStability = JSON.parse(await evaluate(`
    (async () => {
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const waitFor = async (condition, limit = 180) => {
        for (let i = 0; i < limit; i += 1) {
          if (condition()) return true;
          await nextFrame();
        }
        return false;
      };
      const island = document.getElementById('island');
      const panel = document.getElementById('panel');
      const pill = document.getElementById('pill');
      const frame = document.getElementById('frame');
      const fixedWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--island-w'));
      const initial = {
        innerW: window.innerWidth,
        outerW: window.outerWidth,
        screenX: window.screenX,
        centerX: window.screenX + window.outerWidth / 2,
        frameW: frame.getBoundingClientRect().width,
      };
      const cycles = [];
      let timedOut = false;
      for (let cycle = 0; cycle < 5; cycle += 1) {
        pill.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
        const opened = await waitFor(
          () => island.dataset.open === 'true' &&
            panel.hidden === false &&
            document.body.dataset.morphing !== 'true' &&
            document.body.dataset.preparing !== 'true',
        );
        for (let i = 0; i < 3; i += 1) await nextFrame();
        const openState = {
          open: island.dataset.open,
          innerW: window.innerWidth,
          outerW: window.outerWidth,
          screenX: window.screenX,
          frameW: frame.getBoundingClientRect().width,
        };

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        const closed = await waitFor(
          () => island.dataset.open === 'false' &&
            panel.hidden === true &&
            document.body.dataset.morphing !== 'true' &&
            document.body.dataset.preparing !== 'true',
        );
        /* The native height is intentionally reported after two painted frames. */
        for (let i = 0; i < 8; i += 1) await nextFrame();
        const closedState = {
          open: island.dataset.open,
          innerW: window.innerWidth,
          outerW: window.outerWidth,
          screenX: window.screenX,
          frameW: frame.getBoundingClientRect().width,
          avoid: document.body.dataset.avoid,
        };
        cycles.push({ opened, closed, openState, closedState });
        if (!opened || !closed) {
          timedOut = true;
          break;
        }
      }
      return JSON.stringify({ fixedWidth, initial, cycles, timedOut });
    })()
  `));
  ok(
    'repeated fold hand-offs keep one centre while native width follows the state',
    cycleStability.timedOut === false &&
      cycleStability.cycles.length === 5 &&
      cycleStability.cycles.every(({ openState, closedState }) =>
        openState.open === 'true' &&
        closedState.open === 'false' &&
        Math.abs(openState.frameW - cycleStability.fixedWidth) <= 1 &&
        closedState.frameW > 0 &&
        closedState.frameW <= openState.frameW - 1 &&
        Math.abs(openState.screenX + openState.outerW / 2 - cycleStability.initial.centerX) <= 1 &&
        Math.abs(closedState.screenX + closedState.outerW / 2 - cycleStability.initial.centerX) <= 1
      ),
    JSON.stringify(cycleStability),
  );

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
      const panel = document.getElementById('panel');
      return JSON.stringify({
        pages: box('.pages'),
        hint: box('.shelf-hint'),
        files: box('.shelf-list'),
        clip: box('.clip'),
        list: box('.clip-list'),
        head: box('.clip-head'),
        panel: panel ? [panel.offsetWidth, panel.offsetHeight] : null,
        outer: [window.outerWidth, window.outerHeight],
      });
    })()
  `);
  console.log('  INFO  shelf metrics: ' + metrics);
  /* The shelf page drops the clipboard block when clipboard history is off
     (0.6.3), so -1 is a valid reading there; the page box and the hint are
     what have to be there. */
  const shelf = metrics ? JSON.parse(metrics) : {};
  /* 0.7.0 routes the shelf empty state through the shared .state template, so
     the old .shelf-hint node is gone; the page box is the stable reading. */
  ok('shelf metrics collected', shelf.pages > 0, metrics);
  ok(
    'expanded panel has the full native window box',
    Array.isArray(shelf.panel) &&
      Array.isArray(shelf.outer) &&
      shelf.panel[0] > 0 &&
      shelf.panel[1] > 0 &&
      shelf.outer[0] === shelf.panel[0] + 64 &&
      shelf.outer[1] === shelf.panel[1] + 72,
    JSON.stringify({ panel: shelf.panel, outer: shelf.outer }),
  );

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
  const panelSurface = JSON.parse(await evaluate(`
    JSON.stringify((() => {
      const panel = document.querySelector('.panel');
      if (!panel) return {};
      const style = getComputedStyle(panel);
      return {
        radius: [
          style.borderTopLeftRadius,
          style.borderTopRightRadius,
          style.borderBottomRightRadius,
          style.borderBottomLeftRadius,
        ],
        gradients: (style.backgroundImage.match(/gradient\\(/g) || []).length,
      };
    })())
  `));
  ok(
    'expanded liquid glass keeps all four CSS corners',
    panelSurface.radius?.every((value) => value === panelSurface.radius[0]) &&
      panelSurface.radius?.[0] !== '0px' &&
      panelSurface.gradients >= 3,
    JSON.stringify(panelSurface),
  );

  await evaluate("window.islandAPI.openSettings('weather')");
  let settingsTarget = null;
  for (let i = 0; i < 40 && !settingsTarget; i += 1) {
    const { targetInfos } = await browser.send('Target.getTargets');
    settingsTarget = targetInfos.find((target) => target.type === 'page' && target.url.includes('settings.html')) ?? null;
    if (!settingsTarget) await new Promise((resolve) => setTimeout(resolve, 150));
  }
  ok('opened the weather settings page', Boolean(settingsTarget));
  if (settingsTarget) {
    const settingsSession = await browser.send(
      'Target.attachToTarget',
      { targetId: settingsTarget.targetId, flatten: true },
    );
    await browser.send('Runtime.enable', {}, 8000, settingsSession.sessionId).catch(() => {});
    const settingsEvaluate = async (expression) => {
      const result = await browser.send(
        'Runtime.evaluate',
        { expression, awaitPromise: true, returnByValue: true },
        10000,
        settingsSession.sessionId,
      );
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    let cityField = null;
    for (let i = 0; i < 40 && !cityField; i += 1) {
      const value = await settingsEvaluate(`
        JSON.stringify((() => {
          const input = document.querySelector('input[data-key="weather.city"]');
          return input ? { value: input.value, placeholder: input.placeholder } : null;
        })())
      `);
      cityField = value ? JSON.parse(value) : null;
      if (!cityField) await new Promise((resolve) => setTimeout(resolve, 150));
    }
    ok(
      'empty weather city field stays visually empty',
      cityField?.value === '' && cityField?.placeholder === '',
      JSON.stringify(cityField),
    );

    let facePicker = null;
    for (let i = 0; i < 40 && !facePicker; i += 1) {
      const value = await settingsEvaluate(`
        JSON.stringify((() => {
          const nav = document.querySelector('[data-nav="cast"]');
          if (!nav) return null;
          nav.click();
          const labels = [...document.querySelectorAll('.face-grid .face-cell span')]
            .map((node) => node.textContent.trim());
          return labels.length ? {
            count: labels.length,
            unnamed: labels.filter((label) => !label || !/[\\u3400-\\u9fff]/.test(label)),
            sample: labels.slice(0, 6),
          } : null;
        })())
      `);
      facePicker = value ? JSON.parse(value) : null;
      if (!facePicker) await new Promise((resolve) => setTimeout(resolve, 150));
    }
    ok(
      'settings face picker lists all 61 states with Chinese names',
      facePicker?.count === 61 && facePicker?.unnamed?.length === 0,
      JSON.stringify(facePicker),
    );
    await settingsEvaluate("document.querySelector('.face-cell[data-value=\"sad\"]')?.click(); true");
    let previewState = '';
    for (let i = 0; i < 25 && previewState !== 'sad'; i += 1) {
      previewState = await evaluate(`
        document.querySelector('.pill-face emojitot-ball')?.shadowRoot
          ?.querySelector('[data-et-runtime]')?.dataset.state ?? ''
      `);
      if (previewState !== 'sad') await new Promise((resolve) => setTimeout(resolve, 100));
    }
    ok(
      'engine-only expression previews reach the live desktop face',
      previewState === 'sad',
      JSON.stringify({ previewState }),
    );

    await settingsEvaluate("document.querySelector('[data-nav=\"pages\"]')?.click(); true");
    let residency = null;
    for (let i = 0; i < 40 && !residency; i += 1) {
      const value = await settingsEvaluate(`
        JSON.stringify((() => {
          const pill = document.querySelector('.residency-pill');
          const parent = pill?.parentElement;
          if (!pill || !parent) return null;
          const pillBox = pill.getBoundingClientRect();
          const parentBox = parent.getBoundingClientRect();
          return {
            left: pillBox.left - parentBox.left,
            right: parentBox.right - pillBox.right,
            width: pillBox.width,
            available: parentBox.width,
          };
        })())
      `);
      residency = value ? JSON.parse(value) : null;
      if (!residency) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    ok(
      'settings residency preview is centred in its card',
      residency &&
        Math.abs(residency.left - residency.right) <= 1 &&
        residency.width < residency.available,
      JSON.stringify(residency),
    );
  }

  async function surfaceVisibility(name) {
    const { targetInfos: currentTargets } = await browser.send('Target.getTargets');
    const target = currentTargets.find(
      (item) => item.type === 'page' && item.url.split('/').pop() === name,
    );
    if (!target) return null;
    const attached = await browser.send(
      'Target.attachToTarget',
      { targetId: target.targetId, flatten: true },
    );
    await browser.send('Runtime.enable', {}, 8000, attached.sessionId).catch(() => {});
    const result = await browser.send(
      'Runtime.evaluate',
      { expression: 'document.visibilityState', returnByValue: true },
      8000,
      attached.sessionId,
    );
    return result.result.value;
  }

  const relaunch = spawn(
    ELECTRON,
    [
      '--user-data-dir=' + SMOKE_USER_DATA,
      ...(PACKAGED_EXE ? [] : [DESKTOP_ROOT]),
    ],
    {
      cwd: PACKAGED_EXE ? dirname(PACKAGED_EXE) : DESKTOP_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: cleanEnv,
    },
  );
  const relaunchExit = await Promise.race([
    new Promise((resolve) => relaunch.once('exit', (code) => resolve(code))),
    sleep(10000).then(() => 'timeout'),
  ]);
  await sleep(500);
  const islandVisibility = await surfaceVisibility('island.html');
  const ballVisibility = await surfaceVisibility('index.html');
  ok(
    'relaunch keeps island-only display mode and does not surface the desktop ball',
    relaunchExit !== 'timeout' &&
      islandVisibility === 'visible' &&
      ballVisibility !== 'visible',
    JSON.stringify({ relaunchExit, islandVisibility, ballVisibility }),
  );

  browser.close();
} catch (error) {
  ok('attach run', false, String(error && error.message));
  if (appOutput) console.error('\n[window-smoke] Electron output:\n' + appOutput);
} finally {
  try {
    if (app.exitCode === null) {
      spawnSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    }
  } catch {}
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
