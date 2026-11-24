import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const {
  buildProgressExpression,
  buildSeekExpression,
  validateEndpoint,
} = require('../src/main/services/netease-cdp.js');

function fixture({
  video = false,
  loading = false,
  trackId = 'song-1',
  legacy = false,
  progressModuleId = legacy ? 148 : 149,
  paused = false,
} = {}) {
  const store = {
    playing: {
      playId: legacy ? 'play-1' : '',
      resourceTrackId: trackId,
      onlineResourceId: trackId,
      resourceDuration: 180,
      resourceName: 'Song One',
      resourceArtist: 'Artist One',
      curPlaying: {
        id: trackId,
        trackId,
        track: {
          name: 'Song One',
          artists: [{ name: 'Artist One' }],
        },
      },
      curTrack: { id: trackId, name: 'Song One', duration: 180_000 },
      isPlayingVideo: video,
      isLoadingFirst: loading,
      // Current NetEase builds keep this object while paused. It is the
      // pending native restore position, not evidence that the track changed.
      restoreResource: paused ? { id: trackId, current: 124, pause: true } : null,
    },
  };
  const progress = { playId: trackId, current: 12, cacheProgress: 1 };
  let dispatched = null;
  const tool = {
    inited: true,
    app: { _store: { getState() {} } },
    getStore: () => store,
    getDispatch: () => async (action) => {
      dispatched = action;
      if (store.playing.restoreResource) {
        store.playing.restoreResource.current = action.payload.duration;
      } else {
        progress.current = action.payload.duration + 0.25;
      }
    },
  };
  const toolModuleId = legacy ? 8 : 7;
  const queue = [[[], {
    [toolModuleId]: function sample() { this.app._store.getState(); },
    [progressModuleId]: function sampleProgress() {
      subscribePlayStatus({ type: 'playprogress' });
      return cacheProgress;
    },
  }, [[1424]]]];
  queue.push = function push(chunk) {
    const id = chunk[2][0][0];
    const request = {
      c: {
        [toolModuleId]: { exports: { a: tool } },
        [progressModuleId]: { exports: { b: () => progress } },
        1424: { exports: {} },
      },
      m: {
        [toolModuleId]: queue[0][1][toolModuleId],
        [progressModuleId]: queue[0][1][progressModuleId],
        [id]: chunk[1][id],
      },
      s: 1424,
    };
    chunk[1][id]({}, {}, request);
    Array.prototype.push.call(this, chunk);
    return this.length;
  };
  const context = vm.createContext({
    Date,
    Math,
    Number,
    String,
    Array,
    Promise,
    setTimeout,
    webpackJsonp: queue,
  });
  context.globalThis = context;
  return { context, get dispatched() { return dispatched; }, progress };
}

describe('NetEase local CDP expressions', () => {
  it('reads current NetEase progress by capability and current track identity', async () => {
    const result = await vm.runInContext(buildProgressExpression(), fixture().context);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
      ready: true,
      trackId: 'song-1',
      playId: 'song-1',
      title: 'Song One',
      artist: 'Artist One',
      positionMs: 12_000,
      durationMs: 180_000,
    });
  });

  it('keeps compatibility with the older module layout', async () => {
    const result = await vm.runInContext(
      buildProgressExpression(),
      fixture({ legacy: true }).context,
    );
    assert.equal(result.ready, true);
    assert.equal(result.trackId, 'song-1');
  });

  it('reads the native position while paused with a NetEase restore state', async () => {
    const result = await vm.runInContext(
      buildProgressExpression(),
      fixture({ paused: true }).context,
    );
    assert.equal(result.ready, true);
    assert.equal(result.positionMs, 12_000);
  });

  it('finds a relocated progress module from its source contract', async () => {
    const result = await vm.runInContext(
      buildProgressExpression(),
      fixture({ progressModuleId: 999 }).context,
    );
    assert.equal(result.ready, true);
    assert.equal(result.trackId, 'song-1');
  });

  it('dispatches the seek and verifies the position read back from NetEase', async () => {
    const effect = fixture();
    const result = await vm.runInContext(
      buildSeekExpression(35.5, 'song-1', 'song-1'),
      effect.context,
    );
    assert.deepEqual(JSON.parse(JSON.stringify(effect.dispatched)), {
      type: 'playing/setPlayingPosition',
      payload: { duration: 35.5 },
    });
    assert.equal(result.verified, true);
    assert.equal(result.positionMs, 35_750);
  });

  it('verifies the pending restore position for a paused track', async () => {
    const effect = fixture({ paused: true });
    const result = await vm.runInContext(
      buildSeekExpression(35.5, 'song-1', 'song-1'),
      effect.context,
    );
    assert.equal(result.verified, true);
    assert.equal(result.positionMs, 35_500);
    assert.equal(effect.dispatched.type, 'playing/setPlayingPosition');
  });

  it('refuses a stale track or play instance before dispatching', async () => {
    const effect = fixture({ trackId: 'song-2' });
    const result = await vm.runInContext(
      buildSeekExpression(35.5, 'song-1', 'song-1'),
      effect.context,
    );
    assert.equal(result.trackChanged, true);
    assert.equal(effect.dispatched, null);
  });

  it('refuses unsupported video and loading states', async () => {
    for (const state of [fixture({ video: true }), fixture({ loading: true })]) {
      const progress = await vm.runInContext(buildProgressExpression(), state.context);
      assert.deepEqual(JSON.parse(JSON.stringify(progress)), {});
    }
  });
});

describe('NetEase CDP endpoint policy', () => {
  it('accepts only a loopback page endpoint on the configured port', () => {
    assert.equal(
      validateEndpoint('ws://127.0.0.1:9223/devtools/page/id', 9223),
      '/devtools/page/id',
    );
    for (const value of [
      'ws://localhost:9223/devtools/page/id',
      'ws://127.0.0.2:9223/devtools/page/id',
      'ws://127.0.0.1:9224/devtools/page/id',
      'ws://user@127.0.0.1:9223/devtools/page/id',
      'ws://127.0.0.1:9223/devtools/browser/id',
      'ws://127.0.0.1:9223/devtools/page/id?host=evil',
    ]) {
      assert.throws(() => validateEndpoint(value, 9223));
    }
  });
});
