/**
 * Two agents reporting at once, and the element attribute that never redrew.
 *
 * The desktop used to write every agent status straight to state.json, so the
 * ball showed whichever file happened to be touched last — three sub-agents,
 * one error among them, and the error was invisible if another agent wrote a
 * second later. The arbiter is what makes that a priority question.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArbiter } from '../../../packages/protocol/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..', '..');
const src = (rel) => readFileSync(resolve(here, '..', 'src', rel), 'utf8');
const repo = (rel) => readFileSync(resolve(root, rel), 'utf8');

function makeClock() {
  let now = 0;
  const timers = [];
  return {
    now: () => now,
    schedule(fn, ms) {
      const handle = { at: now + ms, fn, cancelled: false };
      timers.push(handle);
      return handle;
    },
    cancel(handle) {
      if (handle) handle.cancelled = true;
    },
    advance(ms) {
      const target = now + ms;
      for (let guard = 0; guard < 300; guard += 1) {
        const live = timers.filter((timer) => !timer.cancelled).sort((a, b) => a.at - b.at);
        const next = live[0];
        if (!next || next.at > target) break;
        live.shift();
        timers.splice(timers.indexOf(next), 1);
        now = Math.max(now, next.at);
        next.fn();
      }
      now = target;
    },
  };
}

describe('desktop: agents are arbitrated, not last-writer-wins', () => {
  const main = src('main.js');

  it('routes agent status through a real arbiter session each', () => {
    assert.ok(main.includes('createArbiter'), 'main.js must create an arbiter');
    assert.ok(main.includes("sessionId: 'agent:' + source.id"), 'each agent needs its own session');
    assert.ok(!main.includes('if (id) emitState({ emotionId: id })'),
      'writing the agent emotion straight to the state file is the bug');
  });

  it('removes the session when an agent is switched off', () => {
    assert.ok(main.includes("agentArbiter.remove('agent:' + source.id)"));
  });

  it('shows an error over background work from another agent', () => {
    const clock = makeClock();
    const applied = [];
    const arb = createArbiter({
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
      minDisplayMs: 100,
      autoTick: false,
      onApply: (result) => applied.push(result.state),
    });

    arb.update({ sessionId: 'agent:dsh', emotionId: '32' }); // working 40
    arb.update({ sessionId: 'agent:claude', emotionId: '30' }); // thinking 30
    assert.equal(arb.current().state, 'working');

    // A third agent errors: the highest priority wins regardless of order.
    arb.update({ sessionId: 'agent:codex', emotionId: '34' }); // alerting 80
    assert.equal(arb.current().state, 'alerting');

    // The error ends, the two background sessions are still there.
    arb.remove('agent:codex');
    clock.advance(1000);
    assert.equal(arb.current().state, 'working');
    arb.dispose();
  });
});

describe('element: finish is a live attribute', () => {
  const element = repo('packages/core/src/element.ts');

  it('lists finish in observedAttributes', () => {
    const line = element.split('\n').find((text) => text.includes('observedAttributes'));
    assert.ok(line, 'observedAttributes exists');
    const block = element.slice(element.indexOf('observedAttributes'), element.indexOf('observedAttributes') + 300);
    assert.ok(block.includes("'finish'"), 'finish must be observed or setting it never redraws');
  });

  it('exposes a setter and a getter', () => {
    assert.ok(element.includes('set finish('), 'missing property setter');
    assert.ok(element.includes('get finish('), 'missing property getter');
    assert.ok(element.includes("setAttribute('finish'"), 'the setter must write the attribute');
  });

  it('draws the finish it reads', () => {
    assert.ok(element.includes("getAttribute('finish')"), 'the renderer must read the attribute');
  });
});
