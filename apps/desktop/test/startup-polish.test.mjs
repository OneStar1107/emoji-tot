import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const desktop = fileURLToPath(new URL('..', import.meta.url));
const src = (path) => readFileSync(join(desktop, 'src', path), 'utf8');
const desktopPackage = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8'));

describe('startup polish and release identity', () => {
  it('never paints the internal Hong Kong fallback into the city field', () => {
    const settings = src('renderer/settings.js');
    assert.match(settings, /prefs\.weather\?\.autoLocate\s*===\s*true\s*\?\s*''\s*:\s*prefs\.weather\.city/);
    assert.doesNotMatch(settings, /rowInput\([^\n]*prefs\.weather\.city/);
  });

  it('uses one in-flight weather lookup for simultaneous startup consumers', () => {
    const weather = src('main/services/weather.js');
    assert.match(weather, /inFlight/);
    assert.match(weather, /const pending = inFlight\.get\(key\)/);
  });

  it('shows an explicit update state and the noncommercial licence', () => {
    const settings = src('renderer/settings.js');
    const i18n = src('renderer/i18n.js');
    assert.match(settings, /about\.update\.label/);
    assert.match(settings, /meta\?\.update/);
    assert.doesNotMatch(settings, /@emojitot\/core · MIT|@emojitot\/protocol · MIT/);
    assert.doesNotMatch(i18n, /MIT licensed; code and art made in-house/);
    assert.match(i18n, /about\.license/);
  });

  it('uses a clean installer filename without Setup or a version suffix', () => {
    assert.equal(desktopPackage.build.nsis.artifactName, 'EmojiTot.${ext}');
  });
});
