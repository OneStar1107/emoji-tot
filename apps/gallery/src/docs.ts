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
import { EMOTIONS } from '@emojitot/protocol';
import { SETTINGS_NAV } from '@emojitot/settings-schema';
import { getLang, t } from './i18n';
import { look } from './store';
import type { View } from './main';

/** The section ids are stable: they are the anchors a deep link points at. */
const SECTION_IDS = ['what', 'genome', 'families', 'protocol', 'desktop', 'extend', 'call'] as const;

const COPY = {
  toc: { zh: '目录', en: 'Contents' },
  copyHint: { zh: '点击复制 emotionId', en: 'Click to copy the emotionId' },
  copied: { zh: '已复制', en: 'Copied' },
  copyFail: { zh: '复制失败', en: 'Copy failed' },
  toggle: { zh: '展开或折叠这一组', en: 'Expand or collapse this group' },
} as const;

type CopyKey = keyof typeof COPY;

/** Docs-only strings, kept out of the shared dictionary on purpose. */
function copy(key: CopyKey): string {
  return getLang() === 'zh' ? COPY[key].zh : COPY[key].en;
}

/** The protocol id for a state: the table's own id column is the state. */
const EMOTION_ID_BY_STATE = new Map(EMOTIONS.map((emotion) => [emotion.state, emotion.id]));

function emotionIdOf(state: string): string {
  return EMOTION_ID_BY_STATE.get(state) ?? state;
}

const nameOf = (meta: { name: string }, state: string): string => {
  const emotion = EMOTIONS.find((item) => item.state === state);
  if (!emotion) return meta.name;
  return getLang() === 'zh' ? emotion.name.zh : emotion.name.en;
};

/*
 * A small stylesheet for this page's own additions.
 *
 * Structure and motion only, no palette: the shared style.css describes the
 * screen, and these selectors are scoped to the .sd- nodes this view creates.
 * It lives here so the two interactions are presentable before the shared
 * sheet is rewritten; the class names are listed in the hand-off report.
 */
const STYLE_ID = 'sd-docs-style';
const CSS = String.raw`
.sd-docs-shell {
  display: grid;
  grid-template-columns: 208px minmax(0, 1fr);
  gap: 26px;
  align-items: start;
}
.sd-toc {
  position: sticky;
  top: 58px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 10px;
}
.sd-toc-title {
  margin: 0;
  font-size: 11px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--muted);
}
.sd-toc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sd-toc-link {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: none;
  font: inherit;
  font-size: 12px;
  color: var(--muted);
  padding: 5px 8px;
  border-radius: 7px;
  cursor: pointer;
  transition: color 120ms cubic-bezier(.2,.8,.2,1),
    background 120ms cubic-bezier(.2,.8,.2,1),
    transform 120ms cubic-bezier(.2,.8,.2,1);
}
.sd-toc-link:hover {
  color: var(--ink);
  background: color-mix(in oklab, var(--ink) 6%, transparent);
}
.sd-toc-link.is-active {
  color: var(--ink);
  font-weight: 600;
  transform: translateX(2px);
}
.sd-toc-link.is-active::before { content: "—"; margin-right: 5px; opacity: .6; }

.sd-doc-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 26px;
  /* Room for the last section to reach the top of the viewport. */
  padding-bottom: 45vh;
}
.sd-section {
  /* Clear the fixed top bar when a section is scrolled to. */
  scroll-margin-top: 64px;
  transition: opacity 220ms cubic-bezier(.2,.8,.2,1), transform 220ms cubic-bezier(.2,.8,.2,1);
}
.sd-section:not(.in) { opacity: 0; transform: translateY(12px); }

.card.sd-group {
  display: block;
  padding: 10px 12px 2px;
  margin-top: 8px;
}
.card.sd-group > summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  list-style: none;
}
.card.sd-group > summary::-webkit-details-marker { display: none; }
.sd-group-head b { font-size: 11px; font-weight: 600; color: var(--muted); }
.sd-group-hint { margin-left: auto; font-size: 11px; color: var(--muted); }
.sd-group-hint::before { content: "▾"; }
.sd-group[open] .sd-group-hint::before { content: "▴"; }
.sd-group[data-group="life"] .sd-dot { background: #2f7fd6; opacity: 1; }
.sd-group[data-group="emotion"] .sd-dot { background: #d68a2f; opacity: 1; }
.sd-group[data-group="agent"] .sd-dot { background: var(--ink); opacity: 1; }

.sd-faces { margin-top: 4px; }
.sd-th-preview { width: 40px; }
.sd-row {
  cursor: pointer;
  transition: background 120ms cubic-bezier(.2,.8,.2,1);
}
.sd-row:hover, .sd-row:focus-visible { background: color-mix(in oklab, var(--ink) 5%, transparent); }
.sd-row:focus-visible { outline: 1px solid var(--ink); outline-offset: -1px; }
.sd-row.is-flashed { background: color-mix(in oklab, var(--ink) 9%, transparent); }
.sd-copy { color: var(--muted); font-variant-numeric: tabular-nums; }
.sd-copy[data-flash] { color: var(--ink); font-weight: 600; }
.sd-preview { width: 40px; }
.sd-preview emojitot-ball {
  opacity: 0;
  transform: translateX(-4px);
  transition: opacity 140ms cubic-bezier(.2,.8,.2,1), transform 140ms cubic-bezier(.2,.8,.2,1);
}
.sd-row:hover .sd-preview emojitot-ball,
.sd-row:focus-visible .sd-preview emojitot-ball { opacity: 1; transform: none; }
.sd-live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  margin: 0;
}
.sd-sink { position: fixed; top: -1000px; left: 0; opacity: 0; }

@media (max-width: 900px) {
  .sd-docs-shell { grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .sd-toc { position: static; }
  .sd-toc-list { flex-direction: row; flex-wrap: wrap; }
  .sd-toc-link { width: auto; }
}
@media (prefers-reduced-motion: reduce) {
  .sd-section { transition: none; }
  .sd-section:not(.in) { opacity: 1; transform: none; }
  .sd-toc-link, .sd-row, .sd-preview emojitot-ball { transition: none; }
}
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

function sectionHtml(id: string, title: string, body: string): string {
  return `<section class="doc-section sd-section" id="sec-${id}" data-section="${id}"><h2 id="h-${id}">${title}</h2>${body}</section>`;
}

function table(head: string[], rows: string[][]): string {
  return `<table class="doc-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
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
    return `<tr class="sd-row" data-state="${meta.id}" data-emotion="${emotionId}" tabindex="0" title="${copy('copyHint')}">
      <td>#${meta.id}</td>
      <td>${meta.id}</td>
      <td>${nameOf(meta, meta.id)}</td>
      <td>${meta.desc}</td>
      <td class="sd-copy">${emotionId}</td>
      <td class="sd-preview" data-preview="${meta.id}" aria-hidden="true"></td>
    </tr>`;
  });
  return `<table class="doc-table sd-faces"><thead><tr>${head.map((label) => `<th>${label}</th>`).join('')}<th class="sd-th-preview" aria-hidden="true"></th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

const FACE_GROUPS: { id: FaceGroup; label: string }[] = [
  { id: 'life', label: t('docs.group.life') },
  { id: 'emotion', label: t('docs.group.emotion') },
  { id: 'agent', label: t('docs.group.agent') },
];

export function createDocs(): View {
  const el = document.createElement('div');
  el.className = 'docs-view sd-docs';

  ensureStyle();

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
      return [`${family.zh} / ${family.en}`, String(members.length), bodies, sample];
    }),
  );

  const sample = breed(castMember('lizi')!, castMember('yinghua')!, 7);

  const intro = `<p>${t('docs.whatP1')}</p><p>${t('docs.whatP2', {
    cast: CAST.length,
    faces: FACE_META.length,
    bodies: BODIES.length,
  })}</p>`;

  const genomeDoc = `<p>${t('docs.genomeIntro')}</p>
      <ul>
        <li><b>body</b> — ${t('docs.genomeBody', { bodies: BODIES.length, sample: BODIES.slice(0, 6).map((body) => body.id).join(', ') })}</li>
        <li><b>color</b> — ${t('docs.genomeColor')}</li>
        <li><b>traits</b> — ${t('docs.genomeTrait', { traits: TRAIT_IDS.length })}</li>
        <li><b>face</b> — ${t('docs.genomeFace', { faces: FACE_META.length })}</li>
      </ul>
      <h3>${t('docs.finishHeading')}</h3>
      <p>${t('docs.finishBody')}</p>
      <pre class="snippet"><code>renderCast({ id: 'lizi', state: 'happy', style: 'sticker', size: 96 })</code></pre>
      <h3>${t('docs.breedHeading')}</h3>
      <p>${t('docs.breedBody')}</p>
      <pre class="snippet"><code>breed(castMember('lizi'), castMember('yinghua'), 7)
// → ${sample.name.zh} · ${sample.body} · ${sample.color}</code></pre>`;

  const groupsHtml = FACE_GROUPS.map((group) => {
    const metas = FACE_META.filter((meta) => meta.group === group.id);
    return `<details class="card sd-group" data-group="${group.id}" open>
        <summary class="sd-group-head" title="${copy('toggle')}">
          <i class="sd-dot" aria-hidden="true"></i>
          <span>${group.label}</span>
          <b>${metas.length}</b>
          <span class="sd-group-hint" aria-hidden="true"></span>
        </summary>
        ${faceTable(metas)}
      </details>`;
  }).join('');

  const callDoc = `<pre class="snippet"><code>&lt;emojitot-ball cast="lizi" finish="sticker" state="happy"&gt;&lt;/emojitot-ball&gt;

import { renderCast, faceMeta, facesInGroup } from '@emojitot/core';

renderCast({ id: 'lizi', state: 'happy', size: 96 });
faceMeta('sleeping');        // { id, name, group, desc }
facesInGroup('agent');       // every agent state, in table order</code></pre>
      <p>${t('docs.groupsSummary', {
        life: FACE_META.filter((meta) => meta.group === 'life').length,
        emotion: FACE_META.filter((meta) => meta.group === 'emotion').length,
        agent: FACE_META.filter((meta) => meta.group === 'agent').length,
      })}</p>`;

  const desktopDoc = `<p>${t('docs.desktopP1')}</p>
      <table class="doc-table"><thead><tr><th>${t('docs.tableForm')}</th><th>${t('docs.tableWhere')}</th><th>${t('docs.tableWhat')}</th></tr></thead><tbody>
        <tr><td><b>${t('docs.desktopIsland')}</b></td><td>${t('docs.islandWhere')}</td><td>${t('docs.islandWhat')}</td></tr>
        <tr><td><b>${t('docs.desktopBall')}</b></td><td>${t('docs.ballWhere')}</td><td>${t('docs.ballWhat')}</td></tr>
      </tbody></table>
      <p>${t('docs.desktopP2')}</p>
      <h3>${t('docs.sizeHeading')}</h3>
      <p>${t('docs.sizeBody')}</p>
      <h3>${t('docs.settingsHeading')}</h3>
      <p>${t('docs.settingsBody', { pages: SETTINGS_NAV.reduce((total, group) => total + group.items.length, 0) })}</p>`;

  const extendDoc = `<p>${t('docs.extendIntro')}</p>
      <pre class="snippet"><code>// apps/desktop/src/shared/schema.js
{ key: 'focus', title: '焦点', sub: '番茄钟', icon: 'timer', service: 'focus' }

// renderer/island.js
function focusPage() { return '&lt;div class=&quot;focus&quot;&gt;…&lt;/div&gt;'; }
const RENDERERS = { focus: focusPage };

// main/services/focus.js — owns its data, pushes on change
focus.onChange((value) =&gt; island.send('island:focus', value));</code></pre>
      <p>${t('docs.extendP')}</p>`;


  const sections = [
    { id: SECTION_IDS[0], title: t('docs.what'), body: intro },
    { id: SECTION_IDS[1], title: t('docs.genome'), body: genomeDoc },
    { id: SECTION_IDS[2], title: t('docs.families'), body: familyTable },
    {
      id: SECTION_IDS[3],
      title: t('docs.protocol'),
      body: `<p>${t('docs.protocolLead')}</p>${groupsHtml}`,
    },
    { id: SECTION_IDS[4], title: t('docs.desktop'), body: desktopDoc },
    { id: SECTION_IDS[5], title: t('docs.extend'), body: extendDoc },
    { id: SECTION_IDS[6], title: t('docs.call'), body: callDoc },
  ];

  el.innerHTML = `<div class="sd-docs-shell">
    <nav class="card sd-toc" aria-label="${copy('toc')}">
      <p class="sd-toc-title">${copy('toc')}</p>
      <ol class="sd-toc-list">
        ${sections.map((section) => `<li><button type="button" class="sd-toc-link" data-goto="${section.id}">${section.title}</button></li>`).join('')}
      </ol>
    </nav>
    <div class="sd-doc-body">
      <p class="sd-live" aria-live="polite"></p>
      ${sections.map((section) => sectionHtml(section.id, section.title, section.body)).join('')}
    </div>
  </div>`;

  const live = el.querySelector<HTMLElement>('.sd-live')!;
  const tocLinks = new Map<string, HTMLElement>();
  for (const link of el.querySelectorAll<HTMLElement>('.sd-toc-link')) {
    tocLinks.set(link.dataset.goto!, link);
  }
  const sectionEls = [...el.querySelectorAll<HTMLElement>('.sd-section')];

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
      history.replaceState(null, '', `${route}?section=${encodeURIComponent(id)}`);
    } catch {
      /* sandboxed or file:// — the jump still works */
    }
  }

  function goTo(id: string, smooth = true): void {
    const target = el.querySelector<HTMLElement>(`#sec-${id}`);
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
    const cell = row.querySelector<HTMLElement>('.sd-copy');
    if (!cell) return;
    const ok = await copyText(id);
    const label = ok ? `${copy('copied')} ${id}` : copy('copyFail');
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
      cell.textContent = id;
      delete cell.dataset.flash;
      row.classList.remove('is-flashed');
    }, 1200);
    flashTimers.set(row, timer);
    timeouts.add(timer);
  }

  el.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
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
      for (const id of timeouts) window.clearTimeout(id);
      timeouts.clear();
      flashTimers.clear();
      document.getElementById(STYLE_ID)?.remove();
    },
  };
}
