/**
 * The documentation, written for the person who has to ship a character.
 *
 * Four questions in the order they are asked: what is this, how is a character
 * built, what do the numbers mean, and how do I call it. Every count is read
 * from the code — the engine for characters and expressions, and the desktop
 * settings schema for the page count — because a doc with a typed number is a
 * doc that quietly lies the first time something is added.
 *
 * Navigation on top of that: a sticky table of contents built from the h2s,
 * sections that reveal once as they enter the viewport, and a protocol table
 * that folds per group, previews an expression on row hover and copies its
 * emotionId on click. Anchors ride the existing hash route as ?section=, so
 * the router still owns the hash and a deep link survives a refresh.
 */
import {
  BODIES,
  CAST,
  FACE_META,
  FAMILIES,
  TRAIT_IDS,
  breed,
  castMember,
  type FaceGroup,
  type FaceMeta,
} from '@emojitot/core';
import {
  createCharacterRuntime,
  type CharacterRuntime,
  type CharacterRuntimeSnapshot,
} from '@emojitot/core/runtime';
import { EMOTIONS } from '@emojitot/protocol';
import { SETTINGS_NAV } from '@emojitot/settings-schema';
import { faceLabel } from './faces';
import { getLang, t, type MessageKey } from './i18n';
import { look } from './store';
import type { View } from './main';

/** The section ids are stable: they are the anchors a deep link points at. */
const SECTION_IDS = [
  'what',
  'genome',
  'families',
  'engine',
  'structure',
  'protocol',
  'desktop',
  'extend',
  'call',
] as const;

/** A literal newline for the code samples, kept out of the source as escapes. */
const NL = String.fromCharCode(10);

const COPY = {
  toc: { zh: '目录', en: 'Contents' },
  copyHint: { zh: '点击复制 emotionId', en: 'Click to copy the emotionId' },
  copied: { zh: '已复制', en: 'Copied' },
  copyFail: { zh: '复制失败', en: 'Copy failed' },
  toggle: { zh: '展开或折叠这一组', en: 'Expand or collapse this group' },
  lead: {
    zh: '从一条闭合路径到一个两位数协议，再到桌面端的两种形态。这一页写给要把它装进产品的人。',
    en: 'From one closed path to a two-digit protocol, and out to two desktop forms. Written for the person shipping it.',
  },
  engineLead: {
    zh: '静态渲染只回答“长什么样”。浏览器运行时再回答“它此刻在怎么动”：同一个状态先选表情，再选姿态配置，最后交给十六点眼型和弹簧积分器。',
    en: 'The static renderer answers what it looks like. The browser runtime answers how it is moving right now: a state selects a face, then a pose profile, then a sixteen-point eye and a spring integrator.',
  },
  engineState: {
    zh: '状态表与运动配置分开：61 张脸只定义五官，状态族提供呼吸、视线和眨眼基线，少数状态再覆盖自己的节奏。',
    en: 'The state table and motion profile stay separate: 61 faces define features, a state family sets breathing, gaze and blink baselines, and only distinct states override the rhythm.',
  },
  engineEyes: {
    zh: '每种眼型都有 16 个顶点。形变只插值同编号顶点，所以从圆眼到星眼、从横线到半睁不会先消失再出现。',
    en: 'Every eye shape has 16 vertices. Morphing interpolates matching vertices, so a round eye becoming a star, or a line becoming half-lidded, never disappears between frames.',
  },
  engineSpring: {
    zh: '角色姿态由真实的弹簧状态驱动：目标、速度、阻尼和刚度，按最多 1/120 秒的小步长稳定积分。界面过渡使用同一套物理节奏的 linear() 曲线。',
    en: 'Character pose is driven by real spring state: target, velocity, damping and stiffness, integrated in stable steps of at most 1/120s. Interface chrome uses linear() curves with the same physical rhythm.',
  },
  engineRuntime: {
    zh: '一个页面只挂一个长期运行时；表情馆示例和灯箱按需创建，场景中的一个仲裁脸复用同一实例。路由卸载必须 destroy，避免后台 RAF 继续跑。',
    en: 'One long-lived runtime per surface; gallery specimens and the lightbox mount on demand, and the scene reuses one arbiter instance. Route teardown must destroy the rig so no background RAF survives.',
  },
  engineTry: { zh: '试三种状态', en: 'Try three states' },
  engineEye: { zh: '实时眼型', en: 'Live eye' },
  engineTilt: { zh: '弹簧倾角', en: 'Spring tilt' },
  structureLead: {
    zh: '结构按“纯数据 → 纯渲染 → 浏览器运行时 → 页面宿主”分层。这样静态导出、桌面端、文档缩略图和会动的控制台共用同一份角色定义。',
    en: 'The structure layers pure data, pure rendering, the browser runtime and page hosts. Static export, desktop, docs thumbnails and the live console therefore share one character definition.',
  },
  structureState: {
    zh: '协议与角色表',
    en: 'Protocol and cast data',
  },
  structureMotion: {
    zh: '眼睛拓扑、运动配置、弹簧与状态历史',
    en: 'Eye topology, profiles, springs and transition history',
  },
  structureRender: {
    zh: '无 DOM 的确定性 SVG；仍用于导出、缩略图与静态页面',
    en: 'Deterministic SVG with no DOM; still used for export, thumbnails and static pages',
  },
  structureRuntime: {
    zh: '唯一有浏览器状态的生命周期层：指针、RAF、暂停、减少动态与清理',
    en: 'The only browser-stateful lifecycle layer: pointer, RAF, pause, reduced motion and cleanup',
  },
} as const;

type CopyKey = keyof typeof COPY;

/** Docs-only strings, kept out of the shared dictionary on purpose. */
function copy(key: CopyKey): string {
  return getLang() === 'zh' ? COPY[key].zh : COPY[key].en;
}

/** The protocol id for a state: the table's own id column is the state. */
const EMOTION_ID_BY_STATE = new Map(EMOTIONS.map((emotion) => [emotion.state, emotion.id]));

/**
 * The two-digit id, or an empty string for one of the ten engine-only states.
 *
 * Those ten have no protocol number; printing the state id in the id column
 * put an English word (`powering-down`) in a column of numbers, which read as
 * a missing translation. The copy action still copies the state id, because
 * that is what a developer wants from that row.
 */
function emotionIdOf(state: string): string {
  return EMOTION_ID_BY_STATE.get(state) ?? '';
}

const nameOf = (meta: { name: string }, state: string): string => {
  const label = faceLabel(state);
  return label === state ? meta.name : label;
};

function sectionHtml(id: string, num: string, title: string, kicker: string, body: string): string {
  return '<section class="doc-section sd-section" id="sec-' + id + '" data-section="' + id +
    '" data-num="' + num + '"><h2 id="h-' + id + '">' + title +
    '<em>' + kicker + '</em></h2>' + body + '</section>';
}

function table(head: string[], rows: string[][]): string {
  return '<table class="doc-table"><thead><tr>' + head.map((h) => '<th>' + h + '</th>').join('') +
    '</tr></thead><tbody>' + rows
      .map((r) => '<tr>' + r.map((c) => '<td>' + c + '</td>').join('') + '</tr>')
      .join('') + '</tbody></table>';
}

/** An HTML-escaped code sample, one line per array entry. */
function code(lines: string[]): string {
  return '<pre><code>' + lines.join(NL) + '</code></pre>';
}

/** The protocol table for one group: folding, hover preview, click to copy. */
function faceTable(metas: readonly FaceMeta[]): string {
  const head = [
    t('docs.tableId'),
    t('docs.tableState'),
    t('docs.tableName'),
    t('docs.tableDesc'),
    'emotionId',
  ];
  const rows = metas.map((meta) => {
    const emotionId = emotionIdOf(meta.id);
    return '<tr class="sd-row" data-state="' + meta.id + '" data-emotion="' + (emotionId || meta.id) +
      '" data-emotion-label="' + (emotionId || '—') + '" tabindex="0" title="' + copy('copyHint') + '">' +
      '<td>#' + meta.id + '</td>' +
      '<td>' + meta.id + '</td>' +
      '<td>' + nameOf(meta, meta.id) + '</td>' +
      '<td>' + meta.desc + '</td>' +
      '<td class="sd-copy">' + (emotionId || '—') + '</td>' +
      '<td class="sd-preview" data-preview="' + meta.id + '" aria-hidden="true"></td>' +
      '</tr>';
  });
  return '<table class="doc-table sd-faces"><thead><tr>' +
    head.map((label) => '<th>' + label + '</th>').join('') +
    '<th class="sd-th-preview" aria-hidden="true"></th></tr></thead><tbody>' +
    rows.join('') + '</tbody></table>';
}

const FACE_GROUPS: { id: FaceGroup; labelKey: MessageKey }[] = [
  { id: 'life', labelKey: 'docs.group.life' },
  { id: 'emotion', labelKey: 'docs.group.emotion' },
  { id: 'agent', labelKey: 'docs.group.agent' },
];

export function createDocs(): View {
  const el = document.createElement('div');
  el.className = 'docs-view';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timeouts = new Set<number>();
  const flashTimers = new Map<HTMLElement, number>();

  const familyTable = table(
    [t('docs.tableFamily'), t('docs.tableMembers'), t('docs.tableBody'), t('docs.tableSample')],
    FAMILIES.map((family) => {
      const members = CAST.filter((member) => member.family === family.id);
      const bodies = [...new Set(members.map((member) => member.body))].join(', ');
      const sample = members
        .slice(0, 3)
        .map((member) => (getLang() === 'zh' ? member.name.zh : member.name.en))
        .join(', ');
      return [family.zh + ' / ' + family.en, String(members.length), bodies, sample];
    }),
  );

  const sample = breed(castMember('lizi')!, castMember('yinghua')!, 7);

  const intro = '<p>' + t('docs.whatP1') + '</p><p>' + t('docs.whatP2', {
    cast: CAST.length,
    faces: FACE_META.length,
    bodies: BODIES.length,
  }) + '</p>';

  const genomeDoc = '<p>' + t('docs.genomeIntro') + '</p>' +
    '<ul>' +
    '<li><b>body</b> — ' + t('docs.genomeBody', {
      bodies: BODIES.length,
      sample: BODIES.slice(0, 6).map((body) => body.id).join(', '),
    }) + '</li>' +
    '<li><b>color</b> — ' + t('docs.genomeColor') + '</li>' +
    '<li><b>traits</b> — ' + t('docs.genomeTrait', { traits: TRAIT_IDS.length }) + '</li>' +
    '<li><b>face</b> — ' + t('docs.genomeFace', { faces: FACE_META.length }) + '</li>' +
    '</ul>' +
    '<h3>' + t('docs.finishHeading') + '</h3>' +
    '<p>' + t('docs.finishBody') + '</p>' +
    code(['renderCast({ id: \'lizi\', state: \'happy\', style: \'sticker\', size: 96 })']) +
    '<h3>' + t('docs.breedHeading') + '</h3>' +
    '<p>' + t('docs.breedBody') + '</p>' +
    code([
      'breed(castMember(\'lizi\'), castMember(\'yinghua\'), 7)',
      '// → ' + sample.name.zh + ' · ' + sample.body + ' · ' + sample.color,
    ]);

  const engineLayers = [
    { id: 'state', n: '01', title: 'state', body: copy('engineState') },
    { id: 'eyes', n: '02', title: 'polygon eyes', body: copy('engineEyes') },
    { id: 'spring', n: '03', title: 'spring', body: copy('engineSpring') },
    { id: 'runtime', n: '04', title: 'runtime', body: copy('engineRuntime') },
  ];

  const engineDoc = '<p>' + copy('engineLead') + '</p>' +
    '<div class="engine-anatomy">' +
    '<ol class="engine-layers">' +
    engineLayers.map((layer) =>
      '<li data-family="' + (layer.id === 'runtime' ? 'agent' : layer.id === 'spring' ? 'signal' : 'life') + '">' +
      '<span>' + layer.n + '</span><b>' + layer.title + '</b><p>' + layer.body + '</p></li>',
    ).join('') +
    '</ol>' +
    '<aside class="engine-specimen" data-family="life" aria-label="' + t('docs.engine') + '">' +
    '<div class="engine-specimen-head"><span><i aria-hidden="true"></i>LIVE RIG</span>' +
    '<code data-engine-eye>pill</code></div>' +
    '<div class="engine-runtime" data-engine-runtime></div>' +
    '<dl class="engine-metrics"><div><dt>' + copy('engineEye') + '</dt><dd data-engine-eye>pill</dd></div>' +
    '<div><dt>' + copy('engineTilt') + '</dt><dd data-engine-tilt>0.0°</dd></div></dl>' +
    '<div class="engine-controls"><span>' + copy('engineTry') + '</span>' +
    ['idle', 'thinking', 'done'].map((state) =>
      '<button type="button" data-engine-state="' + state + '" aria-pressed="' +
      (state === 'idle') + '">' + faceLabel(state) + '</button>',
    ).join('') +
    '</div></aside></div>' +
    code([
      'import { createCharacterRuntime } from \'@emojitot/core/runtime\';',
      '',
      'const rig = createCharacterRuntime(stage, { cast: \'tot\', state: \'idle\' });',
      'rig.setState(\'thinking\', \'agent:plan\');',
      'rig.pulse(\'burst\');',
      '// host teardown',
      'rig.destroy();',
    ]);

  const structureDoc = '<p>' + copy('structureLead') + '</p>' +
    '<div class="project-structure">' +
    code([
      'packages/',
      '  protocol/        two-digit state contract',
      '  core/',
      '    src/face.ts    expressions and groups',
      '    src/render.ts  pure SVG composition',
      '    src/runtime.ts browser lifecycle',
      '    src/motion/',
      '      eyes.ts     16-point topology + morph',
      '      profiles.ts acting, gaze and blink',
      '      spring.ts   bounded integrator',
      '      state-machine.ts transition history',
      'apps/',
      '  gallery/src/',
      '    console.ts   live studio',
      '    wall.ts      specimens + lightbox',
      '    scene.ts     arbiter + transition tape',
      '    docs.ts      this manual',
    ]) +
    '<div class="project-parts">' +
    '<article data-family="life"><span>DATA</span><b>protocol + cast</b><p>' + copy('structureState') + '</p></article>' +
    '<article data-family="emotion"><span>MOTION</span><b>motion/</b><p>' + copy('structureMotion') + '</p></article>' +
    '<article data-family="agent"><span>STILL</span><b>render.ts</b><p>' + copy('structureRender') + '</p></article>' +
    '<article data-family="signal"><span>LIVE</span><b>runtime.ts</b><p>' + copy('structureRuntime') + '</p></article>' +
    '</div></div>';

  const groupsHtml = FACE_GROUPS.map((group) => {
    const metas = FACE_META.filter((meta) => meta.group === group.id);
    return '<details class="card sd-group" data-group="' + group.id + '"' + (group.id === 'life' ? ' open' : '') + '>' +
      '<summary class="sd-group-head" title="' + copy('toggle') + '">' +
      '<i class="sd-dot" aria-hidden="true"></i>' +
      '<span>' + t(group.labelKey) + '</span>' +
      '<b>' + metas.length + '</b>' +
      '<span class="sd-group-hint" aria-hidden="true"></span>' +
      '</summary>' +
      faceTable(metas) +
      '</details>';
  }).join('');

  const callDoc = code([
    '&lt;emojitot-ball cast="lizi" finish="sticker" state="happy"&gt;&lt;/emojitot-ball&gt;',
    '',
    'import { renderCast, faceMeta, facesInGroup } from \'@emojitot/core\';',
    '',
    'renderCast({ id: \'lizi\', state: \'happy\', size: 96 });',
    'faceMeta(\'sleeping\');        // { id, name, group, desc }',
    'facesInGroup(\'agent\');       // every agent state, in table order',
  ]) +
    '<p>' + t('docs.groupsSummary', {
      life: FACE_META.filter((meta) => meta.group === 'life').length,
      emotion: FACE_META.filter((meta) => meta.group === 'emotion').length,
      agent: FACE_META.filter((meta) => meta.group === 'agent').length,
    }) + '</p>';

  const desktopDoc = '<p>' + t('docs.desktopP1') + '</p>' +
    '<table class="doc-table"><thead><tr><th>' + t('docs.tableForm') + '</th><th>' + t('docs.tableWhere') +
    '</th><th>' + t('docs.tableWhat') + '</th></tr></thead><tbody>' +
    '<tr><td><b>' + t('docs.desktopIsland') + '</b></td><td>' + t('docs.islandWhere') + '</td><td>' +
    t('docs.islandWhat') + '</td></tr>' +
    '<tr><td><b>' + t('docs.desktopBall') + '</b></td><td>' + t('docs.ballWhere') + '</td><td>' +
    t('docs.ballWhat') + '</td></tr>' +
    '</tbody></table>' +
    '<p>' + t('docs.desktopP2') + '</p>' +
    '<h3>' + t('docs.sizeHeading') + '</h3>' +
    '<p>' + t('docs.sizeBody') + '</p>' +
    '<h3>' + t('docs.settingsHeading') + '</h3>' +
    '<p>' + t('docs.settingsBody', { pages: SETTINGS_NAV.reduce((total, group) => total + group.items.length, 0) }) + '</p>';

  const extendDoc = '<p>' + t('docs.extendIntro') + '</p>' +
    code([
      '// apps/desktop/src/shared/schema.js',
      '{ key: \'focus\', title: \'焦点\', sub: \'番茄钟\', icon: \'timer\', service: \'focus\' }',
      '',
      '// renderer/island.js',
      'function focusPage() { return \'&lt;div class=&quot;focus&quot;&gt;…&lt;/div&gt;\'; }',
      'const RENDERERS = { focus: focusPage };',
      '',
      '// main/services/focus.js — owns its data, pushes on change',
      'focus.onChange((value) =&gt; island.send(\'island:focus\', value));',
    ]) +
    '<p>' + t('docs.extendP') + '</p>';

  const sections = [
    { id: SECTION_IDS[0], num: '01', kicker: 'What', title: t('docs.what'), body: intro },
    { id: SECTION_IDS[1], num: '02', kicker: 'Genome', title: t('docs.genome'), body: genomeDoc },
    { id: SECTION_IDS[2], num: '03', kicker: 'Families', title: t('docs.families'), body: familyTable },
    { id: SECTION_IDS[3], num: '04', kicker: 'Motion', title: t('docs.engine'), body: engineDoc },
    { id: SECTION_IDS[4], num: '05', kicker: 'Architecture', title: t('docs.structure'), body: structureDoc },
    {
      id: SECTION_IDS[5],
      num: '06',
      kicker: 'Protocol',
      title: t('docs.protocol'),
      body: '<p>' + t('docs.protocolLead') + '</p>' + groupsHtml,
    },
    { id: SECTION_IDS[6], num: '07', kicker: 'Desktop', title: t('docs.desktop'), body: desktopDoc },
    { id: SECTION_IDS[7], num: '08', kicker: 'Extend', title: t('docs.extend'), body: extendDoc },
    { id: SECTION_IDS[8], num: '09', kicker: 'API', title: t('docs.call'), body: callDoc },
  ];

  el.innerHTML = '<header class="page-head">' +
    '<div>' +
    '<div class="eyebrow"><b>04</b><i></i>Manual<i></i>Protocol</div>' +
    '<h1 class="page-title">' + t('docs.title') + '<span>read it, then ship a face</span></h1>' +
    '</div>' +
    '<div>' +
    '<p class="page-lead">' + copy('lead') + '</p>' +
    '<div class="page-stats">' +
    '<div class="stat"><b>' + sections.length + '</b><span>sections</span></div>' +
    '<div class="stat"><b>' + FACE_META.length + '</b><span>faces</span></div>' +
    '<div class="stat"><b>' + BODIES.length + '</b><span>bodies</span></div>' +
    '</div>' +
    '</div>' +
    '</header>' +
    '<div class="sd-docs-shell">' +
    '<nav class="card sd-toc" aria-label="' + copy('toc') + '">' +
    '<p class="sd-toc-title">' + copy('toc') + '</p>' +
    '<ol class="sd-toc-list">' +
    sections.map((section) => '<li><button type="button" class="sd-toc-link" data-goto="' + section.id +
      '">' + section.title + '</button></li>').join('') +
    '</ol>' +
    '</nav>' +
    '<div class="sd-doc-body">' +
    '<p class="sd-live" aria-live="polite"></p>' +
    sections.map((section) => sectionHtml(section.id, section.num, section.title, section.kicker, section.body)).join('') +
    '</div>' +
    '</div>';

  const live = el.querySelector<HTMLElement>('.sd-live')!;
  const tocLinks = new Map<string, HTMLElement>();
  for (const link of el.querySelectorAll<HTMLElement>('.sd-toc-link')) {
    tocLinks.set(link.dataset.goto!, link);
  }
  const sectionEls = [...el.querySelectorAll<HTMLElement>('.sd-section')];
  const engineHost = el.querySelector<HTMLElement>('[data-engine-runtime]');
  let engineRuntime: CharacterRuntime | null = null;

  function paintEngineTelemetry(snapshot: CharacterRuntimeSnapshot): void {
    for (const node of el.querySelectorAll<HTMLElement>('[data-engine-eye]')) {
      node.textContent = snapshot.eye;
    }
    const tilt = el.querySelector<HTMLElement>('[data-engine-tilt]');
    if (tilt) tilt.textContent = snapshot.rotation.toFixed(1) + '°';
    for (const button of el.querySelectorAll<HTMLElement>('[data-engine-state]')) {
      button.setAttribute('aria-pressed', String(button.dataset.engineState === snapshot.state));
    }
  }

  if (engineHost) {
    engineRuntime = createCharacterRuntime(engineHost, {
      cast: look.cast || 'tot',
      state: 'idle',
      size: 132,
      style: look.finish,
      followPointer: false,
      onTelemetry: paintEngineTelemetry,
    });
  }

  /** Mark one entry of the contents as the section you are reading. */
  function setActiveToc(id: string): void {
    for (const [key, link] of tocLinks) {
      const on = key === id;
      link.classList.toggle('is-active', on);
      if (on) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }

  /** Record the section in the URL without touching the router's hash route. */
  function rememberSection(id: string): void {
    try {
      const route = location.hash.split('?')[0] || '#/docs';
      history.replaceState(null, '', route + '?section=' + encodeURIComponent(id));
    } catch {
      /* sandboxed or file:// — the jump still works */
    }
  }

  function goTo(id: string, smooth = true): void {
    const target = el.querySelector<HTMLElement>('#sec-' + id);
    if (!target) return;
    target.scrollIntoView({ behavior: smooth && !reduced ? 'smooth' : 'auto', block: 'start' });
    setActiveToc(id);
    rememberSection(id);
  }

  /** Read ?section= off the hash the router already uses. */
  function requestedSection(): string {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, query = ''] = raw.split('?');
    if (path !== 'docs') return '';
    return new URLSearchParams(query).get('section') ?? '';
  }

  /* ------------------------------------------------------ observations */

  const visibleTops = new Map<string, number>();

  const tocObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const id = (entry.target as HTMLElement).dataset.section;
      if (!id) continue;
      if (entry.isIntersecting) visibleTops.set(id, entry.boundingClientRect.top);
      else visibleTops.delete(id);
    }
    if (!visibleTops.size) return;
    const ranked = [...visibleTops.entries()].sort((a, b) => a[1] - b[1]);
    // The section whose top is closest to the band's top wins; one already
    // scrolled past only wins when nothing sits below it.
    const below = ranked.find(([, top]) => top >= 0);
    setActiveToc((below ?? ranked[ranked.length - 1])[0]);
  }, { rootMargin: '-10% 0px -72% 0px' });

  const revealObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('in');
      revealObserver.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.02 });

  for (const section of sectionEls) {
    if (reduced) section.classList.add('in');
    else revealObserver.observe(section);
    tocObserver.observe(section);
  }

  /* ------------------------------------------------------------- actions */

  function fillPreview(cell: HTMLElement): void {
    if (cell.dataset.ready === '1') return;
    const state = cell.dataset.preview ?? 'idle';
    const ball = document.createElement('emojitot-ball');
    ball.setAttribute('cast', look.cast || 'lizi');
    ball.setAttribute('state', state);
    ball.setAttribute('size', '24');
    ball.setAttribute('finish', 'flat');
    cell.replaceChildren(ball);
    cell.dataset.ready = '1';
  }

  async function copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* clipboard permission denied: fall back to a selection copy */
    }
    try {
      const sink = document.createElement('textarea');
      sink.className = 'sd-sink';
      sink.value = text;
      sink.setAttribute('readonly', '');
      document.body.append(sink);
      sink.select();
      const ok = document.execCommand('copy');
      sink.remove();
      return ok;
    } catch {
      return false;
    }
  }

  async function copyRow(row: HTMLElement): Promise<void> {
    const id = row.dataset.emotion ?? '';
    const restore = row.dataset.emotionLabel ?? id;
    const cell = row.querySelector<HTMLElement>('.sd-copy');
    if (!cell) return;
    const ok = await copyText(id);
    const label = ok ? copy('copied') + ' ' + id : copy('copyFail');
    cell.dataset.flash = ok ? 'ok' : 'fail';
    cell.textContent = label;
    live.textContent = label;
    row.classList.add('is-flashed');
    const previous = flashTimers.get(row);
    if (previous) {
      window.clearTimeout(previous);
      timeouts.delete(previous);
    }
    const timer = window.setTimeout(() => {
      timeouts.delete(timer);
      flashTimers.delete(row);
      cell.textContent = restore;
      delete cell.dataset.flash;
      row.classList.remove('is-flashed');
    }, 1200);
    flashTimers.set(row, timer);
    timeouts.add(timer);
  }

  el.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const engineButton = target.closest<HTMLElement>('[data-engine-state]');
    if (engineButton) {
      const state = engineButton.dataset.engineState;
      if (state) engineRuntime?.setState(state, 'docs:preview');
      return;
    }
    const link = target.closest<HTMLElement>('.sd-toc-link');
    if (link) {
      goTo(link.dataset.goto!);
      return;
    }
    const row = target.closest<HTMLElement>('.sd-row');
    if (row) void copyRow(row);
  });

  el.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = (event.target as HTMLElement).closest<HTMLElement>('.sd-row');
    if (!row) return;
    event.preventDefault();
    void copyRow(row);
  });

  el.addEventListener('mouseover', (event) => {
    // Anywhere on the row is the target: the preview lives in the last cell,
    // so waiting for the pointer to reach that cell would mean never showing it.
    const row = (event.target as HTMLElement).closest<HTMLElement>('.sd-row');
    const cell = row?.querySelector<HTMLElement>('.sd-preview');
    if (cell) fillPreview(cell);
  });

  const initial = requestedSection();
  if (initial) {
    // The view is not in the document until the router mounts it.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => goTo(initial, false));
    });
  } else {
    setActiveToc(SECTION_IDS[0]);
  }

  return {
    el,
    dispose(): void {
      tocObserver.disconnect();
      revealObserver.disconnect();
      engineRuntime?.destroy();
      engineRuntime = null;
      for (const id of timeouts) window.clearTimeout(id);
      timeouts.clear();
      flashTimers.clear();
    },
  };
}
