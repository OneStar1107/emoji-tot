/**
 * Auto-avoid: which windows count as browsers.
 *
 * The rules are PowerShell (avoidance.ps1), so these assert the source the same
 * way security.test.mjs asserts the window settings. They deliberately anchor
 * the comparison operator and the path variable of each decision, not just the
 * presence of a keyword: all four ways this detection can silently invert
 * (window-class -ne, the subdirectory variable, the address-bar -eq, the
 * Electron -or) leave every keyword in place.
 *
 * Why source-level: the script only runs on Windows against live windows, so a
 * regression here is invisible until a user notices the island did not collapse.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '..', 'src', 'main', 'services', 'avoidance.ps1'), 'utf8');

/** The body of one top-level function, up to the next one. */
function body(name) {
  const start = source.indexOf('function ' + name);
  assert.ok(start >= 0, name + ' must exist');
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

/** The brace-balanced block that starts at the first marker's opening brace. */
function blockAfter(text, marker) {
  const at = text.indexOf(marker);
  assert.ok(at >= 0, 'missing ' + marker);
  const open = text.indexOf('{', at);
  assert.ok(open >= 0, 'missing block for ' + marker);
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  assert.fail('unbalanced block for ' + marker);
}

describe('avoid: browser detection', () => {
  it('keeps the known browser list as the fast path', () => {
    for (const exe of [
      'chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'vivaldi.exe',
      'opera.exe', 'duckduckgo.exe', '360se.exe', '360chrome.exe', 'qqbrowser.exe',
      'sogouexplorer.exe', 'quark.exe',
    ]) {
      assert.ok(source.includes("'" + exe + "'"), exe + ' must stay in the browser list');
    }
    const verdict = body('Get-BrowserVerdict');
    assert.match(verdict, /foreach \(\$b in \$script:Browsers\) \{/, 'the list must be scanned');
    assert.match(
      verdict,
      /if \(\$leaf -ieq \$b\) \{ return \[pscustomobject\]@\{ browser = \$true; reason = 'listed' \} \}/,
      'a listed leaf name must win outright',
    );
  });

  it('answers a listed executable before it looks at the window or the disk', () => {
    const verdict = body('Get-BrowserVerdict');
    const listed = verdict.indexOf("reason = 'listed'");
    const windowGuard = verdict.indexOf('$h -eq [IntPtr]::Zero');
    const runtime = verdict.indexOf('Test-ChromiumRuntime $p');
    assert.ok(listed > 0, 'listed return must exist');
    assert.ok(windowGuard > 0, 'the no-window guard must exist');
    assert.ok(runtime > 0, 'the runtime check must exist');
    assert.ok(listed < windowGuard, 'a Zero/null window handle must not stop the exe list');
    assert.ok(listed < runtime, 'the list is the fast path, ahead of the disk');
  });

  it('recognises a Chromium window by the shared top-level class', () => {
    const verdict = body('Get-BrowserVerdict');
    assert.match(verdict, /\$cls = Get-WindowClass \$h/, 'the class must be read from the window');
    assert.match(verdict, /if \(\$cls -ne 'Chrome_WidgetWin_1'\) \{/, 'anything but Chrome_WidgetWin_1 must be rejected');
    assert.ok(verdict.indexOf("reason = 'window-class='") > 0, 'the rejection must be explainable');
  });

  it('keeps the address-bar control as an explicit signal', () => {
    const omnibox = body('Test-Omnibox');
    assert.match(omnibox, /\[AvoidWin\]::EnumChildWindows\(\$h, \$cb, \[IntPtr\]::Zero\)/, 'children must be enumerated');
    assert.match(
      omnibox,
      /if \(\$sb\.ToString\(\) -eq 'Chrome_OmniboxView'\) \{ \$script:OmniHit = \$true; return \$false \}/,
      'the omnibox class must be compared with -eq and hit on match',
    );
    const verdict = body('Get-BrowserVerdict');
    const branch = blockAfter(verdict, 'elseif (Test-Omnibox $h)');
    assert.ok(branch.includes("reason = 'omnibox'"), 'the omnibox branch must return the omnibox reason');
    assert.ok(branch.includes('return'), 'the omnibox branch must return');
    assert.ok(/ego/i.test(source), 'the ego case must be documented next to the rule');
    assert.ok(/full-screen|fullscreen/i.test(source), 'the full-screen caveat must be documented');
  });

  it('falls back to the Chromium browser runtime when there is no address bar', () => {
    const runtime = body('Test-ChromiumRuntime');
    assert.match(
      runtime,
      /if \(\[System\.IO\.File\]::Exists\(\(Join-Path \$dir 'chrome\.dll'\)\)\) \{ return \$true \}/,
      'chrome.dll beside the exe must be checked',
    );
    assert.match(
      runtime,
      /foreach \(\$sub in \[System\.IO\.Directory\]::GetDirectories\(\$dir\)\) \{/,
      'the versioned subdirectory must be scanned with its own variable',
    );
    assert.match(
      runtime,
      /if \(\[System\.IO\.File\]::Exists\(\(Join-Path \$sub 'chrome\.dll'\)\)\) \{ return \$true \}/,
      'the loop must join the subdirectory variable, not the parent one',
    );
    const verdict = body('Get-BrowserVerdict');
    assert.match(verdict, /elseif \(Test-ChromiumRuntime \$p\) \{/, 'the runtime must be consulted before giving up');
  });

  it('never classifies an Electron app as a browser', () => {
    const electron = body('Test-ElectronApp');
    assert.match(
      electron,
      /\[System\.IO\.File\]::Exists\(\(Join-Path \$dir 'resources\\app\.asar'\)\)/,
      'packaged Electron layout must be detected',
    );
    assert.match(
      electron,
      /-or \[System\.IO\.Directory\]::Exists\(\(Join-Path \$dir 'resources\\app'\)\)\)/,
      'an unpacked app folder must be ORed in, not ANDed',
    );
    const verdict = body('Get-BrowserVerdict');
    const check = verdict.indexOf('Test-ElectronApp $p');
    const omnibox = verdict.indexOf('Test-Omnibox $h');
    const runtime = verdict.indexOf('Test-ChromiumRuntime $p');
    assert.ok(check > 0, 'the Electron check must run');
    assert.ok(omnibox > check, 'Electron is excluded before the address bar is trusted');
    assert.ok(runtime > check, 'Electron is excluded before chrome.dll is trusted');
    assert.ok(verdict.includes("reason = 'electron'"), 'the exclusion must be explainable');
  });

  it('caches only executable-level facts, never a window-level verdict', () => {
    const verdict = body('Get-BrowserVerdict');
    assert.ok(source.includes('$script:BrowserCache = @{}'), 'cache must be initialised');
    assert.match(verdict, /if \(\$script:BrowserCache\.ContainsKey\(\$key\)\) \{/, 'cache must be read');
    assert.ok(verdict.includes("$key = ($p -replace '/', '\\').ToLowerInvariant()"), 'the key is the exe path');
    const assigned = [...verdict.matchAll(/\$verdict = \[pscustomobject\]@\{ browser = \$(?:true|false); reason = '([a-z-]+)' \}/g)]
      .map((match) => match[1]);
    assert.deepEqual(assigned, ['electron', 'chromium-runtime'], 'only install-layout verdicts may be cached');
    const write = verdict.indexOf('$script:BrowserCache[$key] = $verdict');
    assert.ok(write > 0, 'the cache write must exist');
    for (const windowLevel of ['omnibox', 'no-chromium-runtime']) {
      const at = verdict.indexOf("reason = '" + windowLevel + "'");
      assert.ok(at > 0, windowLevel + ' must still be returned');
      assert.ok(at < write, windowLevel + ' is window-level and must return before the cache write');
      assert.match(
        verdict,
        new RegExp("return \\[pscustomobject\\]@\\{ browser = \\$(?:true|false); reason = '" + windowLevel + "' \\}"),
        windowLevel + ' must be an early return, not a cached assignment',
      );
    }
  });

  it('still answers the exe list when no window handle is available', () => {
    const verdict = body('Get-BrowserVerdict');
    const listed = verdict.indexOf("reason = 'listed'");
    const noWindow = verdict.indexOf("reason = 'no-window'");
    const guard = verdict.indexOf('$h -eq [IntPtr]::Zero');
    assert.ok(listed > 0 && noWindow > 0 && guard > 0, 'both guards must exist');
    assert.ok(listed < guard, 'the list must answer before the handle is consulted');
    assert.ok(listed < noWindow, 'the list must answer before the no-window return');
    const testBrowser = body('Test-Browser');
    assert.match(testBrowser, /if \(-not \$h\) \{ \$h = \[IntPtr\]::Zero \}/, 'a missing handle is normalised, not fatal');
  });

  it('passes the foreground window into the classifier', () => {
    assert.ok(source.includes('Test-Browser $p $fg'), 'Get-AvoidState must pass the window');
    assert.ok(source.includes('browser = (Test-Browser $p $hwnd)'), '-ListApps must pass the window too');
  });
});

describe('avoid: regression probes', () => {
  it('offers -Classify for one window', () => {
    assert.ok(source.includes('if ($Classify)'), 'switch must exist');
    assert.ok(source.includes("'hwnd='"), 'prints the window handle');
    assert.ok(source.includes("'class='"), 'prints the window class');
    assert.ok(source.includes("'electron='"), 'prints the Electron evidence');
    assert.ok(source.includes("'omnibox='"), 'prints the address-bar evidence');
    assert.ok(source.includes("'chromiumRuntime='"), 'prints the runtime evidence');
    assert.ok(source.includes("'browser='"), 'prints the verdict');
    assert.ok(source.includes("'reason='"), 'prints why');
  });

  it('extends -Probe with the same verdict', () => {
    assert.ok(source.includes('fgclass='), 'foreground class');
    assert.ok(source.includes('fgbrowser='), 'foreground verdict');
    assert.ok(source.includes('fgreason='), 'foreground reason');
  });
});
