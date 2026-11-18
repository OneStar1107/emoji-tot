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

  const desktopDoc = `<p>桌面端有两种形态，托盘菜单与设置里随时切换：</p>
      <table class="doc-table"><thead><tr><th>形态</th><th>位置</th><th>它是什么</th></tr></thead><tbody>
        <tr><td><b>灵动岛</b>（默认）</td><td>屏幕顶部居中</td><td>一条胶囊：脸、电量、时间、温度；点一下展开成功能面板</td></tr>
        <tr><td><b>桌面球</b></td><td>任意位置，可贴边</td><td>会跳、会生气、会被拖来拖去的球</td></tr>
      </tbody></table>
      <p>两者可以同时开着。形态只是 <code>prefs.json</code> 里的一个字段，两个窗口都提前创建，切换只改可见性 —— 所以切过去不会重载页面，岛也不会丢掉当前那一页。</p>
      <h3>岛的尺寸只有一个来源</h3>
      <p>页面用 <code>ResizeObserver</code> 量自己的内容，主进程按这个尺寸 <code>setBounds</code> 并保持居中。主进程里没有一处硬编码展开宽高：页面长高，窗口就长高。</p>
      <h3>设置中心</h3>
      <p>独立窗口，左侧导航、右侧分组卡片，13 页。没有保存按钮：每个开关、下拉、滑块的改动立刻写进 <code>prefs.json</code>，别的窗口随即跟上。</p>`;

  const extendDoc = `<p>岛上的每一个页面都是注册表里的一行，加上一个只负责数据的服务：</p>
      <pre class="snippet"><code>// renderer/shared/pages.js
{ key: 'focus', title: '专注', sub: '番茄钟与休息', icon: 'timer', stage: 1 }

// renderer/island.js
function focusPage() { return \`&lt;div class="focus"&gt;…&lt;/div&gt;\`; }
const RENDERERS = { focus: focusPage };

// main/services/focus.js —— 只拥有自己那份数据，变化时推送
focus.onChange((value) =&gt; island.send('island:focus', value));</code></pre>
      <p>约定有三条：服务只写自己的文件；推送的载荷结构与 <code>bootstrap</code> 返回的一模一样（结构不一致是「推送成功但页面永远空」的经典原因）；页面在空数据时给一句话加一个动作按钮，而不是一个空盒子。</p>`;

  el.innerHTML = [
    section('这是什么', intro),
    section('角色是基因组', genomeDoc),
    section('角色族', familyTable),
    section('协议', `<p>两位数的编号就是对外契约：十位代表分组，组间空号是给扩展留的。</p>${emotionTable}`),
    section('桌面端：两种形态', desktopDoc),
    section('加一个页面', extendDoc),
    section('调用', callDoc),
  ].join('');

  return el;
}
