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
    assert.match(source, /await api\.prepareBox/);
    assert.match(main, /island:prepare-size/);
  });

  it('measures the resting panel before the morph layout removes its body from flow', () => {
    const setOpen = source.indexOf('async function setOpen');
    const panelRead = source.indexOf('width: Math.ceil(panelEl.offsetWidth)', setOpen);
    const bodyRead = source.indexOf('width: Math.ceil(panelBodyEl.offsetWidth)', setOpen);
    const morphLayout = source.indexOf("document.body.dataset.morphing = 'true'", setOpen);

    assert.ok(panelRead > setOpen);
    assert.ok(bodyRead > panelRead);
    assert.ok(morphLayout > bodyRead);
  });

  it('never reports an intermediate layout box while the morph owns the window', () => {
    assert.match(
      source,
      /function measure\(\) \{[\s\S]*?if \(document\.body\.dataset\.morphing === 'true'\) return;[\s\S]*?api\.reportBox/,
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
    assert.match(css, /body\[data-morphing="true"\] \.pill/);
    assert.match(css, /body\[data-morphing="true"\] \.panel/);
    assert.match(css, /box-shadow:\s*none/);
  });
});
