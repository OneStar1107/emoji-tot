/**
 * The docs: how to get a character on a page, and what the ids mean.
 *
 * Deliberately short and in two languages. A reader who wants the full table
 * clicks through to the gallery, where every id is a picture.
 */
const COPY = {
  zh: {
    title: '文档',
    intro: '三行代码，一个会表达的角色。协议只有一个字段：一个两位数。',
    install: '接入',
    installBody: '用 npm 装，或者直接引 CDN 单文件（自带引擎）。',
    protocol: '协议',
    protocolBody:
      'AI 侧只发一个 id，宿主把它变成表情。id 按十年分段：00–09 生命周期、10–29 情绪、30–49 代理工作、50–59 提示。未知 id 按段回退，不会白屏。',
    actions: '命令式动作',
    actionsBody: '除了状态，还有一次性动作：spin 转、bounce 跳、burst 撒花。它们不改变状态，播完就停。',
    desktop: '桌面端',
    desktopBody: '同一个球可以贴在任何桌面上。桌面端监听一个文件，写进去一个 id 就会变脸。',
    links: '更多',
  },
  en: {
    title: 'Docs',
    intro: 'Three lines, one character that reacts. The protocol is a single field: a two-digit id.',
    install: 'Install',
    installBody: 'Install from npm, or load the single CDN file that carries the engine.',
    protocol: 'Protocol',
    protocolBody:
      'The agent sends one id; the host turns it into a face. Ids are grouped by decade: 00–09 lifecycle, 10–29 feeling, 30–49 agent work, 50–59 signalling. An unknown id falls back inside its decade instead of blanking the face.',
    actions: 'Imperative actions',
    actionsBody: 'Beyond states there are one-shot actions: spin, bounce, burst. They do not change the state and stop on their own.',
    desktop: 'Desktop',
    desktopBody: 'The same ball can live on any desktop. The desktop app watches a file; write an id and it reacts.',
    links: 'More',
  },
};

export function createDocs(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'docs';
  let lang: 'zh' | 'en' = (localStorage.getItem('es.lang') as 'zh' | 'en') ?? 'zh';

  function render(): void {
    const t = COPY[lang];
    el.innerHTML = `
      <div class="docs-head">
        <h1>${t.title}</h1>
        <div class="group" id="lang">
          <button type="button" data-lang="zh" aria-pressed="${lang === 'zh'}">中文</button>
          <button type="button" data-lang="en" aria-pressed="${lang === 'en'}">English</button>
        </div>
      </div>
      <p class="lead">${t.intro}</p>

      <section><h2>${t.install}</h2><p>${t.installBody}</p>
        <pre class="snippet"><code>${lang === 'zh'
          ? `pnpm add @aora-bot/element &nbsp;\n\n<aora-bot shape="circle" color="black" state="thinking"></aora-bot>`
          : `pnpm add @aora-bot/element &nbsp;\n\n<aora-bot shape="circle" color="black" state="thinking"></aora-bot>`}</code></pre>
      </section>

      <section><h2>${t.protocol}</h2><p>${t.protocolBody}</p>
        <pre class="snippet"><code>channel.feed('{"emotionId":"34","tips":"build failed"}');\nchannel.on('change', (e) => (el.state = e.state));</code></pre>
      </section>

      <section><h2>${t.actions}</h2><p>${t.actionsBody}</p>
        <pre class="snippet"><code>el.spin(1.5);\nel.bounce(0.5);\nel.burst(24);</code></pre>
      </section>

      <section><h2>${t.desktop}</h2><p>${t.desktopBody}</p>
        <pre class="snippet"><code>echo '{"emotionId":"33"}' &gt; "$APPDATA/EmojiBot/state.json"</code></pre>
      </section>

      <section><h2>${t.links}</h2>
        <p><a href="https://github.com/sam70361/aora-bot">Aora Bot</a> ·
           <a href="https://github.com/Aithena/emotion-ball">Emotion Ball</a> ·
           <a href="https://github.com/OneStar1107/emojibot-studio">本项目仓库</a></p>
      </section>
    `;
  }

  el.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-lang]');
    if (!button) return;
    lang = button.dataset.lang as 'zh' | 'en';
    localStorage.setItem('es.lang', lang);
    render();
  });

  render();
  return el;
}
