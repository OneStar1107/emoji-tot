/**
 * The documentation, written for the person who has to ship a character.
 *
 * Four questions in the order they are asked: what is this, how is a character
 * built, what do the numbers mean, and how do I call it. The protocol table is
 * generated from the engine rather than typed, so a state added today appears
 * here today — the alternative is a doc that quietly lies.
 */
import { BODIES, CAST, FACES, TRAIT_IDS, FAMILIES, breed, castMember } from '@emojibot/core';
import { EMOTIONS, EMOTION_SEGMENTS } from '@emojibot/protocol';

function section(name: string, body: string): string {
  return `<section class="doc-section"><h2>${name}</h2>${body}</section>`;
}

function table(head: string[], rows: string[][]): string {
  return `<table class="doc-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

export function createDocs(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'docs-view';

  const emotionTable = table(
    ['id', '状态', '分组', '名称'],
    EMOTIONS.map((d) => [`#${d.id}`, d.state, EMOTION_SEGMENTS.find((s) => s.id === d.segment)?.name.zh ?? '', d.name.zh]),
  );

  const familyTable = table(
    ['族', '成员数', '身体', '示例'],
    FAMILIES.map((f) => {
      const members = CAST.filter((m) => m.family === f.id);
      const bodies = [...new Set(members.map((m) => m.body))].join(', ');
      return [`${f.zh} / ${f.en}`, String(members.length), bodies, members.slice(0, 3).map((m) => m.name.zh).join('、')];
    }),
  );

  const sample = breed(castMember('maomi')!, castMember('yinghua')!, 7);

  const intro = `<p>一个由公式画出来的角色引擎。没有精灵图、没有动画文件：每个身体是一条可计算的轮廓，
      每张脸是一组眼型与嘴型，每个配件都会根据它所在的身体自动找位置。</p>
      <p>引擎之上是 ${CAST.length} 个角色、${Object.keys(FACES).length} 个表情、${BODIES.length} 种身体、
      ${TRAIT_IDS.length} 种特征。桌宠与控制台共用同一套代码。</p>`;

  const genomeDoc = `<p>一个角色由四项组成，没有一项是图片：</p>
      <ul>
        <li><b>body</b> — 身体，来自 ${BODIES.length} 条参数化轮廓（${BODIES.slice(0, 6).map((b) => b.id).join(', ')} …）</li>
        <li><b>color</b> — 12 种实色；脸的颜色按亮度自动取反</li>
        <li><b>traits</b> — 特征，${TRAIT_IDS.length} 种，会贴着身体找位置</li>
        <li><b>state</b> — 表情，见下面的协议表</li>
      </ul>
      <h3>繁衍</h3>
      <p>两个角色可以交叉出新的组合，不落库、不留痕：</p>
      <pre class="snippet"><code>breed(castMember('maomi'), castMember('yinghua'), 7)
// → ${sample.name.zh} · ${sample.body} · ${sample.color} · ${sample.traits.join(' ')}</code></pre>`;

  const callDoc = `<pre class="snippet"><code>&lt;emojibot-ball body="circle" color="cream" traits="catEar blush" state="happy"&gt;&lt;/emojibot-ball&gt;

import { renderCast, renderCharacter, breed } from '@emojibot/core';

renderCast({ id: 'maomi', state: 'happy', size: 96 });
renderCharacter({ body: 'pear', color: 'green', traits: ['sprout'], state: 'idle', size: 96 });</code></pre>
      <p>特征清单：${TRAIT_IDS.join('、')}。</p>`;

  el.innerHTML = [
    section('这是什么', intro),
    section('角色是基因组', genomeDoc),
    section('角色族', familyTable),
    section('协议', `<p>两位数的编号就是对外契约：十位代表分组，组间空号是给扩展留的。</p>${emotionTable}`),
    section('调用', callDoc),
  ].join('');

  return el;
}
