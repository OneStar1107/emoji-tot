/**
 * The studio: one character, its genes below, its code beside.
 *
 * The stage is the largest thing on the page and the snippet sits next to it,
 * because the point of the page is "this is what you get and this is how you
 * ask for it". The stage draws the character as SVG directly rather than
 * through the custom element, so the editor is not limited by what an
 * attribute can express; the element is what the snippet hands you.
 */
import { castMember, renderCast } from '@emojibot/core';
import { createDrawer } from './drawer';
import { backgroundClass, look, onLookChange, setLook } from './store';

function hero(size = 260): string {
  const id = look.cast || 'bot';
  return renderCast({ id, state: look.state, size, style: look.finish });
}

function snippet(): string {
  const id = look.cast || 'bot';
  const finish = look.finish === 'flat' ? ' finish="flat"' : '';
  return `<emojibot-ball cast="${id}"${finish} state="${look.state}"></emojibot-ball>`;
}

function genome(): string {
  const id = look.cast || 'bot';
  const member = castMember(id);
  return JSON.stringify({ cast: id, state: look.state, finish: look.finish, body: member?.body }, null, 2);
}

export function createConsole(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'studio';

  el.innerHTML = `
    <section class="studio-main">
      <div class="stage ${backgroundClass()}" id="stage">
        <div class="hero" data-hero>${hero()}</div>
      </div>
      <div class="stage-bar">
        <div class="actions">
          <button type="button" data-act="spin">自旋</button>
          <button type="button" data-act="bounce">弹跳</button>
          <button type="button" data-act="burst">撒花</button>
          <span class="sep"></span>
          <button type="button" data-finish="sticker" aria-pressed="true">贴纸</button>
          <button type="button" data-finish="flat" aria-pressed="false">平涂</button>
        </div>
        <div class="who" id="who"></div>
      </div>
    </section>

    <aside class="studio-side">
      <div class="code-card">
        <div class="code-head"><span>组件</span><button type="button" id="copy">复制</button></div>
        <pre class="snippet"><code data-snippet>${snippet()}</code></pre>
      </div>
      <div class="code-card">
        <div class="code-head"><span>基因组</span><button type="button" id="copy-json">复制</button></div>
        <pre class="snippet"><code data-genome>${genome()}</code></pre>
      </div>
    </aside>
  `;

  const stage = el.querySelector<HTMLElement>('#stage')!;
  const heroEl = el.querySelector<HTMLElement>('[data-hero]')!;
  const who = el.querySelector<HTMLElement>('#who')!;
  const snippetEl = el.querySelector<HTMLElement>('[data-snippet]')!;
  const genomeEl = el.querySelector<HTMLElement>('[data-genome]')!;

  function apply(): void {
    heroEl.innerHTML = hero();
    stage.className = `stage ${backgroundClass()}`;
    snippetEl.textContent = snippet();
    genomeEl.textContent = genome();
    const member = look.cast ? castMember(look.cast) : undefined;
    who.textContent = member ? `${member.name.zh} · ${member.name.en} · ${member.desc}` : '自定义组合';
    for (const b of el.querySelectorAll<HTMLElement>('[data-finish]')) b.setAttribute('aria-pressed', String(b.dataset.finish === look.finish));
  }

  el.addEventListener('click', (event) => {
    const finishBtn = (event.target as HTMLElement).closest<HTMLElement>('[data-finish]');
    if (finishBtn) {
      setLook({ finish: finishBtn.dataset.finish as 'sticker' | 'flat' });
      return;
    }
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-act], #copy, #copy-json');
    if (!target) return;
    const act = target.dataset.act;
    if (act) {
      heroEl.classList.remove('fx-spin', 'fx-bounce', 'fx-burst');
      void heroEl.offsetWidth;
      heroEl.classList.add(act === 'spin' ? 'fx-spin' : act === 'bounce' ? 'fx-bounce' : 'fx-burst');
      return;
    }
    const text = target.id === 'copy' ? snippetEl.textContent ?? '' : genomeEl.textContent ?? '';
    navigator.clipboard?.writeText(text);
    const label = target.textContent;
    target.textContent = '已复制';
    setTimeout(() => (target.textContent = label), 1400);
  });

  apply();
  el.append(createDrawer(apply));
  onLookChange(apply);
  return el;
}
