/**
 * The scene: a stage with a crowd on it, and the arbiter in front of it.
 *
 * The crowd is the fun part — twelve characters each picking their own face.
 * The panel above it is the honest part: nine sessions report into one
 * arbiter, and only one face can show at a time. Urgent events interrupt the
 * dwell, everything else queues. That is the protocol's actual behaviour, and
 * this page used to describe it without demonstrating it.
 */
import { CAST, castMember, renderCast } from '@emojitot/core';
import { createArbiter } from '@emojitot/protocol';
import { look } from './store';

const HERD = 12;
const MOODS = ['idle', 'happy', 'excited', 'shy', 'curious', 'sleeping', 'laughing', 'thinking'];

/** Nine sources, named like the parts of a real build. */
const SESSIONS = ['plan', 'parse', 'render', 'test', 'docs', 'build', 'lint', 'deploy', 'review'];

/** Ongoing states a source may report, with the Chinese label shown under it. */
const CYCLE = [
  ['30', '思考'],
  ['32', '处理'],
  ['36', '检索'],
  ['37', '写入'],
  ['31', '等待'],
  ['02', '空闲'],
];

const ZH: Record<string, string> = {
  thinking: '思考', working: '处理', searching: '检索', writing: '写入',
  waiting: '等待', idle: '空闲', alerting: '出错', celebrate: '完成',
  notifying: '通知', receiving: '收信', refusing: '拒绝', sleeping: '睡眠',
  happy: '开心', curious: '好奇', laughing: '大笑', excited: '兴奋',
};

interface Actor {
  id: string;
  el: HTMLElement;
  timer: number;
}

function pickHerd(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let guard = 0;
  while (out.length < HERD && guard++ < 400) {
    const member = CAST[Math.floor(Math.random() * CAST.length)];
    if (seen.has(member.id)) continue;
    seen.add(member.id);
    out.push(member.id);
  }
  return out;
}

export function createScene(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'scene-view';

  el.innerHTML = `
    <header class="scene-head">
      <h2>场景</h2>
      <p>九个会话各自上报状态，只有一张脸。报错会立刻打断停留期，其余排队。</p>
    </header>

    <section class="arbiter" id="arbiter">
      <div class="arbiter-face" id="arbiter-face"></div>
      <div class="arbiter-now">
        <b id="arbiter-state">待机</b>
        <span id="arbiter-from">还没有会话上报</span>
      </div>
      <div class="arbiter-actions">
        <button type="button" data-act="report">随机上报</button>
        <button type="button" data-act="error">全部报错</button>
        <button type="button" data-act="done">全部完成</button>
        <button type="button" data-act="reset">重置</button>
      </div>
      <div class="arbiter-sessions" id="arbiter-sessions"></div>
    </section>

    <div class="scene-actions">
      <button type="button" data-act="shuffle">换一批</button>
      <button type="button" data-act="party">全体开心</button>
      <button type="button" data-act="sleep">全体入睡</button>
    </div>

    <div class="stage scene-stage bg-night" id="scene-stage">
      <div class="ground"></div>
      <div class="herd" id="herd"></div>
    </div>
  `;

  const herd = el.querySelector<HTMLElement>('#herd')!;
  const faceEl = el.querySelector<HTMLElement>('#arbiter-face')!;
  const stateEl = el.querySelector<HTMLElement>('#arbiter-state')!;
  const fromEl = el.querySelector<HTMLElement>('#arbiter-from')!;
  const sessionsEl = el.querySelector<HTMLElement>('#arbiter-sessions')!;
  let actors: Actor[] = [];
  let arbiterTimer = 0;

  /* ------------------------------------------------------------- crowd */

  function clearHerd(): void {
    for (const actor of actors) window.clearInterval(actor.timer);
    actors = [];
    herd.replaceChildren();
  }

  function spawn(): void {
    clearHerd();
    const ids = pickHerd();
    ids.forEach((id, index) => {
      const col = index % 6;
      const row = Math.floor(index / 6);
      const member = castMember(id)!;
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'actor';
      node.style.left = `${8 + col * 15 + Math.random() * 4}%`;
      node.style.top = `${30 + row * 26 + Math.random() * 6}%`;
      node.style.setProperty('--scale', String(0.7 + Math.random() * 0.5));
      node.dataset.id = id;
      node.title = `${member.name.zh} · ${member.desc}`;
      node.innerHTML = `<span class="actor-svg">${renderCast({ id, state: 'idle', size: 110 })}</span><span class="actor-name">${member.name.zh}</span>`;
      herd.append(node);
      const timer = window.setInterval(() => {
        const mood = MOODS[Math.floor(Math.random() * MOODS.length)];
        const svg = node.querySelector('.actor-svg');
        if (svg) svg.innerHTML = renderCast({ id, state: mood, size: 110, style: look.finish });
      }, 2600 + Math.random() * 3200);
      actors.push({ id, el: node, timer });
    });
  }

  /* ----------------------------------------------------------- arbiter */

  const arbiter = createArbiter({
    onApply: (result) => {
      const id = look.cast || 'tot';
      faceEl.innerHTML = renderCast({ id, state: result.state, size: 54, style: look.finish });
      stateEl.textContent = ZH[result.state] ?? result.state;
      fromEl.textContent = result.sessionId
        ? `${result.sessionId} 上报 · #${result.emotionId}`
        : '还没有会话上报';
      // createArbiter fires its first frame during construction, before the
      // const it is assigned to exists; a microtask runs right after that.
      queueMicrotask(() => paintSessions(result.sessionId));
    },
  });

  function paintSessions(active?: string): void {
    const sessions = arbiter.sessions();
    sessionsEl.innerHTML = SESSIONS.map((name) => {
      const session = sessions.get(name);
      const state = session?.state ?? '';
      const label = session ? (ZH[state] ?? state) : '—';
      const cls = name === active ? 'chip on' : session ? 'chip' : 'chip idle';
      return `<span class="${cls}" title="${name} · #${session?.emotionId ?? ''}">${name}<i>${label}</i></span>`;
    }).join('');
  }

  function reportOne(): void {
    const name = SESSIONS[Math.floor(Math.random() * SESSIONS.length)];
    const [emotionId] = CYCLE[Math.floor(Math.random() * CYCLE.length)];
    arbiter.update({ sessionId: name, emotionId });
    paintSessions();
  }

  function reportAll(emotionId: string): void {
    for (const name of SESSIONS) arbiter.update({ sessionId: name, emotionId });
    paintSessions();
  }

  function reset(): void {
    for (const name of SESSIONS) arbiter.remove(name);
    paintSessions();
  }

  function startTicking(): void {
    window.clearInterval(arbiterTimer);
    arbiterTimer = window.setInterval(() => {
      reportOne();
      if (Math.random() < 0.12) {
        // The occasional urgent event, so interrupting is visible rather than
        // something the copy merely claims.
        arbiter.update({ sessionId: 'build', emotionId: Math.random() < 0.5 ? '34' : '33' });
      }
    }, 1800);
  }

  /* ------------------------------------------------------------ wiring */

  el.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const act = target.closest<HTMLElement>('[data-act]');
    if (act) {
      const kind = act.dataset.act;
      if (kind === 'shuffle') spawn();
      else if (kind === 'report') reportOne();
      else if (kind === 'error') reportAll('34');
      else if (kind === 'done') reportAll('33');
      else if (kind === 'reset') reset();
      else if (kind === 'party' || kind === 'sleep') {
        const mood = kind === 'party' ? 'celebrate' : 'sleeping';
        for (const actor of actors) {
          const svg = actor.el.querySelector('.actor-svg');
          if (svg) svg.innerHTML = renderCast({ id: actor.id, state: mood, size: 110, style: look.finish });
          actor.el.classList.add(kind === 'party' ? 'cheer' : 'doze');
          window.setTimeout(() => actor.el.classList.remove('cheer', 'doze'), 2200);
        }
      }
      return;
    }
    const actor = target.closest<HTMLElement>('.actor');
    if (actor) {
      const svg = actor.querySelector('.actor-svg');
      if (svg) svg.innerHTML = renderCast({ id: actor.dataset.id!, state: 'laughing', size: 110, style: look.finish });
      actor.classList.add('poke');
      window.setTimeout(() => {
        actor.classList.remove('poke');
        const back = actor.querySelector('.actor-svg');
        if (back) back.innerHTML = renderCast({ id: actor.dataset.id!, state: 'happy', size: 110, style: look.finish });
      }, 600);
    }
  });

  spawn();
  paintSessions();
  startTicking();
  return el;
}
