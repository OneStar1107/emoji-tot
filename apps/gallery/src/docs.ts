/**
 * The documentation, written for the person who has to ship a character.
 *
 * Four questions in the order they are asked: what is this, how is a character
 * built, what do the numbers mean, and how do I call it. The tables are read
 * from the engine rather than typed, so a state added today appears here today
 * — the alternative is a doc that quietly lies.
 */
import { BODIES, CAST, FACES, FACE_META, FAMILIES, breed, castMember, renderCast } from '@emojitot/core';
import { EMOTIONS } from '@emojitot/protocol';

function section(name: string, body: string): string {
  return `<section class="doc-section"><h2>${name}</h2>${body}</section>`;
}

function table(head: string[], rows: string[][]): string {
  return `<table class="doc-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

const GROUP_ZH: Record<string, string> = { life: '生命周期', emotion: '情绪反应', agent: '代理工作' };

export function createDocs(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'docs-view';

  const emotionTable = table(
    ['id', '状态', '分组', '中文名', '它会怎么做'],
    FACE_META.map((m) => [`#${m.id}`, m.id, GROUP_ZH[m.group] ?? m.group, m.name, m.desc]),
  );

  const familyTable = table(
    ['族', '成员数', '身体', '示例'],
    FAMILIES.map((f) => {
      const members = CAST.filter((m) => m.family === f.id);
      const bodies = [...new Set(members.map((m) => m.body))].join(', ');
      return [`${f.zh} / ${f.en}`, String(members.length), bodies, members.slice(0, 3).map((m) => m.name.zh).join('、')];
    }),
  );

  const sample = breed(castMember('lizi')!, castMember('yinghua')!, 7);

  const intro = `<p>一个用 SVG 画出来的角色引擎。没有精灵图、没有动画文件：每个身体是一条手写的闭合轮廓，
      每张脸是一组眼型与嘴型，每个角色只有轮廓、五官和它天生带着的那几件东西。</p>
      <p>引擎之上是 ${CAST.length} 个角色、${FACE_META.length} 个表情、${BODIES.length} 种轮廓、2 种画风。
      桌宠、控制台、站点共用同一套代码。</p>`;

  const genomeDoc = `<p>一个角色由三项组成，没有一项是图片：</p>
      <ul>
        <li><b>body</b> — 轮廓，${BODIES.length} 条手写闭合路径（${BODIES.slice(0, 6).map((b) => b.id).join(', ')} …）；
            梨有腰和梗叶、面包有拱顶平底、星星的五个角是真的角</li>
        <li><b>color</b> — 12 种实色；五官的墨色按亮度自动取反</li>
        <li><b>face</b> — 表情，${FACE_META.length} 个状态，见下面的协议表</li>
      </ul>
      <h3>画风</h3>
      <p>同一份轮廓有两种表面处理：<b>sticker</b>（模切白边，近白的身体自动换深色边）和 <b>flat</b>（纯色平涂）。
      它只是一个参数，不改变任何几何：</p>
      <pre class="snippet"><code>renderCast({ id: 'lizi', state: 'happy', style: 'sticker', size: 96 })</code></pre>
      <h3>繁衍</h3>
      <p>两个角色可以交叉出新的组合，不落库、不留痕：</p>
      <pre class="snippet"><code>breed(castMember('lizi'), castMember('yinghua'), 7)
// → ${sample.name.zh} · ${sample.body} · ${sample.color}</code></pre>`;

  const callDoc = `<pre class="snippet"><code>&lt;emojitot-ball cast="lizi" finish="sticker" state="happy"&gt;&lt;/emojitot-ball&gt;

import { renderCast, faceMeta, facesInGroup } from '@emojitot/core';

renderCast({ id: 'lizi', state: 'happy', size: 96 });
faceMeta('sleeping');        // { id, name: '睡眠', group: 'life', desc: '闭眼成细线…' }
facesInGroup('agent');       // 21 个代理状态，按表顺序</code></pre>
      <p>表情按三组归档：生命周期 ${FACE_META.filter((m) => m.group === 'life').length} 个、
      情绪反应 ${FACE_META.filter((m) => m.group === 'emotion').length} 个、
      代理工作 ${FACE_META.filter((m) => m.group === 'agent').length} 个。</p>`;

  el.innerHTML = [
    section('这是什么', intro),
    section('角色是基因组', genomeDoc),
    section('角色族', familyTable),
    section('协议', `<p>两位数的编号就是对外契约：十位代表分组，组间空号是给扩展留的。</p>${emotionTable}`),
    section('调用', callDoc),
  ].join('');

  return el;
}
