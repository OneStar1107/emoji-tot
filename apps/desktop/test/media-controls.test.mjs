/**
 * The media page's own arithmetic, and the one list the three layers share.
 *
 * Two things break silently on this page: a rail whose percentage runs past
 * the end of the track, and a control the UI offers while the player refuses
 * it. The pure helpers cover the first; the whitelist cross-check covers the
 * second — a kind that exists in the page, the IPC check and media.js but not
 * in media.ps1 is a button that does nothing.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import {
  RATES,
  SEEK_STEP,
  advancedSections,
  canSeek,
  controlSupport,
  rateLabel,
  seekFromKey,
  seekFromRatio,
  seekPercent,
} from '../src/renderer/media-controls.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(resolve(here, '..', 'src', rel), 'utf8');

/* media.js needs electron for paths.js; nothing here starts a watcher. */
const require = createRequire(import.meta.url);
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function patched(request, ...rest) {
  if (request === 'electron') {
    return {
      app: { getPath: () => resolve(here, '.tmp-media'), getVersion: () => '0.0.0-test' },
      safeStorage: { isEncryptionAvailable: () => false, encryptString: () => Buffer.from(''), decryptString: () => '' },
      shell: { openPath: async () => '' },
      Notification: class { show() {} },
    };
  }
  return originalLoad.call(this, request, ...rest);
};
const platform = require('../src/main/platform.js');
const media = require('../src/main/services/media.js');
const douyu = require('../src/main/services/douyu.js');
Module._load = originalLoad;

describe('media source priority', () => {
  const smtc = { active: true, title: 'SMTC track', source: 'Spotify.exe', duration: 180, playing: true };
  const fallback = {
    active: true,
    title: 'NetEase track',
    source: 'cloudmusic.exe',
    position: 40,
    duration: 180,
    playing: true,
    art: '',
  };

  it('keeps an on-demand SMTC player ahead of the NetEase fallback', () => {
    assert.equal(media.selectMediaFrame(smtc, fallback), smtc);
  });

  it('lets playing music outrank a finite-length video or podcast', () => {
    const video = {
      active: true,
      title: 'A recorded stream',
      source: 'msedge.exe',
      type: 'Video',
      duration: 3600,
      playing: true,
    };
    assert.equal(media.classifyMediaFrame(video), 'onDemand');
    assert.equal(media.selectMediaFrame(video, fallback), fallback);
  });

  it('lets playing NetEase music outrank a live SMTC session', () => {
    const live = {
      active: true,
      title: '主播正在直播 - 哔哩哔哩直播',
      source: 'msedge.exe',
      type: 'Music',
      duration: 0,
      playing: true,
    };
    assert.equal(media.selectMediaFrame(live, fallback), fallback);
  });

  it('keeps paused music ahead of a playing live session', () => {
    const live = {
      active: true,
      title: '主播正在直播 - 哔哩哔哩直播',
      source: 'msedge.exe',
      type: 'Music',
      duration: 0,
      playing: true,
    };
    const pausedMusic = { ...fallback, playing: false };
    assert.equal(media.selectMediaFrame(live, pausedMusic), pausedMusic);
  });

  it('keeps a paused SMTC music session ahead of a playing live fallback', () => {
    const pausedMusic = { ...smtc, playing: false };
    const live = {
      active: true,
      title: '主播正在直播 - 哔哩哔哩直播',
      source: 'msedge.exe',
      type: 'Music',
      duration: 0,
      playing: true,
    };
    assert.equal(media.selectMediaFrame(pausedMusic, live), pausedMusic);
  });

  it('hands paused music over to live when the resume window expires', () => {
    const pausedMusic = { ...smtc, playing: false };
    const live = {
      active: true,
      title: '主播正在直播 - 哔哩哔哩直播',
      source: 'msedge.exe',
      type: 'Music',
      duration: 0,
      playing: true,
    };
    const window = { pausedSince: 1_000, pausedHideMin: 1, now: 60_999 };
    assert.equal(media.selectMediaFrame(pausedMusic, null, live, window), pausedMusic);
    assert.equal(
      media.selectMediaFrame(pausedMusic, null, live, { ...window, now: 61_000 }),
      live,
    );
  });

  it('falls through to another playing medium, then clears when nothing else remains', () => {
    const pausedMusic = { ...smtc, playing: false };
    const video = {
      active: true,
      title: 'A recorded stream',
      source: 'vlc.exe',
      type: 'Video',
      duration: 3600,
      playing: true,
    };
    const window = { pausedSince: 1_000, pausedHideMin: 15, now: 901_000 };
    assert.equal(media.selectMediaFrame(pausedMusic, null, video, window), video);
    assert.equal(media.selectMediaFrame(pausedMusic, null, null, window).active, false);
  });

  it('keeps polling a paused NetEase audio session while live is active', () => {
    assert.equal(typeof media.shouldPollNetease, 'function', 'the fallback polling rule must be testable');
    const live = {
      active: true,
      title: '主播正在直播 - 哔哩哔哩直播',
      source: 'msedge.exe',
      duration: 0,
      playing: true,
    };
    assert.equal(
      media.shouldPollNetease({ session: true, playing: false }, live),
      true,
      'a paused music session must remain available as the preferred media owner',
    );
  });

  it('does not poll NetEase while SMTC already owns music', () => {
    assert.equal(typeof media.shouldPollNetease, 'function', 'the fallback polling rule must be testable');
    assert.equal(media.shouldPollNetease({ session: true, playing: true }, smtc), false);
  });

  it('uses NetEase as soon as SMTC reports no active session', () => {
    assert.equal(media.selectMediaFrame({ active: false }, fallback), fallback);
  });

  it('uses the history clock when NetEase publishes SMTC metadata without a timeline', () => {
    const incomplete = {
      active: true,
      title: 'NetEase track',
      source: 'cloudmusic.exe',
      duration: 0,
      position: 0,
      art: 'data:image/png;base64,cover',
      playing: false,
    };
    const selected = media.selectMediaFrame(incomplete, fallback);
    assert.equal(selected.position, 40, 'the history clock supplies the missing position');
    assert.equal(selected.duration, 180, 'the history row supplies the missing duration');
    assert.equal(selected.art, incomplete.art, 'SMTC artwork is retained when it exists');
    assert.equal(selected.playing, false, 'SMTC play/pause state stays authoritative');
  });

  it('does not combine the timeline of one player with the title and cover of another', () => {
    const wrongFallback = {
      ...fallback,
      title: 'Another song',
      trackId: '999',
    };
    const incomplete = {
      active: true,
      title: 'NetEase track',
      source: 'cloudmusic.exe',
      trackId: '123',
      duration: 0,
      art: '',
      playing: true,
    };
    const selected = media.selectMediaFrame(incomplete, wrongFallback);
    assert.equal(selected.title, incomplete.title);
    assert.equal(selected.duration, 0, 'a different track must not donate its clock');
  });

  it('keeps the NetEase fallback cover when it is the winning frame', () => {
    const art = 'data:image/jpeg;base64,bmV0ZWFzZQ==';
    const musicalFallback = { ...fallback, art };
    const live = {
      active: true,
      title: 'room - anchor - 哔哩哔哩直播',
      source: 'msedge.exe',
      duration: 0,
      playing: true,
      art: 'data:image/png;base64,bGl2ZQ==',
    };
    const selected = media.selectMediaFrame(live, musicalFallback);
    assert.equal(selected, musicalFallback);
    assert.equal(selected.title, musicalFallback.title);
    assert.equal(selected.art, art, 'artwork belongs to the selected media, never the live thumbnail');
  });

  it('classifies the four kinds without treating duration zero as proof of live', () => {
    assert.equal(
      media.classifyMediaFrame({ active: true, source: 'Spotify.exe', duration: 0 }),
      'music',
    );
    assert.equal(
      media.classifyMediaFrame({
        active: true,
        source: 'msedge.exe',
        title: 'room - anchor - 哔哩哔哩直播',
        duration: 0,
      }),
      'live',
    );
    assert.equal(
      media.classifyMediaFrame({ active: true, source: 'vlc.exe', duration: 7200 }),
      'onDemand',
    );
    assert.equal(
      media.classifyMediaFrame({ active: true, source: 'unknown.exe', duration: 0 }),
      'generic',
    );
  });

  it('lets explicit live evidence override a misleading Music playback type', () => {
    assert.equal(
      media.classifyMediaFrame({
        active: true,
        source: 'egolite',
        title: 'gta6！赚够100W再下播 - 棉花大哥哥 - 哔哩哔哩直播',
        type: 'Music',
        duration: 0,
      }),
      'live',
      'a browser live stream may report PlaybackType=Music',
    );
  });

  it('keeps the native SMTC chooser on the same priority ladder', () => {
    const script = src('main/services/media.ps1');
    assert.match(script, /function Test-MusicSession/, 'music classification must have one named rule');
    assert.match(script, /function Test-LiveSession/, 'live classification must have one named rule');
    assert.match(
      script,
      /if \(-not \$snapshot\.IsMusic -and -not \$snapshot\.IsPlaying\) \{ continue \}/,
      'paused music must stay in the native candidate set while paused non-music is filtered out',
    );
    assert.match(
      script,
      /Sort-Object -Property Rank -Descending/,
      'the native selector must rank music before playback status',
    );
    assert.match(
      script,
      /return \[bool\]\(\$musicType -or \$musicName\)/,
      'the native classifier must recognize both Music playback types and known music apps',
    );
    assert.match(script, /if \(\$duration -gt 0\) \{ return 300 \}/);
    assert.match(
      script,
      /if \(\$liveName\) \{ return 200 \}[\s\S]*if \(Test-MusicSession/,
      'strong live evidence must be checked before the misleading PlaybackType',
    );
    assert.match(script, /if \(\$videoType\) \{ return 200 \}/);
    assert.match(script, /return 100/);
  });

  it('carries an alternate player through to the resume handoff', () => {
    const script = src('main/services/media.ps1');
    const service = src('main/services/media.js');
    const preload = src('preload-island.js');
    assert.match(script, /function Get-PlayerSnapshots/);
    assert.match(script, /\$alternate\s*=/);
    assert.match(script, /TargetSource/);
    assert.match(service, /alternateFrame/);
    assert.match(service, /setPausedHideMin/);
    assert.match(preload, /holdPausedResume/);
  });

  it('runs the native watcher correctly under Windows PowerShell 5', () => {
    const script = src('main/services/media.ps1');
    assert.doesNotMatch(
      script,
      /[^\x00-\x7F]/,
      'Windows PowerShell 5 reads BOM-less scripts as ANSI, so source literals must stay ASCII',
    );
    assert.match(
      script,
      /\[char\]0x54D4,\s*\[char\]0x54E9,\s*\[char\]0x54D4,\s*\[char\]0x54E9/,
      'the Bilibili live-name evidence must be built from Unicode code points',
    );
    assert.match(
      script,
      /\[Console\]::OutputEncoding\s*=\s*\[System\.Text\.UTF8Encoding\]/,
      'the JSON stream must be decoded consistently by Node',
    );
  });

  it('still reports a broken SMTC watcher when NetEase has nothing', () => {
    const error = { active: false, error: true };
    assert.equal(media.selectMediaFrame(error, null), error);
  });

  it('lets a fallback seek publish without an SMTC timeline', () => {
    const service = src('main/services/media.js');
    assert.match(
      service,
      /function handleNeteaseFrame\(frame\)\s*\{[\s\S]*?publishSelected\(\)/,
      'every NetEase frame must reach the renderer even while SMTC has active zero-length metadata',
    );
  });
});

describe('media artwork follows delayed SMTC thumbnail updates', () => {
  it('rechecks the thumbnail after the track metadata key stops changing', () => {
    const script = src('main/services/media.ps1');
    const loop = script.slice(script.lastIndexOf('function New-SessionFrame'));
    assert.match(loop, /\$entry\s*=\s*@\{ art = ""; checkedAt = \[datetime\]::MinValue \}/);
    assert.match(
      loop,
      /\(\$now\s*-\s*\$entry\.checkedAt\)\.TotalMilliseconds\s*-ge\s*500/,
      'the cover must be sampled again even when title, artist and album are unchanged',
    );
    assert.match(
      loop,
      /\$p\.Thumbnail[\s\S]{0,800}\$entry\.checkedAt\s*=\s*\$now/,
      'a completed thumbnail read advances its own retry clock',
    );
  });
});

describe('live frames keep a usable cover and the real start time', () => {
  const bilibiliTitle = 'gta6！赚够100W再下播 - 棉花大哥哥 - 哔哩哔哩直播，二次元弹幕直播平台';

  it('treats a missing alternate live frame as no lookup', () => {
    assert.equal(media.liveLookupTarget(null), null);
  });

  it('reruns live metadata lookup when the same room becomes the primary media', () => {
    const frame = {
      active: true,
      title: bilibiliTitle,
      source: 'egolite.exe',
      duration: 0,
    };
    const lookup = media.liveLookupTarget(frame);
    assert.ok(lookup);
    assert.equal(
      media.liveLookupCacheKey(lookup, true),
      media.liveLookupCacheKey(lookup, true),
      'frames in the same media role must reuse one lookup',
    );
    assert.notEqual(
      media.liveLookupCacheKey(lookup, true),
      media.liveLookupCacheKey(lookup, false),
      'moving from alternate to primary must not suppress artwork resolution',
    );
  });

  it('drops the Bilibili placeholder thumbnail so the real cover lookup can run', () => {
    const frame = media.prepareLiveFrame({
      active: true,
      title: bilibiliTitle,
      duration: 0,
      art: 'data:image/png;base64,cGxhY2Vob2xkZXI=',
    });
    assert.equal(frame.art, '');
  });

  it('keeps artwork for an ordinary song', () => {
    const art = 'data:image/jpeg;base64,YXJ0';
    const frame = media.prepareLiveFrame({ active: true, title: '晴天', duration: 269, art });
    assert.equal(frame.art, art);
  });

  it('merges the room metadata and uses the broadcast start, not first detection', () => {
    const frame = media.attachLiveInfo(
      { active: true, title: bilibiliTitle, duration: 0, art: '', liveSince: 5000 },
      {
        platform: 'bilibili',
        roomId: '34348',
        roomTitle: 'gta6！赚够100W再下播',
        anchorName: '棉花大哥哥',
        startedAt: 1795428383000,
        art: 'data:image/jpeg;base64,Y292ZXI=',
      },
    );
    assert.equal(frame.liveSince, 1795428383000);
    assert.deepEqual(frame.live, {
      platform: 'bilibili',
      roomId: '34348',
      roomTitle: 'gta6！赚够100W再下播',
      anchorName: '棉花大哥哥',
      startedAt: 1795428383000,
    });
    assert.equal(frame.art, 'data:image/jpeg;base64,Y292ZXI=');
  });
});

describe('live room identification', () => {
  it('matches the Douyu room by its exact room and anchor names', () => {
    const room = douyu.pickRoom('六点半来哦', 'Xleft小叮当', [
      { isLive: 1, roomName: '另一个房间', nickName: 'Xleft小叮当', rid: 1 },
      { isLive: 1, roomName: '六点半来哦', nickName: 'Xleft小叮当', rid: 3168536 },
    ]);
    assert.equal(room.rid, 3168536);
  });

  it('does not turn an unrelated browser live stream into a Douyu room', () => {
    assert.equal(
      douyu.pickRoom('A live stream', 'Lofi Girl', [
        { isLive: 1, roomName: 'A live stream highlights', nickName: 'Someone else', rid: 2 },
      ]),
      null,
    );
  });

  it('only asks Douyu to resolve a live session with both room and anchor text', () => {
    assert.equal(
      douyu.looksCandidate({
        active: true,
        duration: 0,
        source: 'egolite',
        title: '六点半来哦',
        artist: 'Xleft小叮当',
      }),
      true,
    );
    assert.equal(
      douyu.looksCandidate({ active: true, duration: 0, source: 'egolite', title: '六点半来哦', artist: '' }),
      false,
    );
    assert.equal(
      douyu.looksCandidate({
        active: true,
        duration: 213,
        source: 'egolite',
        title: '六点半来哦',
        artist: 'Xleft小叮当',
      }),
      false,
    );
  });
});

describe('seek rail arithmetic', () => {
  it('maps the ends of the track to 0 and 100 percent', () => {
    assert.equal(seekPercent(0, 100), 0);
    assert.equal(seekPercent(100, 100), 100);
    assert.equal(seekPercent(50, 100), 50);
  });

  it('clamps a position that runs past the track', () => {
    assert.equal(seekPercent(140, 100), 100, 'a stale position must not overfill the rail');
    assert.equal(seekPercent(-5, 100), 0, 'a negative position must not underfill it');
  });

  it('draws nothing when there is no length to measure against', () => {
    assert.equal(seekPercent(30, 0), 0);
    assert.equal(seekPercent(30, NaN), 0);
    assert.equal(seekPercent(30, undefined), 0);
  });

  it('turns a pointer ratio into the value it commits', () => {
    assert.equal(seekFromRatio(0, 200), 0);
    assert.equal(seekFromRatio(1, 200), 200);
    assert.equal(seekFromRatio(0.5, 205), 102.5);
    assert.equal(seekFromRatio(1.4, 200), 200, 'a drag past the right edge stops at the end');
    assert.equal(seekFromRatio(-0.4, 200), 0, 'and one past the left edge stops at the start');
  });

  it('rounds to the tenth of a second the wire reports', () => {
    assert.equal(seekFromRatio(1 / 3, 100), 33.3);
    assert.equal(seekFromRatio(0, 0), 0);
  });

  it('moves five seconds per arrow press and clamps at both ends', () => {
    assert.equal(SEEK_STEP, 5);
    assert.equal(seekFromKey(50, 200, 'ArrowRight'), 55);
    assert.equal(seekFromKey(50, 200, 'ArrowLeft'), 45);
    assert.equal(seekFromKey(2, 200, 'ArrowLeft'), 0);
    assert.equal(seekFromKey(198, 200, 'ArrowRight'), 200);
  });

  it('jumps to the ends with Home and End', () => {
    assert.equal(seekFromKey(50, 200, 'Home'), 0);
    assert.equal(seekFromKey(50, 200, 'End'), 200);
  });

  it('leaves every other key alone', () => {
    assert.equal(seekFromKey(50, 200, 'Enter'), null);
    assert.equal(seekFromKey(50, 0, 'ArrowRight'), null, 'a track with no length has no target');
  });

  it('is disabled for a broadcast and for a frame with no duration', () => {
    assert.equal(canSeek({ active: true, duration: 0 }), false, 'live: nothing to seek to');
    assert.equal(canSeek({ active: true }), false, 'no duration reported');
    assert.equal(canSeek({ active: false, duration: 200 }), false, 'nothing is playing');
    assert.equal(canSeek({ active: true, duration: 213 }), true);
  });
});

describe('the more panel only draws what the player claims', () => {
  const frame = (extra) => ({ active: true, duration: 200, title: 't', ...extra });

  it('draws no rows and no entry when the player reports no controls', () => {
    assert.deepEqual(advancedSections(frame()), []);
    assert.deepEqual(advancedSections(frame({ controls: null })), []);
    assert.deepEqual(controlSupport(frame()), { rate: false, repeat: false, shuffle: false });
  });

  it('hides the entry for a browser session that claims nothing', () => {
    // What Edge actually reports while a tab plays audio (measured on this
    // machine): the Try* calls answer true and nothing changes.
    const edge = frame({ type: 'video', controls: { rate: false, repeat: false, shuffle: false } });
    assert.deepEqual(advancedSections(edge), []);
    assert.equal(controlSupport(edge).rate, false);
  });

  it('draws one row per claimed control', () => {
    const sections = advancedSections(frame({ controls: { rate: true, repeat: false, shuffle: false }, rate: 1 }));
    assert.equal(sections.length, 1);
    assert.equal(sections[0].key, 'rate');
    assert.equal(sections[0].value, 1);
    assert.deepEqual(sections[0].options.map((option) => option.value), RATES);
  });

  it('draws all three when the player claims all three', () => {
    const sections = advancedSections(
      frame({ controls: { rate: true, repeat: true, shuffle: true }, rate: 1.5, autoRepeatMode: 1, shuffleActive: true }),
    );
    assert.deepEqual(sections.map((section) => section.key), ['rate', 'repeat', 'shuffle']);
    assert.equal(sections[1].value, 1, 'repeat track is selected');
    assert.equal(sections[2].value, 1, 'shuffle on is selected');
  });

  it('keeps a claimed row usable when the current value is missing', () => {
    // Windows reports no value for repeat on most players; the row still has
    // to be drawn, with nothing pressed, so the first press can set it.
    const sections = advancedSections(frame({ controls: { rate: false, repeat: true, shuffle: false } }));
    assert.equal(sections.length, 1);
    assert.equal(sections[0].value, null);
  });

  it('labels a rate without inventing precision', () => {
    assert.equal(rateLabel(1), '1×');
    assert.equal(rateLabel(1.25), '1.25×');
    assert.equal(rateLabel(0.75), '0.75×');
  });
});

describe('media.command whitelist', () => {
  it('addresses controls to the player currently shown', () => {
    assert.deepEqual(
      media.commandTargetArgs({ active: true, source: 'msedge.exe', title: 'Bilibili live' }),
      ['-TargetSource', 'msedge.exe', '-TargetTitle', 'Bilibili live'],
    );
    assert.deepEqual(media.commandTargetArgs({ active: false, source: 'msedge.exe' }), []);
  });

  it('refuses every kind the script has no branch for', () => {
    for (const kind of ['stop', 'PLAY', 'rate:', 'toggle ', '', null, undefined, 42, {}, ['next']]) {
      assert.equal(media.normalizeCommand(kind, 1), null, 'unknown kind ' + String(kind));
    }
  });

  it('accepts the seven actions the island can send', () => {
    for (const kind of ['toggle', 'next', 'prev', 'seek', 'rate', 'repeat', 'shuffle']) {
      assert.ok(media.normalizeCommand(kind, 1), kind + ' must be accepted');
    }
  });

  it('clamps a seek into the track and drops a non-number', () => {
    assert.deepEqual(media.normalizeCommand('seek', 12.34), { kind: 'seek', arg: 12.3 });
    assert.deepEqual(media.normalizeCommand('seek', -20), { kind: 'seek', arg: 0 });
    assert.deepEqual(media.normalizeCommand('seek', 1e9), { kind: 'seek', arg: 86400 });
    assert.equal(media.normalizeCommand('seek', 'soon'), null);
  });

  it('keeps a rate inside what SMTC will accept', () => {
    assert.deepEqual(media.normalizeCommand('rate', 1.5), { kind: 'rate', arg: 1.5 });
    assert.equal(media.normalizeCommand('rate', 0.1), null);
    assert.equal(media.normalizeCommand('rate', 8), null);
    assert.equal(media.normalizeCommand('rate', NaN), null);
  });

  it('only takes the three repeat modes and the two shuffle states', () => {
    assert.deepEqual(media.normalizeCommand('repeat', 2), { kind: 'repeat', arg: 2 });
    assert.equal(media.normalizeCommand('repeat', 1.5), null);
    assert.equal(media.normalizeCommand('repeat', 3), null);
    assert.deepEqual(media.normalizeCommand('shuffle', 0), { kind: 'shuffle', arg: 0 });
    assert.equal(media.normalizeCommand('shuffle', 2), null);
  });

  it('runs a known action and reports what the player answered', async () => {
    const calls = [];
    const real = platform.spawnPowerShell;
    platform.spawnPowerShell = (args) => {
      calls.push(args);
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stdout.setEncoding = () => {};
      child.kill = () => {};
      setImmediate(() => {
        child.stdout.emit('data', '{"kind":"repeat","ok":true}\r\n');
        child.emit('close');
      });
      return child;
    };
    try {
      const result = await media.command('repeat', 1);
      assert.deepEqual(result, { kind: 'repeat', ok: true, note: '' });
      assert.deepEqual(calls[0].slice(-2), ['repeat', '1'], 'the mode reaches the script as an argument');
    } finally {
      platform.spawnPowerShell = real;
    }
  });

  it('spawns nothing at all for a kind it does not know', async () => {
    const real = platform.spawnPowerShell;
    let spawned = 0;
    platform.spawnPowerShell = () => {
      spawned += 1;
      return new EventEmitter();
    };
    try {
      const result = await media.command('stop', 1);
      assert.equal(spawned, 0);
      assert.equal(result.ok, false);
      assert.equal(result.note, 'unknown');
    } finally {
      platform.spawnPowerShell = real;
    }
  });

  it('reports a refusal instead of swallowing it', async () => {
    const real = platform.spawnPowerShell;
    platform.spawnPowerShell = () => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stdout.setEncoding = () => {};
      child.kill = () => {};
      setImmediate(() => {
        child.stdout.emit('data', '{"kind":"rate","ok":false}\r\n');
        child.emit('close');
      });
      return child;
    };
    try {
      const result = await media.command('rate', 2);
      assert.deepEqual(result, { kind: 'rate', ok: false, note: '' });
    } finally {
      platform.spawnPowerShell = real;
    }
  });
});

/*
 * The four layers that have to agree: the page's sections, the IPC shape
 * check, media.js's whitelist, and media.ps1's switch. They are written in
 * four languages, so a kind added to three of them is a button that either
 * throws over IPC or reaches a script with no branch for it.
 */
describe('one action list across page, IPC, service and script', () => {
  const ps1 = src('main/services/media.ps1');
  const service = src('main/services/media.js');
  const main = src('main.js');
  const island = src('renderer/island.js');

  const scriptKinds = [...ps1.matchAll(/^\s+"(toggle|next|prev|seek|rate|repeat|shuffle)"\s*\{/gm)].map((m) => m[1]);
  const serviceKinds = JSON.parse(service.match(/const COMMAND_KINDS = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
  const ipcKinds = [...main.matchAll(/^\s{2}(toggle|next|prev|seek|rate|repeat|shuffle): (?:null|\[)/gm)].map((m) => m[1]);

  it('lists the same seven actions everywhere', () => {
    assert.deepEqual([...scriptKinds].sort(), ['next', 'prev', 'rate', 'repeat', 'seek', 'shuffle', 'toggle']);
    assert.deepEqual([...serviceKinds].sort(), [...scriptKinds].sort());
    assert.deepEqual([...ipcKinds].sort(), [...scriptKinds].sort());
  });

  it('feeds the rail from the pure module instead of a second copy of the maths', () => {
    assert.match(island, /from '\.\/media-controls\.mjs'/, 'the page imports the shared helpers');
    assert.match(island, /const seekable = canSeek\(media\)/, 'the rail is gated by canSeek');
    assert.match(island, /const progress = seekable\s*\?/, 'the seekable branch decides the rail markup');
    assert.match(island, /data-seek role="slider" tabindex="0"/, 'the rail is a keyboard-reachable slider');
  });

  it('does not render the retired advanced-playback trigger', () => {
    assert.doesNotMatch(island, /data-more="toggle"/, 'the transport has no ⋯ control');
    assert.doesNotMatch(island, /data-more-panel/, 'the retired control cannot leave an unreachable panel');
  });

  it('keeps the lyrics-settings shortcut out of the transport', () => {
    const start = island.indexOf('<div class="pgm-media-controls music-controls"');
    const controls = island.slice(start, island.indexOf('</div>', start));
    assert.ok(start >= 0 && controls, 'the media transport markup is present');
    assert.doesNotMatch(controls, /data-action="settings:music"/, 'the transport has no lyrics-settings hamburger');
    assert.doesNotMatch(controls, /歌词设置/, 'the removed shortcut cannot survive as a hidden label');
    assert.doesNotMatch(controls, /M4 7h16M4 12h9M4 17h13/, 'the removed hamburger glyph cannot survive as dead markup');
  });

  it('declares the hit box, the drag state and the focus ring in CSS', () => {
    const css = src('renderer/island.css');
    assert.match(css, /\.music-seek \{[^}]*height: 12px/, 'a 3px rail needs a taller thing to press');
    assert.match(css, /\.music-seek\[data-dragging="true"\][^}]*cursor: grabbing/);
  });
});
