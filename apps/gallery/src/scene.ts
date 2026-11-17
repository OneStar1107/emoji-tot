/**
 * The scene: a stage with a crowd on it.
 *
 * Not a demo of one character but of many at once — the thing a gallery of 134
 * members is for. Every actor picks a different state on its own timer, walks
 * a small loop, and can be poked: click one and it laughs, because a crowd
 * that only moves on command is a screenshot.
 *
 * The crowd is drawn as static SVG and moved with CSS transforms: forty actors
 * animating forty SVG paths per frame would be a poor use of a browser.
 */
import { CAST, castMember, renderCast } from '@emojibot/core';
import { t } from './i18n';

const HERD = 14;
const MOODS = ['idle', 'happy', 'excited', 'shy', 'curious', 'sleeping', 'laughing', 'thinking'];

interface Actor {
  id: string;
  x: number;
  y: number;
  scale: number;
  state: string;
  el: HTMLElement;
  timer: number;
}

function pickHerd(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let guard = 0;
  while (out.length < HERD && guard++ < 400) {
    const m = CAST[Math.floor(Math.random() * CAST.length)];
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m.id);
  }
  return out;
}

export function createScene(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'scene-view';

  el.innerHTML = `
    <header class="scene-head">
      <h2>场景</h2>
      <p>点任意一个角色，它会回应你。它们会自己换表情，也会互相看着。</p>
      <div class="scene-actions">
        <button type="button" data-act="shuffle">换一批</button>
        <button type="button" data-act="party">全体开心</button>
        <button type="button" data-act="sleep">全体入睡</button>
      </div>
    </header>
    <div class="stage scene-stage bg-night" id="scene-stage">
      <div class="ground"></div>
      <div class="herd" id="herd"></div>
    </div>
  `;

  const herd = el.querySelector<HTMLElement>('#herd')!;
  const stage = el.querySelector<HTMLElement>('#scene-stage')!;
  let actors: Actor[] = [];

  function clear(): void {
    for (const a of actors) window.clearInterval(a.timer);
    actors = [];
    herd.replaceChildren();
  }

  function spawn(): void {
    clear();
    const ids = pickHerd();
    const cols = 6;
    ids.forEach((id, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 8 + col * 15 + Math.random() * 4;
      const y = 30 + row * 26 + Math.random() * 6;
      const scale = 0.7 + Math.random() * 0.5;
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'actor';
      node.style.left = `${x}%`;
      node.style.top = `${y}%`;
      node.style.setProperty('--scale', String(scale));
      node.dataset.id = id;
      const member = castMember(id)!;
      node.title = `${member.name.zh} · ${member.desc}`;
      node.innerHTML = `<span class="actor-svg">${renderCast({ id, state: 'idle', size: 110 })}</span><span class="actor-name">${member.name.zh}</span>`;
      herd.append(node);
      const timer = window.setInterval(() => {
        const mood = MOODS[Math.floor(Math.random() * MOODS.length)];
        const svg = node.querySelector('.actor-svg');
        if (svg) svg.innerHTML = renderCast({ id, state: mood, size: 110 });
      }, 2600 + Math.random() * 3200);
      actors.push({ id, x, y, scale, state: 'idle', el: node, timer });
    });
  }

  el.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const act = target.closest<HTMLElement>('[data-act]');
    if (act) {
      const kind = act.dataset.act;
      if (kind === 'shuffle') spawn();
      if (kind === 'party' || kind === 'sleep') {
        const mood = kind === 'party' ? 'celebrate' : 'sleeping';
        for (const a of actors) {
          const svg = a.el.querySelector('.actor-svg');
          if (svg) svg.innerHTML = renderCast({ id: a.id, state: mood, size: 110 });
          a.el.classList.add(kind === 'party' ? 'cheer' : 'doze');
          setTimeout(() => a.el.classList.remove('cheer', 'doze'), 2200);
        }
      }
      return;
    }
    const actor = target.closest<HTMLElement>('.actor');
    if (actor) {
      const svg = actor.querySelector('.actor-svg');
      if (svg) svg.innerHTML = renderCast({ id: actor.dataset.id!, state: 'laughing', size: 110 });
      actor.classList.add('poke');
      setTimeout(() => {
        actor.classList.remove('poke');
        const svg2 = actor.querySelector('.actor-svg');
        if (svg2) svg2.innerHTML = renderCast({ id: actor.dataset.id!, state: 'happy', size: 110 });
      }, 600);
    }
  });

  spawn();
  return el;
}
