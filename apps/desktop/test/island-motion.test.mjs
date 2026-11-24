import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  appleSpringParameters,
  createSpring,
  geometryAt,
  springMetrics,
} from '../src/renderer/island-motion.mjs';

const desktop = fileURLToPath(new URL('..', import.meta.url));
const source = readFileSync(join(desktop, 'src', 'renderer', 'island.js'), 'utf8');
const css = readFileSync(join(desktop, 'src', 'renderer', 'island.css'), 'utf8');
const main = readFileSync(join(desktop, 'src', 'main', 'island.js'), 'utf8');

describe('island spring: Apple equivalents and numeric behaviour', () => {
  it('maps stiffness 520 / damping 32 / mass 1 to the documented Apple pair', () => {
    const metrics = springMetrics({ mass: 1, stiffness: 520, damping: 32 });
    const apple = appleSpringParameters({ mass: 1, stiffness: 520, damping: 32 });

    assert.ok(Math.abs(metrics.omega - Math.sqrt(520)) < 1e-9);
    assert.ok(Math.abs(metrics.zeta - 0.7016) < 0.0002);
    assert.ok(Math.abs(metrics.overshoot - 0.0454) < 0.0003);
    assert.ok(Math.abs(metrics.settle99 - 0.288) < 0.002);
    assert.ok(Math.abs(apple.response - 0.2755) < 0.0002);
    assert.ok(Math.abs(apple.dampingFraction - 0.7016) < 0.0002);
    assert.ok(Math.abs(apple.duration - 0.2755) < 0.0002);
    assert.ok(Math.abs(apple.bounce - 0.2984) < 0.0002);
  });

  it('uses elapsed seconds, so 60Hz and 120Hz sample one identical trajectory', () => {
    const sixty = createSpring({ stiffness: 520, damping: 32, mass: 1 });
    const oneTwenty = createSpring({ stiffness: 520, damping: 32, mass: 1 });
    for (let ms = 0; ms <= 500; ms += 1000 / 60) {
      const a = sixty.sample(ms / 1000);
      const b = oneTwenty.sample(ms / 1000);
      assert.equal(a.position, b.position);
      assert.equal(a.velocity, b.velocity);
    }
  });

  it('keeps position and velocity continuous when the target reverses mid-flight', () => {
    const spring = createSpring({ stiffness: 520, damping: 32, mass: 1 });
    const at = spring.sample(0.16);
    assert.ok(at.velocity > 0, 'the opening spring is still moving towards 1');

    spring.retarget(0, 0.16);
    const reversed = spring.sample(0.16);
    assert.equal(reversed.position, at.position);
    assert.equal(reversed.velocity, at.velocity);

    const justAfter = spring.sample(0.161);
    assert.ok(justAfter.velocity < at.velocity, 'velocity changes continuously instead of resetting to zero');
    const later = spring.sample(0.19);
    assert.ok(later.position < at.position, 'the inherited velocity is spent before the reverse motion begins');
  });

  it('drives width, height and four equal radii from one progress value', () => {
    const compact = { width: 126, height: 36, radius: 18 };
    const expanded = { width: 300, height: 132, radius: 38 };
    assert.deepEqual(geometryAt(compact, expanded, 0), compact);
    assert.deepEqual(geometryAt(compact, expanded, 1), expanded);
    assert.deepEqual(geometryAt(compact, expanded, 0.5), {
      width: 213,
      height: 84,
      radius: 28,
    });
  });
});

describe('island morph integration: one geometry clock, no content transforms', () => {
  it('imports the analytic spring instead of separate open/close tracks', () => {
    assert.match(source, /from '\.\/island-motion\.mjs'/);
    assert.doesNotMatch(source, /MORPH_OPEN/);
    assert.doesNotMatch(source, /MORPH_CLOSE/);
    assert.doesNotMatch(source, /easeMorph\(/);
  });

  it('clips one natural-size panel rather than scaling the panel and counter-scaling content', () => {
    assert.match(source, /clipPath/);
    assert.doesNotMatch(source, /panelEl\.style\.transform/);
    assert.doesNotMatch(source, /panelBodyEl\.style\.transform/);
    assert.match(css, /\.panel-body\s*\{[^}]*transform:\s*none/);
  });

  it('stages the native window at the expanded size before the first morph frame', () => {
    assert.match(source, /async function prepareNativeBox/);
    assert.match(source, /Promise\.race\(\[/);
    assert.match(source, /await prepareNativeBox\(expanded\)/);
    assert.match(main, /island:prepare-size/);
  });

  it('measures the resting panel before the preparation layout removes its body from flow', () => {
    const setOpen = source.indexOf('async function setOpen');
    const panelRead = source.indexOf('width: Math.ceil(panelEl.offsetWidth)', setOpen);
    const bodyRead = source.indexOf('width: Math.ceil(panelBodyEl.offsetWidth)', setOpen);
    const prepareLayout = source.indexOf("document.body.dataset.preparing = 'true'", setOpen);

    assert.ok(panelRead > setOpen);
    assert.ok(bodyRead > panelRead);
    assert.ok(prepareLayout > bodyRead);
  });

  it('samples the compact target without letting the visible panel squeeze it', () => {
    const close = source.indexOf('function closeMorph()');
    const measurePill = source.indexOf('syncPillWidth({ immediate: true })', close);
    const sampleCompact = source.indexOf('const pillW = Math.ceil(pillEl.offsetWidth)', close);
    assert.ok(measurePill > close && sampleCompact > measurePill);
    assert.match(css, /\.pill\s*\{[^}]*flex:\s*none/);
    assert.match(css, /\.panel\s*\{[^}]*flex:\s*none/);
  });

  it('never paints a closing geometry narrower than the compact destination', () => {
    assert.match(source, /const progress = clamp01\(m\.progress\);/);
    assert.match(source, /geometryAt\(m\.compact, m\.expanded, progress\)/);
  });

  it('never reports an intermediate layout box while the morph owns the window', () => {
    assert.match(
      source,
      /function measure\(\) \{[\s\S]*?if \(preparing \|\| document\.body\.dataset\.morphing === 'true'\) return;[\s\S]*?api\.reportBox/,
    );
  });

  it('lands a reduced-motion open on the panel instead of folding it back', () => {
    assert.match(
      source,
      /if \(!animated \|\| avoiding\) \{\s*landOpen\(\);/,
    );
    assert.match(source, /function landOpen\(\) \{[\s\S]*?panelEl\.hidden = false;/);
  });

  it('removes outer surface shadows during the composite-sensitive morph', () => {
    assert.match(css, /body:is\(\[data-morphing="true"\], \[data-preparing="true"\]\) \.pill/);
    assert.match(css, /body:is\(\[data-morphing="true"\], \[data-preparing="true"\]\) \.panel/);
    assert.match(css, /box-shadow:\s*none/);
  });
});

describe('open-stage recovery', () => {
  it('exports a predicate that detects a native stage still sized for the pill', async () => {
    const motion = await import('../src/renderer/island-motion.mjs');
    assert.equal(typeof motion.stageNeedsRecovery, 'function');
    assert.equal(
      motion.stageNeedsRecovery(
        { width: 264, height: 112 },
        { width: 504, height: 352 },
        64,
        72,
      ),
      true,
      'an open 504x352 panel inside a compact 264x112 window is clipped',
    );
    assert.equal(
      motion.stageNeedsRecovery(
        { width: 568, height: 424 },
        { width: 504, height: 352 },
        64,
        72,
      ),
      false,
      'the prepared native stage already contains the panel',
    );
  });
});
