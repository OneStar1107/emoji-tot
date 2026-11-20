/**
 * Auto-avoid: which windows count as browsers.
 *
 * The rules are PowerShell (avoidance.ps1), so these assert the source the same
 * way security.test.mjs asserts the window settings: the discriminator, the
 * Electron exclusion, the executable list kept as the fast path, and the two
 * probe switches used to re-check a new browser by hand.
 *
 * Why source-level: the script only runs on Windows against live windows, so a
 * regression here is invisible until a user notices the island did not collapse.
 * The assertions below are the invariants that make that impossible.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const script = readFileSync(resolve(here, '..', 'src', 'main', 'services', 'avoidance.ps1'), 'utf8');

/** The body of one function, up to the next top-level function. */
function body(name) {
  const start = script.indexOf('function ' + name);
  assert.ok(start >= 0, `${name} must exist`);
  const next = script.indexOf('\nfunction ', start + 1);
  return script.slice(start, next < 0 ? undefined : next);
}

describe('avoid: browser detection', () => {
  it('keeps the known browser list as the fast path', () => {
    for (const exe of [
      'chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'vivaldi.exe',
      'opera.exe', 'duckduckgo.exe', '360se.exe', '360chrome.exe', 'qqbrowser.exe',
      'sogouexplorer.exe', 'quark.exe',
    ]) {
      assert.ok(script.includes(`'${exe}'`), `${exe} must stay in the browser list`);
    }
  });

  it('looks the executable up in the list before touching the disk', () => {
    const verdict = body('Get-BrowserVerdict');
    const listed = verdict.indexOf('$script:Browsers');
    const cache = verdict.indexOf('$script:BrowserCache');
    assert.ok(listed >= 0 && cache > listed, 'the list must win over auto-detection');
  });

  it('recognises a Chromium window by the shared top-level class', () => {
    const verdict = body('Get-BrowserVerdict');
    assert.ok(verdict.includes("'Chrome_WidgetWin_1'"), 'Chromium top-level window class');
    assert.ok(verdict.includes('Get-WindowClass'), 'the class must be read from the window');
  });

  it('keeps the address-bar control as an explicit signal', () => {
    assert.ok(script.includes("'Chrome_OmniboxView'"), 'native browser address bar');
    assert.ok(script.includes('function Test-Omnibox'), 'address-bar probe');
    // The comment explains why it cannot be the only rule: ego lite has none.
    assert.ok(/ego/i.test(script), 'the ego case must be documented next to the rule');
    assert.ok(/full-screen|fullscreen/i.test(script), 'the full-screen caveat must be documented');
  });

  it('falls back to the Chromium browser runtime when there is no address bar', () => {
    assert.ok(script.includes("'chrome.dll'"), 'Chromium browser runtime');
    assert.ok(script.includes('function Test-ChromiumRuntime'));
    const runtime = body('Test-ChromiumRuntime');
    assert.ok(runtime.includes('GetDirectories'), 'ego keeps chrome.dll in a version subdirectory');
  });

  it('never classifies an Electron app as a browser', () => {
    assert.ok(script.includes('function Test-ElectronApp'));
    assert.ok(script.includes("'resources\\app.asar'"), 'packaged Electron layout');
    assert.ok(script.includes("'resources\\app'"), 'unpacked Electron layout');
    const verdict = body('Get-BrowserVerdict');
    const electron = verdict.indexOf('Test-ElectronApp');
    const omnibox = verdict.indexOf('Test-Omnibox');
    const runtime = verdict.indexOf('Test-ChromiumRuntime');
    assert.ok(electron >= 0, 'the Electron check must run');
    assert.ok(omnibox > electron, 'Electron is excluded before the address bar is trusted');
    assert.ok(runtime > electron, 'Electron is excluded before chrome.dll is trusted');
    assert.ok(verdict.includes("reason = 'electron'"), 'the exclusion must be explainable');
  });

  it('caches the disk answer per executable', () => {
    assert.ok(script.includes('$script:BrowserCache = @{}'), 'cache must be initialised');
    assert.ok(body('Get-BrowserVerdict').includes('$script:BrowserCache[$key] = $verdict'), 'verdict must be cached');
    assert.ok(script.includes('$script:BrowserCache.ContainsKey($key)'), 'cache must be read');
  });

  it('passes the foreground window into the classifier', () => {
    assert.ok(script.includes('Test-Browser $p $fg'), 'Get-AvoidState must pass the window');
    assert.ok(script.includes('browser = (Test-Browser $p $hwnd)'), '-ListApps must pass the window too');
  });
});

describe('avoid: regression probes', () => {
  it('offers -Classify for one window', () => {
    assert.ok(script.includes('if ($Classify)'), 'switch must exist');
    assert.ok(script.includes("'hwnd='"), 'prints the window handle');
    assert.ok(script.includes("'class='"), 'prints the window class');
    assert.ok(script.includes("'electron='"), 'prints the Electron evidence');
    assert.ok(script.includes("'omnibox='"), 'prints the address-bar evidence');
    assert.ok(script.includes("'chromiumRuntime='"), 'prints the runtime evidence');
    assert.ok(script.includes("'browser='"), 'prints the verdict');
    assert.ok(script.includes("'reason='"), 'prints why');
  });

  it('extends -Probe with the same verdict', () => {
    assert.ok(script.includes('fgclass='), 'foreground class');
    assert.ok(script.includes('fgbrowser='), 'foreground verdict');
    assert.ok(script.includes('fgreason='), 'foreground reason');
  });
});
