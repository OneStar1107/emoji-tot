/**
 * One face, two windows — the sequence guarantees, as tests.
 *
 * The behaviour these lock down is what the user could see: after N switches,
 * the ball and the island must have received the same face sequence, every
 * face must have exactly one kaomoji, and a window that reconnects must be
 * handed the current face before it paints anything else. None of this needs
 * Electron: the bus is a plain state machine and the kaomoji table is a module.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { KAOMOJI, faceFor } from '../src/renderer/faces.js';
import { FACE_META } from '../src/renderer/vendor/core/index.js';

const require = createRequire(import.meta.url);
const { createFaceBus } = require('../src/main/face-bus.js');

/**
 * The sequence: 20 switches, the kind a user makes by touching every mood in
 * the settings grid. Deliberately mixed across the three protocol groups.
 */
const SWITCHES = [
  'happy', 'working', 'sad', 'alerting', 'curious',
  'thinking', 'celebrate', 'waiting', 'excited', 'reading',
  'angry', 'searching', 'shy', 'composing', 'surprised',
  'writing', 'laughing', 'loading', 'proud', 'refusing',
];

describe('face bus: one sequence, two windows', () => {
  it('delivers all 20 switches to the ball and the island in the same order', () => {
    let clock = 1000;
    const bus = createFaceBus({ now: () => (clock += 10) });
    const ball = [];
    const island = [];
    bus.attach((payload) => ball.push(payload));
    bus.attach((payload) => island.push(payload));

    for (const state of SWITCHES) bus.set(state, 'test');

    // attach() hands each window the value it starts from, then every switch.
    const expected = ['idle', ...SWITCHES];
    assert.equal(ball.length, expected.length, 'every switch must reach the ball');
    assert.equal(island.length, expected.length, 'every switch must reach the island');
    assert.deepEqual(ball.map((payload) => payload.state), expected);
    assert.deepEqual(island, ball, 'both windows must receive byte-identical payloads');
    assert.notEqual(ball[0].seq, ball[1].seq, 'each switch advances the sequence number');

    const last = bus.current();
    assert.equal(last.state, SWITCHES.at(-1));
    assert.equal(last.source, 'test');
    assert.ok(last.at > 0, 'the face carries a timestamp');
    assert.equal(last.seq, SWITCHES.length);
  });

  it('does not rebroadcast a value that did not change', () => {
    const bus = createFaceBus();
    const seen = [];
    bus.attach((payload) => seen.push(payload.state));
    bus.set('happy', 'test');
    bus.set('happy', 'test');
    assert.deepEqual(seen, ['idle', 'happy'], 'the initial value plus one change, not a repeat');
  });

  it('hands a reconnected window the current face immediately', () => {
    const bus = createFaceBus();
    for (const state of SWITCHES) bus.set(state, 'test');

    // A window that reloads subscribes after the fact; attach() must deliver
    // the current value before it returns, not wait for the next change.
    const reconnected = [];
    const detach = bus.attach((payload) => reconnected.push(payload));
    const current = bus.current();
    assert.equal(reconnected.length, 1, 'attach delivers exactly the current value');
    assert.deepEqual(reconnected[0], current);
    assert.equal(reconnected[0].state, SWITCHES.at(-1));
    detach();

    // resend() is the other reconnect path (did-finish-load): same value,
    // same sequence number — a resend is not a new face.
    const resent = [];
    bus.attach((payload) => resent.push(payload));
    const before = bus.current();
    bus.resend();
    const after = bus.current();
    assert.equal(after.seq, before.seq, 'resend does not advance the sequence');
    assert.equal(resent.at(-1).state, before.state);
    assert.equal(resent.at(-1).seq, before.seq);
  });
});

describe('kaomoji table: one face, one text', () => {
  it('has an entry for every face the engine can draw (100% hit)', () => {
    const missing = FACE_META.map((face) => face.id).filter((id) => {
      const text = KAOMOJI[id];
      return typeof text !== 'string' || text.length === 0;
    });
    assert.deepEqual(missing, [], 'every FACE_META id must have a non-empty kaomoji');
  });

  it('maps the same face key to the same text every time', () => {
    for (const state of SWITCHES) {
      assert.equal(faceFor(state), KAOMOJI[state]);
      assert.equal(faceFor(state), faceFor(state), 'the mapping is not random');
      assert.ok(faceFor(state).length > 0, state + ' must have a bubble text');
    }
    assert.equal(faceFor('not-a-face'), '', 'unknown states paint nothing, never a random face');
  });
});

describe('renderers are consumers only', () => {
  it('does not let a renderer produce or report a face', () => {
    const ball = readFileSync(new URL('../src/renderer/renderer.js', import.meta.url), 'utf8');
    const island = readFileSync(new URL('../src/renderer/island.js', import.meta.url), 'utf8');
    for (const source of [ball, island]) {
      assert.ok(!source.includes('reportFace'), 'a renderer must not report a face to main');
      assert.ok(!source.includes('scheduleMood'), 'a renderer must not run its own mood clock');
      assert.ok(!source.includes('state:apply'), 'the old second face channel must stay gone');
      assert.ok(!source.includes('island:state'), 'the old second face channel must stay gone');
    }
    const preload = readFileSync(new URL('../src/preload.js', import.meta.url), 'utf8');
    const islandPreload = readFileSync(new URL('../src/preload-island.js', import.meta.url), 'utf8');
    for (const source of [preload, islandPreload]) {
      assert.ok(!source.includes('face:report'), 'the renderer-to-main face channel must stay gone');
    }
  });
});
