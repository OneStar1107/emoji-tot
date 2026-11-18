/**
 * The documentation, written for the person who has to ship a character.
 *
 * Four questions in the order they are asked: what is this, how is a character
 * built, what do the numbers mean, and how do I call it. Every count is read
 * from the code — the engine for characters and expressions, and the desktop
 * settings schema for the page count — because a doc with a typed number is a
 * doc that quietly lies the first time something is added.
 */
import { BODIES, CAST, FACE_META, FAMILIES, breed, castMember } from '@emojitot/core';
import { EMOTIONS } from '@emojitot/protocol';
import { SETTINGS_NAV } from '@emojitot/settings-schema';
import { getLang, t } from './i18n';
import type { View } from './main';

function section(name: string, body: string): string {
  return `<section class="doc-section"><h2>${name}</h2>${body}</section>`;
}

function table(head: string[], rows: string[][]): string {
  return `<table class="doc-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

/** A group label, in the current language. */
function groupLabel(group: string): string {
  if (group === 'life') return t('docs.group.life');
  if (group === 'emotion') return t('docs.group.emotion');
  if (group === 'agent') return t('docs.group.agent');
  return group;
}

const nameOf = (meta: { name: string }, state: string): string => {
  const emotion = EMOTIONS.find((item) => item.state === state);
  if (!emotion) return meta.name;
  return getLang() === 'zh' ? emotion.name.zh : emotion.name.en;
};

export function createDocs(): View {
  const el = document.createElement('div');
  el.className = 'docs-view';

  const emotionTable = table(
    [t('docs.tableId'), t('docs.tableState'), t('docs.tableGroup'), t('docs.tableName'), t('docs.tableDesc')],
    FACE_META.map((meta) => [`#${meta.id}`, meta.id, groupLabel(meta.group), nameOf(meta, meta.id), meta.desc]),
  );

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
        <li><b>face</b> — ${t('docs.genomeFace', { faces: FACE_META.length })}</li>
      </ul>
      <h3>${t('docs.finishHeading')}</h3>
      <p>${t('docs.finishBody')}</p>
      <pre class="snippet"><code>renderCast({ id: 'lizi', state: 'happy', style: 'sticker', size: 96 })</code></pre>
      <h3>${t('docs.breedHeading')}</h3>
      <p>${t('docs.breedBody')}</p>
      <pre class="snippet"><code>breed(castMember('lizi'), castMember('yinghua'), 7)
// → ${sample.name.zh} · ${sample.body} · ${sample.color}</code></pre>`;

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
      <pre class="snippet"><code>// renderer/shared/pages.js
{ key: 'focus', title: 'Focus', sub: 'Pomodoro', icon: 'timer' }

// renderer/island.js
function focusPage() { return '&lt;div class=&quot;focus&quot;&gt;…&lt;/div&gt;'; }
const RENDERERS = { focus: focusPage };

// main/services/focus.js — owns its data, pushes on change
focus.onChange((value) =&gt; island.send('island:focus', value));</code></pre>
      <p>${t('docs.extendP')}</p>`;

  el.innerHTML = [
    section(t('docs.what'), intro),
    section(t('docs.genome'), genomeDoc),
    section(t('docs.families'), familyTable),
    section(t('docs.protocol'), `<p>${t('docs.protocolLead')}</p>${emotionTable}`),
    section(t('docs.desktop'), desktopDoc),
    section(t('docs.extend'), extendDoc),
    section(t('docs.call'), callDoc),
  ].join('');

  return { el };
}
