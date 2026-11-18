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
import { EMOTIONS, createArbiter } from '@emojitot/protocol';
import { getLang, t } from './i18n';
import { look } from './store';
import type { View } from './main';

const HERD = 12;
const MOODS = ['idle', 'happy', 'excited', 'shy', 'curious', 'sleeping', 'laughing', 'thinking'];

/** Nine sources, named like the parts of a real build. */
const SESSIONS = ['plan', 'parse', 'render', 'test', 'docs', 'build', 'lint', 'deploy', 'review'];

/** Ongoing states a source may report, with the label taken from the protocol. */
const CYCLE = ['30', '32', '36', '37', '31', '02'];

/**
 * The name of a state, in the current language.
 *
 * The protocol already carries both names on every emotion, so the scene must
 * not keep its own table — that is how a page ends up with one label for a
 * state while the rest of the app uses another.
 */
function stateLabel(state: string): string {
  const emotion = EMOTIONS.find((item) => item.state === state);
  if (!emotion) return state;
  return getLang() === 'zh' ? emotion.name.zh : emotion.name.en;
}

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

export function createScene(): View {
  const el = document.createElement('div');
  el.className = 'scene-view';

  el.innerHTML = `
    <header class="scene-head">
      <h2>${t('scene.heading')}</h2>
      <p>${t('scene.lead')}</p>
    </header>

    <section class="arbiter" id="arbiter">
      <div class="arbiter-face" id="arbiter-face"></div>
      <div class="arbiter-now">
        <b id="arbiter-state">${t('scene.idle')}</b>
        <span id="arbiter-from">${t('scene.noSession')}</span>
      </div>
      <div class="arbiter-actions">
        <button type="button" data-act="report">${t('scene.act.report')}</button>
        <button type="button" data-act="error">${t('scene.act.error')}</button>
        <button type="button" data-act="done">${t('scene.act.done')}</button>
        <button type="button" data-act="reset">${t('scene.act.reset')}</button>
      </div>
      <div class="arbiter-sessions" id="arbiter-sessions"></div>
    </section>

    <div class="scene-actions">
      <button type="button" data-act="shuffle">${t('scene.act.report')}</button>
      <button type="button" data-act="party">${t('scene.act.done')}</button>
      <button type="button" data-act="sleep">${t('scene.idle')}</button>
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
  /** One-shot timers (cheer, doze, poke); dispose clears them. */
  const timeouts = new Set<number>();

  function later(fn: () => void, ms: number): void {
    const id = window.setTimeout(() => {
      timeouts.delete(id);
      fn();
    }, ms);
    timeouts.add(id);
  }

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
      node.title = `${getLang() === 'zh' ? member.name.zh : member.name.en} · ${member.desc}`;
      node.innerHTML = `<span class="actor-svg">${renderCast({ id, state: 'idle', size: 110 })}</span><span class="actor-name">${getLang() === 'zh' ? member.name.zh : member.name.en}</span>`;
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
      stateEl.textContent = stateLabel(result.state);
      fromEl.textContent = result.sessionId
        ? `${result.sessionId} · #${result.emotionId}`
        : t('scene.noSession');
      queueMicrotask(() => paintSessions(result.sessionId));
    },
  });

  function paintSessions(active?: string): void {
    const sessions = arbiter.sessions();
    sessionsEl.innerHTML = SESSIONS.map((name) => {
      const session = sessions.get(name);
      const state = session?.state ?? '';
      const label = session ? stateLabel(state) : '—';
      const cls = name === active ? 'chip on' : session ? 'chip' : 'chip idle';
      return `<span class="${cls}" title="${name} · #${session?.emotionId ?? ''}">${name}<i>${label}</i></span>`;
    }).join('');
  }

  function reportOne(): void {
    const name = SESSIONS[Math.floor(Math.random() * SESSIONS.length)];
    const emotionId = CYCLE[Math.floor(Math.random() * CYCLE.length)];
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
          later(() => actor.el.classList.remove('cheer', 'doze'), 2200);
        }
      }
      return;
    }
    const actor = target.closest<HTMLElement>('.actor');
    if (actor) {
      const svg = actor.querySelector('.actor-svg');
      if (svg) svg.innerHTML = renderCast({ id: actor.dataset.id!, state: 'laughing', size: 110, style: look.finish });
      actor.classList.add('poke');
      later(() => {
        actor.classList.remove('poke');
        const back = actor.querySelector('.actor-svg');
        if (back) back.innerHTML = renderCast({ id: actor.dataset.id!, state: 'happy', size: 110, style: look.finish });
      }, 600);
    }
  });

  spawn();
  paintSessions();
  startTicking();

  return {
    el,
    dispose(): void {
      clearHerd();
      window.clearInterval(arbiterTimer);
      arbiterTimer = 0;
      for (const id of timeouts) window.clearTimeout(id);
      timeouts.clear();
      arbiter.dispose();
    },
  };
}
