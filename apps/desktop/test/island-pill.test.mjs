import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pill from '../src/renderer/island-pill.mjs';

const {
  PILL_EXPRESSION,
  fitStatusRow,
  isMusicMedia,
  isLiveMedia,
  lyricPreviewWindow,
  mediaSourceLabel,
  mediaTimingLabel,
  pausedResumeVisible,
  pillContentPlan,
  shouldCollapseForPausedMusic,
  visiblePillStatusKeys,
} = pill;

/** Directory of this test file, so the renderer sources can be read. */
const here = dirname(fileURLToPath(import.meta.url));
const islandJs = readFileSync(resolve(here, '..', 'src', 'renderer', 'island.js'), 'utf8');
const islandCss = readFileSync(resolve(here, '..', 'src', 'renderer', 'island.css'), 'utf8');
const parityCss = readFileSync(resolve(here, '..', 'src', 'renderer', 'polar-graphite-parity.css'), 'utf8');
const islandHtml = readFileSync(resolve(here, '..', 'src', 'renderer', 'island.html'), 'utf8');

/** The declared block for a selector, or '' when the selector is gone. */
function cssBlock(selector) {
  const at = islandCss.indexOf(selector + ' {');
  if (at < 0) return '';
  return islandCss.slice(at, islandCss.indexOf('}', at) + 1);
}

describe('collapsed pill carries the status components', () => {
  it('keeps the status row in the collapsed state', () => {
    /*
     * 0.3.49's rule is the root cause of this task: island.js rendered the row
     * and this one declaration took it back. Asserting on the selector as a
     * whole keeps a future "tidy" from re-adding it under another comment.
     */
    assert.ok(
      !islandCss.includes('#island[data-open="false"] .pill .pill-status'),
      'the collapsed state must not hide .pill-status',
    );
  });

  it('does not draw the legacy playing-bars indicator', () => {
    assert.ok(!islandHtml.includes('pill-live'), 'the collapsed markup has no bars');
    assert.ok(!islandCss.includes('.pill-live'), 'the stylesheet has no bars');
    assert.ok(!islandJs.includes('.pill-live'), 'the renderer does not reserve or measure bars');
  });

  it('builds the row from the user order, enabled components only', () => {
    const start = islandJs.indexOf('function renderPillStatus()');
    const end = islandJs.indexOf('topClock.textContent', start);
    const body = islandJs.slice(start, end);
    assert.ok(body.includes('for (const key of visible)'), 'the row follows prefs.statusItems order');
    for (const key of ['battery', 'clock', 'weather', 'quota', 'kaomoji']) {
      assert.ok(body.includes(`key === '${key}'`), `${key} needs a renderer`);
    }
    assert.ok(body.includes('parts.push'), 'a component without data is skipped, not faked');
  });

  it('draws kaomoji only as the explicitly enabled status component', () => {
    const start = islandJs.indexOf('function renderPillStatus()');
    const end = islandJs.indexOf('topClock.textContent', start);
    const body = islandJs.slice(start, end);
    assert.ok(body.includes("key === 'kaomoji'"), 'the settings switch needs a renderer');
    assert.ok(body.includes('PILL_EXPRESSION'), 'the island and preview use the same expression');
    assert.ok(body.includes('visiblePillStatusKeys('), 'status availability is decided by the pure helper');
  });

  it('grows the native stage with content while keeping the user width as a hard cap', () => {
    const pill = cssBlock('.pill');
    const frame = cssBlock('#frame');
    assert.ok(
      pill.includes('width: var(--pill-content-w, max-content)'),
      'the animated capsule retains a content-sized fallback',
    );
    assert.ok(pill.includes('max-width: var(--pill-max-w)'), 'the capsule is capped');
    assert.ok(pill.includes('min-width: var(--fold-w)'), 'a face-only capsule keeps its old width');
    assert.ok(pill.includes('flex: none'), 'the panel cannot squeeze the capsule while it is being measured');
    assert.ok(
      frame.includes('width: var(--pill-stage-w, var(--fold-w))'),
      'the collapsed stage follows the measured capsule width',
    );
    assert.ok(
      islandCss.includes('#island[data-open="true"] #frame { width: var(--island-w); }'),
      'the open stage uses the user-defined maximum width',
    );
    assert.ok(
      !/\n  width: var\(--fold-w\);/.test(pill),
      'the old fixed width must not come back into the base rule (min-width is fine)',
    );
    assert.ok(
      islandCss.includes('--pill-max-w: var(--island-w);'),
      'the longest capsule is exactly the user-defined island width',
    );
    assert.ok(
      islandJs.includes('pillWidthSpring.retarget(target, now / 1000)'),
      'new content retargets the existing width spring instead of restarting it',
    );
    assert.ok(
      islandJs.includes("--pill-stage-w"),
      'the renderer publishes the measured native stage width',
    );
    // Tied to the panel, not to vw: the maximum native stage is the panel width.
    assert.ok(!islandCss.includes('--pill-max-w: 45vw'));
  });

  it('trims before the window measures the capsule', () => {
    const start = islandJs.indexOf('function renderPillStatus()');
    const body = islandJs.slice(start, islandJs.indexOf('/* ------------------------------------------------------------------- pages */', start));
    assert.ok(body.includes('fitPillStatus();'), 'the row is trimmed on every render');
    assert.ok(
      body.indexOf('fitPillStatus();') < body.indexOf('measure();'),
      'trimming happens before the box is reported to the main process',
    );
  });

  it('keeps numbers on one line in the compact row', () => {
    const status = cssBlock('.pill-status');
    assert.ok(status.includes('gap: 7px'), 'components are 7px apart');
    assert.ok(status.includes('flex: none'), 'the row is measured at its natural width');
    assert.ok(
      islandJs.includes('const overflow = padding + face.getBoundingClientRect().width + gap + statusWidth - cap;'),
      'the trim compares the natural status row against the cap',
    );
    assert.ok(status.includes('overflow: hidden'), 'the row cannot spill out of the capsule');
    assert.ok(status.includes('font-variant-numeric: tabular-nums'), 'digits keep one width');
    assert.ok(status.includes('font-size: var(--ui-size)'), 'the row follows the UI scale');
    const stat = cssBlock('.pill-status .stat');
    assert.ok(stat.includes('flex: none'), 'a component is never squeezed into half a number');
  });

  it('keeps the now-playing title in one fixed slot and trims the overflow', () => {
    assert.ok(
      islandCss.includes('--pill-title-max-w: min(') &&
        islandCss.includes('calc(240px * var(--ui-scale, 1))'),
      'the title viewport uses the shorter red-box width rather than the whole island',
    );
    const nowPlaying = cssBlock('.now-playing-pill');
    assert.match(nowPlaying, /width:\s*var\(--pill-title-max-w\)/);
    assert.match(nowPlaying, /max-width:\s*var\(--pill-title-max-w\)/);
    assert.doesNotMatch(
      islandCss,
      /\.now-playing-pill\[data-over="true"\]\s*>\s*span\s*\{[^}]*animation:/,
      'a lyric or long title must not start a marquee that changes the capsule',
    );
    assert.match(
      islandCss,
      /\.now-playing-pill\s*>\s*span\s*\{[^}]*text-overflow:\s*ellipsis/,
      'the fixed title slot trims a long title at its right edge',
    );
  });

  it('balances the face inset with a slightly wider right gutter', () => {
    const pill = cssBlock('.pill');
    assert.match(
      pill,
      /padding:\s*0 var\(--pill-pad-right\) 0 var\(--pill-pad-left\);/,
      'the capsule consumes the two optical gutter tokens',
    );
    assert.match(islandCss, /--pill-pad-left:\s*12px;/, 'the face edge keeps the base gutter');
    assert.match(
      islandCss,
      /--pill-pad-right:\s*23\.5px;/,
      'the text edge matches the visible face gap instead of overshooting it',
    );
    assert.ok(
      islandCss.includes('- var(--pill-pad-right)') &&
        islandCss.includes('- var(--pill-pad-left)'),
      'the title cap accounts for both gutters',
    );
  });
});

describe('what the collapsed pill shows', () => {
  it('shows the current lyric while keeping the track as quiet context', () => {
    const plan = pillContentPlan({
      statusCount: 3,
      media: { active: true, playing: true, title: 'get me high', artist: 'marco luka' },
      lyricLine: "I've been so damn faded tryna give you all my time",
    });
    assert.equal(plan.mode, 'nowPlaying');
    assert.equal(plan.text, "I've been so damn faded tryna give you all my time");
    assert.equal(plan.track, 'get me high - marco luka');
    assert.equal(plan.lyric, "I've been so damn faded tryna give you all my time");
  });

  it('falls back to the track title before the first lyric arrives', () => {
    const plan = pillContentPlan({
      statusCount: 3,
      media: { active: true, playing: true, title: 'get me high', artist: 'marco luka' },
      lyricLine: '',
    });
    assert.equal(plan.text, 'get me high - marco luka');
  });

  it('returns paused music to the status row while keeping its resume affordance', () => {
    const plan = pillContentPlan({
      statusCount: 3,
      media: { active: true, playing: false, title: 'paused track', type: 'Music' },
      resumeVisible: true,
    });
    assert.equal(plan.mode, 'status');
    assert.equal(plan.statusCount, 3);
  });

  it('keeps the paused resume control on screen when every reading is unavailable', () => {
    const plan = pillContentPlan({
      statusCount: 0,
      media: { active: true, playing: false, title: 'paused track', type: 'Music' },
      resumeVisible: true,
    });
    assert.equal(plan.mode, 'status');
    assert.equal(plan.statusCount, 0);
  });

  it('shows the playing title instead of the status components', () => {
    const plan = pillContentPlan({
      statusCount: 4,
      media: {
        active: true,
        playing: true,
        title: 'a6！赚够100W再下播',
        artist: '棉花大哥哥',
      },
    });
    assert.equal(plan.mode, 'nowPlaying');
    assert.equal(plan.text, 'a6！赚够100W再下播 - 棉花大哥哥');
    assert.equal(plan.statusCount, 0);
  });

  it('shows a song as title and artist only', () => {
    const plan = pillContentPlan({
      statusCount: 2,
      media: {
        active: true,
        playing: true,
        title: '晴天',
        artist: '周杰伦',
        album: '叶惠美',
        source: 'QQMusic.exe',
      },
    });
    assert.equal(plan.mode, 'nowPlaying');
    assert.equal(plan.text, '晴天 - 周杰伦');
  });

  it('shows a live room title and anchor name without the platform suffix', () => {
    const plan = pillContentPlan({
      statusCount: 2,
      media: {
        active: true,
        playing: true,
        title: 'gta6！赚够100W再下播 - 棉花大哥哥 - 哔哩哔哩直播，二次元弹幕直播平台',
        live: {
          platform: 'bilibili',
          roomTitle: 'gta6！赚够100W再下播',
          anchorName: '棉花大哥哥',
          anchorId: '1871001',
        },
      },
    });
    assert.equal(plan.mode, 'nowPlaying');
    assert.equal(plan.text, 'gta6！赚够100W再下播 - 棉花大哥哥');
  });

  it('removes the Bilibili platform suffix even before room metadata arrives', () => {
    const plan = pillContentPlan({
      statusCount: 2,
      media: {
        active: true,
        playing: true,
        title: 'gta6！赚够100W再下播 - 棉花大哥哥 - 哔哩哔哩直播，二次元弹幕直播平台',
      },
    });
    assert.equal(plan.text, 'gta6！赚够100W再下播 - 棉花大哥哥');
  });

  it('restores the status row when the now-playing display is switched off', () => {
    const plan = pillContentPlan({
      statusCount: 2,
      media: { active: true, playing: true, title: 'a paused preference hides this' },
      showNowPlaying: false,
    });
    assert.equal(plan.mode, 'status');
    assert.equal(plan.statusCount, 2);
  });

  it('falls back to the face when every component is off', () => {
    const plan = pillContentPlan({ statusCount: 0, media: { active: false, playing: false } });
    assert.equal(plan.mode, 'face');
    assert.equal(Object.hasOwn(plan, 'trailer'), false, 'the automatic CSS expression is gone');
  });

  it('has no automatic expression trailer in the capsule stylesheet', () => {
    assert.ok(!islandCss.includes('.pill::after'), 'kaomoji must not be drawn by CSS pseudo-content');
    assert.ok(!islandCss.includes('data-trailer'), 'there is no automatic trailer state left');
    assert.ok(!islandJs.includes('dataset.trailer'), 'the renderer no longer sets trailer state');
  });

  it('treats a missing count and a negative one as nothing to show', () => {
    assert.equal(pillContentPlan().mode, 'face');
    assert.equal(pillContentPlan({ statusCount: -2 }).mode, 'face');
    assert.equal(pillContentPlan({ statusCount: Number.NaN }).mode, 'face');
  });
});

describe('the collapsed pill keeps lyrics inside a fixed slot', () => {
  it('passes the current lyric into the pill plan', () => {
    const start = islandJs.indexOf('function renderPillStatus()');
    const body = islandJs.slice(start, islandJs.indexOf('topClock.textContent', start));
    assert.match(body, /lyricLine:\s*currentLyricLine\(\)/);
  });

  it('updates only the lyric text when the line advances', () => {
    const start = islandJs.indexOf('function paintCurrentLyric(');
    const body = islandJs.slice(start, islandJs.indexOf('function stopLyricClock()', start));
    assert.doesNotMatch(body, /renderPillStatus\(/);
    assert.match(body, /textContent\s*=\s*currentLyricLine\(index\)/);
  });

  it('repaints the pill once when a new lyric document arrives', () => {
    const start = islandJs.indexOf('api.onLyrics(');
    const body = islandJs.slice(start, islandJs.indexOf('api.onFocus', start));
    assert.match(body, /renderPillStatus\(\)/);
  });
});

describe('paused music hands the island back without losing resume', () => {
  const paused = {
    active: true,
    playing: false,
    title: 'Break Even',
    artist: 'Graham',
    type: 'Music',
    source: 'cloudmusic.exe',
  };

  it('recognizes paused music even when a browser live stream reports type Music', () => {
    assert.equal(isMusicMedia(paused), true);
    assert.equal(
      isMusicMedia({
        active: true,
        playing: false,
        type: 'Music',
        title: '主播 - 哔哩哔哩直播',
        source: 'msedge.exe',
      }),
      false,
    );
  });

  it('collapses only when playing music becomes paused', () => {
    assert.equal(shouldCollapseForPausedMusic({ ...paused, playing: true }, paused), true);
    assert.equal(shouldCollapseForPausedMusic(paused, paused), false);
    assert.equal(
      shouldCollapseForPausedMusic(
        { ...paused, playing: true, title: 'live', type: 'Video' },
        { ...paused, title: 'live', type: 'Video' },
      ),
      false,
    );
  });

  it('keeps the resume control until the selected idle limit', () => {
    const pausedSince = 1_000;
    assert.equal(
      pausedResumeVisible({ media: paused, pausedSince, hideAfterMin: 1, now: pausedSince + 59_999 }),
      true,
    );
    assert.equal(
      pausedResumeVisible({ media: paused, pausedSince, hideAfterMin: 1, now: pausedSince + 60_000 }),
      false,
    );
    assert.equal(
      pausedResumeVisible({ media: paused, pausedSince, hideAfterMin: 30, now: pausedSince + 29 * 60_000 }),
      true,
    );
    assert.equal(
      pausedResumeVisible({ media: paused, pausedSince, hideAfterMin: 30, now: pausedSince + 30 * 60_000 }),
      false,
    );
  });

  it('never expires the resume control when auto-hide is off', () => {
    assert.equal(
      pausedResumeVisible({ media: paused, pausedSince: 1_000, hideAfterMin: 0, now: 10_000_000_000 }),
      true,
    );
  });

  it('wires a dedicated compact control back to the media transport', () => {
    assert.match(islandHtml, /id="paused-resume"/);
    assert.match(islandCss, /\.paused-resume\s*\{/);
    assert.match(islandJs, /pausedResumeEl\.addEventListener\('click'/);
    assert.match(islandJs, /api\.control\('toggle'\)/);
  });
});

describe('media page identity and timing', () => {
  it('names the current player instead of exposing its executable id', () => {
    assert.equal(typeof mediaSourceLabel, 'function');
    assert.equal(mediaSourceLabel({ source: 'QQMusic.exe' }), 'QQ音乐');
    assert.equal(mediaSourceLabel({ source: 'cloudmusic.exe' }), '网易云音乐');
    assert.equal(mediaSourceLabel({ source: 'SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify' }), 'Spotify');
  });

  it('lets a resolved live provider outrank the browser that hosts it', () => {
    assert.equal(typeof mediaSourceLabel, 'function');
    assert.equal(
      mediaSourceLabel({ source: 'msedge.exe', live: { platform: 'bilibili' } }),
      '哔哩哔哩',
    );
    assert.equal(
      mediaSourceLabel({ source: 'chrome.exe', live: { platform: 'douyu' } }),
      '斗鱼',
    );
  });

  it('shows elapsed and total as the padded slash pair from the reference', () => {
    assert.equal(typeof mediaTimingLabel, 'function');
    assert.equal(
      mediaTimingLabel(
        { active: true, duration: 258 },
        { position: 160 },
      ),
      '02:40 / 04:18',
    );
  });

  it('uses the real broadcast start for live media', () => {
    assert.equal(typeof mediaTimingLabel, 'function');
    assert.equal(
      mediaTimingLabel(
        { active: true, duration: 0, live: { startedAt: 1_700_000_000_000 } },
        { liveSeconds: 3723 },
      ),
      '01:02:03',
    );
  });

  it('does not turn a music session with no timeline into a live stream', () => {
    assert.equal(typeof isLiveMedia, 'function');
    assert.equal(
      isLiveMedia({
        active: true,
        duration: 0,
        title: 'ghosts - Shinigami',
        source: 'cloudmusic.exe',
        liveSince: Date.now(),
      }),
      false,
    );
    assert.equal(
      mediaTimingLabel({
        active: true,
        duration: 0,
        title: 'ghosts - Shinigami',
        source: 'cloudmusic.exe',
        liveSince: Date.now(),
      }),
      '00:00 / --:--',
    );
  });

  it('recognises a live stream from provider metadata or a Bilibili title', () => {
    assert.equal(typeof isLiveMedia, 'function');
    assert.equal(
      isLiveMedia({ active: true, duration: 0, live: { platform: 'douyu' } }),
      true,
    );
    assert.equal(
      isLiveMedia({
        active: true,
        duration: 0,
        title: 'room - anchor - 哔哩哔哩直播，二次元弹幕直播平台',
      }),
      true,
    );
  });

  it('uses a lyrics lookup duration when the player omits its timeline', () => {
    assert.equal(typeof mediaTimingLabel, 'function');
    assert.equal(
      mediaTimingLabel(
        { active: true, duration: 0, title: 'ghosts - Shinigami', source: 'cloudmusic.exe' },
        { position: 160, fallbackDuration: 125 },
      ),
      '02:40 / 02:05',
    );
  });
});

describe('music page title and lyric readability', () => {
  it('leaves the track name to the island header instead of repeating it in the page', () => {
    assert.doesNotMatch(islandJs, /class="music-title(?:__text)?"/);
    assert.doesNotMatch(islandJs, /function fitMusicTitle\(/);
    assert.doesNotMatch(islandCss, /\.music-title/);
  });

  it('selects the previous, current and next lyric around the middle slot', () => {
    const lines = [{ text: '第一句' }, { text: '第二句' }, { text: '第三句' }];
    assert.equal(typeof lyricPreviewWindow, 'function');
    assert.deepEqual(lyricPreviewWindow(lines, 1), ['第一句', '第二句', '第三句']);
    assert.deepEqual(lyricPreviewWindow(lines, 0), ['', '第一句', '第二句']);
    assert.deepEqual(lyricPreviewWindow(lines, 2), ['第二句', '第三句', '']);
  });

  it('renders three lyric rows with the current one in the middle at reading size', () => {
    const start = islandJs.indexOf('function lyricPreviewHtml(');
    const body = islandJs.slice(start, islandJs.indexOf('function', start + 10));
    const order = ['data-prev-lyric', 'data-current-lyric', 'data-next-lyric']
      .map((attribute) => body.indexOf(attribute));
    assert.ok(order.every((position) => position >= 0), 'all three lyric rows need a stable hook');
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'lyrics must read previous, current, next');
    assert.ok(islandCss.includes('[data-prev-lyric]'));
    assert.ok(islandCss.includes('[data-next-lyric]'));
    const current = cssBlock('.music-current-lyric [data-current-lyric]');
    assert.match(current, /font-size:\s*17px/);
    assert.match(current, /color:\s*var\(--ink\)/);
    assert.match(current, /font-weight:\s*[5-7]00/);
  });

  it('wraps only the current lyric to two lines and keeps both neighbours visible', () => {
    const current = cssBlock('.music-current-lyric [data-current-lyric]');
    assert.match(current, /-webkit-line-clamp:\s*2/);
    assert.match(current, /white-space:\s*pre-line/);
    assert.match(current, /max-height:\s*2\.64em/);
    assert.match(current, /text-overflow:\s*ellipsis/, 'the clamped second line must signal that more words follow');
    assert.match(cssBlock('.music-current-lyric'), /max-height:\s*82px/);
    assert.match(
      islandCss,
      /\.music-current-lyric \[data-prev-lyric\],\s*\.music-current-lyric \[data-next-lyric\]\s*\{[^}]*white-space:\s*nowrap/,
    );
    const full = cssBlock('.music[data-music="lyrics"] .lyric-box .lyric-line.on');
    assert.match(full, /-webkit-line-clamp:\s*2/);
    assert.match(full, /white-space:\s*pre-line/);
    assert.match(full, /text-overflow:\s*ellipsis/);
  });

  it('keeps cover left and lyrics, transport then seek in the copy column', () => {
    assert.match(
      parityCss,
      /#island \.pgm-island-body > \.pgm-media\.music \{[^}]*grid-template-columns:\s*134px\s+minmax\(0,\s*1fr\)/,
    );
    assert.match(parityCss, /#island \.pgm-media\.music > \.pgm-cover/);
    const page = islandJs.slice(
      islandJs.indexOf('return `<div class="music pgm-media"'),
      islandJs.indexOf('/*\n * The volume key'),
    );
    assert.ok(
      page.indexOf('class="pgm-lyrics music-current-lyric') < page.indexOf('pgm-media-controls music-controls'),
      'the lyric is painted above the seek rail',
    );
    assert.ok(
      page.indexOf('pgm-media-controls music-controls') < page.indexOf('${progress}'),
      'the seek rail follows the transport in the same copy column',
    );
  });

  it('gives the expanded media page room for a separate control bar', () => {
    assert.match(islandCss, /--pages-h:\s*260px/);
    assert.match(cssBlock('.pages'), /height:\s*var\(--pages-h\)/);
    assert.match(cssBlock('.music .music-controls'), /height:\s*44px/);
    assert.match(cssBlock('.music .music-controls'), /border:\s*1px\s+solid\s+var\(--line\)/);
  });

  it('keeps one enlarged current lyric in the default window', () => {
    assert.match(
      islandCss,
      /\.music\[data-music="default"\]\s+\.lyric-box\s*\{[^}]*display:\s*none/,
    );
  });

  it('repaints the elapsed side of the time pair without rebuilding the page', () => {
    assert.ok(islandJs.includes('data-time-pair'));
    const start = islandJs.indexOf('function updateMusicLive()');
    const body = islandJs.slice(start, islandJs.indexOf('function', start + 10));
    assert.ok(body.includes("querySelector('[data-time-pair]')"));
    assert.ok(body.includes('mediaTimingLabel('));
  });
});

describe('explicit kaomoji status item', () => {
  it('keeps the user order and appends kaomoji after available readings', () => {
    assert.deepEqual(
      visiblePillStatusKeys(
        ['kaomoji', 'battery', 'clock', 'weather', 'quota'],
        { battery: true, clock: true, weather: true, quota: true },
      ),
      ['kaomoji', 'battery', 'clock', 'weather', 'quota'],
    );
    assert.deepEqual(
      visiblePillStatusKeys(
        ['battery', 'quota', 'kaomoji', 'weather'],
        { battery: true, clock: true, weather: false, quota: false },
      ),
      ['battery', 'kaomoji'],
    );
  });

  it('never lets kaomoji become the only collapsed-pill content', () => {
    assert.deepEqual(visiblePillStatusKeys(['kaomoji'], {}), []);
    assert.deepEqual(
      visiblePillStatusKeys(['weather', 'kaomoji'], { weather: false }),
      [],
      'missing readings must not turn the status row into a lone expression',
    );
    assert.equal(
      pillContentPlan({
        statusCount: visiblePillStatusKeys(['kaomoji'], {}).length,
        media: { active: false, playing: false },
      }).mode,
      'face',
    );
  });
});

describe('width cap trimming', () => {
  const gap = 7;

  it('keeps every component while the row fits', () => {
    assert.deepEqual(fitStatusRow([50, 40, 30], gap, 200), { keep: 3, truncated: false });
  });

  it('cuts whole components off the tail and says so', () => {
    // 200+140+120+14 = 474 > 436; two fit (347 + gap + "…" = 364).
    assert.deepEqual(fitStatusRow([200, 140, 120, 120], gap, 436), { keep: 2, truncated: true });
  });

  it('never leaves half a number behind', () => {
    const widths = [210, 96, 88, 64];
    const available = 330;
    const fit = fitStatusRow(widths, gap, available);
    assert.equal(fit.truncated, true);
    const kept = widths.slice(0, fit.keep).reduce((sum, w) => sum + w, 0) + gap * (fit.keep - 1);
    assert.ok(kept <= available, 'the kept prefix is all whole components');
    assert.ok(fit.keep >= 1, 'at least one component survives so the row is not just "…"');
  });

  it('keeps one oversized component rather than showing an empty marker', () => {
    assert.deepEqual(fitStatusRow([400], gap, 100), { keep: 1, truncated: false });
    assert.deepEqual(fitStatusRow([], gap, 100), { keep: 0, truncated: false });
  });

  it('reserves room for the marker it appends', () => {
    // Exactly the row width without the marker: it still has to be cut.
    assert.equal(fitStatusRow([100, 100, 100], gap, 214).truncated, true);
    assert.equal(fitStatusRow([100, 100, 100], gap, 320).truncated, false);
  });

  it('draws the marker as a quiet tail item', () => {
    assert.ok(islandCss.includes('.pill-status .stat.more'), 'the "…" needs its own rule');
    assert.ok(islandJs.includes("more.textContent = '…';"));
    assert.ok(islandJs.includes("pillEl.dataset.truncated = 'true';"));
  });
});
