/**
 * The scene: nine sessions reporting into one face, and a crowd behind them.
 *
 * The crowd is the fun part — twelve characters each picking their own face.
 * The panel above it is the honest part: nine sessions report into one
 * arbiter, and only one face can show at a time. Urgent events interrupt the
 * dwell, everything else queues. That is the protocol's actual behaviour, and
 * this page used to describe it without demonstrating it.
 *
 * Presentation only, on top of that: each session is a card with a priority
 * bar, the centre holds the face that actually won, and the number under it
 * rolls when the winner changes — so a takeover is visible instead of
 * inferred from a label. None of this touches the arbitration itself:
 * createArbiter still owns every decision.
 */
import { CAST, castMember, renderCast } from '@emojitot/core';
import { DEFAULT_PRIORITY, EMOTIONS, createArbiter, type ArbiterResult } from '@emojitot/protocol';
import { getLang, t } from './i18n';
import { look } from './store';
import type { View } from './main';

const HERD = 12;
const MOODS = ['idle', 'happy', 'excited', 'shy', 'curious', 'sleeping', 'laughing', 'thinking'];

/** Nine sources, named like the parts of a real build. */
const SESSIONS = ['plan', 'parse', 'render', 'test', 'docs', 'build', 'lint', 'deploy', 'review'];

/** Ongoing states a source may report, with the label taken from the protocol. */
const CYCLE = ['30', '32', '36', '37', '31', '02'];

/** What a click may report: work most of the time, then a failure, then a finish. */
const WORK_IDS = ['30', '32', '36', '37', '39', '40', '42', '43', '47', '48'];
const ERROR_ID = '34';
const DONE_ID = '33';

/** The highest priority the protocol hands out; the bar is scaled against it. */
const MAX_PRIORITY = 9;

/** The three faces of a session, as far as a card is concerned. */
type SessionKind = 'working' | 'idle' | 'error' | 'done';

const IDLE_STATES = new Set([
  'idle', 'sleeping', 'dormant', 'drowsy', 'bored', 'spacing-out', 'powering-down', 'powering-off',
]);

const COPY = {
  pause: { zh: '暂停自动上报', en: 'Pause auto-report' },
  resume: { zh: '继续自动上报', en: 'Resume auto-report' },
  from: { zh: '当前显示来自', en: 'Shown from' },
  noReport: { zh: '未上报', en: 'no report' },
  hint: { zh: '点击让这个会话上报一次', en: 'Click to make this session report' },
  sessions: { zh: '九个会话', en: 'Nine sessions' },
  showing: { zh: '当前显示', en: 'Now showing' },
  priority: { zh: '优先级', en: 'Priority' },
} as const;

type CopyKey = keyof typeof COPY;

/** Scene-only strings, kept out of the shared dictionary on purpose. */
function copy(key: CopyKey): string {
  return getLang() === 'zh' ? COPY[key].zh : COPY[key].en;
}

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

/** The arbiter's own priority table, read rather than re-derived. */
function priorityOf(state: string): number {
  return DEFAULT_PRIORITY[state as keyof typeof DEFAULT_PRIORITY] ?? 0;
}

/** Which of the four colours a session card shows. */
function kindOf(state: string): SessionKind {
  if (!state) return 'idle';
  if (state === 'error' || state === 'alerting' || state === 'panicked' || state === 'refusing') return 'error';
  if (state === 'done' || state === 'celebrate' || state === 'satisfied') return 'done';
  if (IDLE_STATES.has(state)) return 'idle';
  return 'working';
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
    <header class="page-head">
      <div>
        <div class="eyebrow"><b>03</b><i></i>Scene<i></i>Arbitration</div>
        <h1 class="page-title">${t('scene.heading')}<span>nine sessions, one face</span></h1>
      </div>
      <div>
        <p class="page-lead">${t('scene.lead')}</p>
        <div class="page-stats">
          <div class="stat"><b>${SESSIONS.length}</b><span>sessions</span></div>
          <div class="stat"><b>1</b><span>face</span></div>
          <div class="stat"><b>${CAST.length}</b><span>cast</span></div>
        </div>
      </div>
    </header>

    <section class="arbiter" id="arbiter">
      <div class="arbiter-stage">
        <div class="arbiter-rays" aria-hidden="true"></div>
        <div class="arbiter-halo" aria-hidden="true"></div>
        <div class="arbiter-face" id="arbiter-face"></div>
        <div class="arbiter-read">
          <span class="kicker">${copy('showing')}</span>
          <b id="arbiter-state">${t('scene.idle')}</b>
          <span id="arbiter-from">${t('scene.noSession')}</span>
        </div>
        <div class="arbiter-priority">
          <span>${copy('priority')}</span>
          <span class="sd-rank-slot" id="arbiter-rank">—</span>
        </div>
      </div>

      <div class="arbiter-side">
        <div class="arbiter-sessions sd-sessions" id="arbiter-sessions" role="group" aria-label="${copy('sessions')}"></div>
        <div class="card sd-source" id="arbiter-source">
          <span>${copy('from')}</span>
          <b id="arbiter-owner">—</b>
        </div>
        <div class="arbiter-actions">
          <button type="button" class="btn btn-primary" data-act="report">${t('scene.act.report')}</button>
          <button type="button" class="btn" data-act="error">${t('scene.act.error')}</button>
          <button type="button" class="btn" data-act="done">${t('scene.act.done')}</button>
          <button type="button" class="btn" data-act="reset">${t('scene.act.reset')}</button>
          <button type="button" class="btn sd-toggle" id="arbiter-toggle" data-act="toggle" aria-pressed="false">${copy('pause')}</button>
        </div>
      </div>
    </section>

    <div class="scene-actions">
      <button type="button" class="btn" data-act="shuffle">${t('scene.act.shuffle')}</button>
      <button type="button" class="btn" data-act="party">${t('scene.act.party')}</button>
      <button type="button" class="btn" data-act="sleep">${t('scene.act.sleep')}</button>
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
  const ownerEl = el.querySelector<HTMLElement>('#arbiter-owner')!;
  const rankEl = el.querySelector<HTMLElement>('#arbiter-rank')!;
  const toggleEl = el.querySelector<HTMLButtonElement>('#arbiter-toggle')!;
  let actors: Actor[] = [];
  let arbiterTimer = 0;
  let paused = false;
  let shownRank: number | null = null;
  /** Which session the arbiter is actually showing — not just the last to report. */
  let shownSession = '';
  /** One-shot timers (cheer, doze, poke, rank roll); dispose clears them. */
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
      node.style.left = (8 + col * 15 + Math.random() * 4) + '%';
      node.style.top = (32 + row * 34 + Math.random() * 5) + '%';
      node.style.setProperty('--scale', String(0.7 + Math.random() * 0.5));
      node.dataset.id = id;
      node.title = (getLang() === 'zh' ? member.name.zh : member.name.en) + ' · ' + member.desc;
      node.innerHTML = '<span class="actor-svg">' + renderCast({ id, state: 'idle', size: 110 }) + '</span>' +
        '<span class="actor-name">' + (getLang() === 'zh' ? member.name.zh : member.name.en) + '</span>';
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

  faceEl.innerHTML = renderCast({ id: look.cast || 'tot', state: 'idle', size: 148, style: look.finish });

  const arbiter = createArbiter({
    onApply: (result) => {
      const id = look.cast || 'tot';
      faceEl.innerHTML = renderCast({ id, state: result.state, size: 148, style: look.finish });
      stateEl.textContent = stateLabel(result.state);
      fromEl.textContent = result.sessionId
        ? result.sessionId + ' · #' + result.emotionId
        : t('scene.noSession');
      shownSession = result.sessionId ?? '';
      // The face lands with a beat: 220ms, once, and only when a report came in.
      if (result.sessionId && !reducedMotion()) {
        faceEl.removeAttribute('data-beat');
        void faceEl.offsetWidth;
        faceEl.setAttribute('data-beat', '');
        later(() => faceEl.removeAttribute('data-beat'), 240);
      }
      paintSource(result);
      queueMicrotask(() => paintSessions());
    },
  });

  /** The strip under the stage: who is on screen, and their priority. */
  function paintSource(result: ArbiterResult | null): void {
    const sessionId = result?.sessionId ?? '';
    ownerEl.textContent = sessionId || '—';
    if (!sessionId) {
      shownRank = null;
      shownSession = '';
      rankEl.textContent = '—';
      rankEl.dataset.value = '';
      return;
    }
    const rank = priorityOf(result!.state);
    if (shownRank === rank) return;
    shownRank = rank;
    rollTo(rank);
  }

  /** Roll the number up: 140ms, transform only, off under reduced motion. */
  function rollTo(value: number): void {
    const text = String(value);
    const previous = rankEl.dataset.value ?? '';
    rankEl.dataset.value = text;
    if (!previous || reducedMotion()) {
      rankEl.textContent = text;
      return;
    }
    rankEl.innerHTML = '<span class="sd-rank-out">' + previous + '</span><span class="sd-rank-in">' + text + '</span>';
    void rankEl.offsetWidth;
    rankEl.classList.add('is-rolling');
    later(() => {
      rankEl.classList.remove('is-rolling');
      rankEl.textContent = text;
    }, 160);
  }

  function paintSessions(): void {
    const sessions = arbiter.sessions();
    const active = shownSession;
    sessionsEl.innerHTML = SESSIONS.map((name) => {
      const session = sessions.get(name);
      const state = session?.state ?? '';
      const label = session ? stateLabel(state) : copy('noReport');
      const rank = session ? priorityOf(state) : null;
      const isActive = name === active;
      const value = rank === null ? 0 : Math.min(1, rank / MAX_PRIORITY);
      return '<button type="button" class="card sd-session' + (isActive ? ' is-active' : '') +
        '" data-session="' + name + '" data-kind="' + kindOf(state) + '" aria-pressed="' + isActive +
        '" title="' + name + ' · ' + copy('hint') + '">' +
        '<span class="sd-session-head"><i class="sd-dot" aria-hidden="true"></i><b>' + name + '</b></span>' +
        '<span class="sd-session-state">' + label + '</span>' +
        '<span class="sd-session-rank">' + (rank === null ? '—' : rank) + '</span>' +
        '<span class="sd-bar" aria-hidden="true"><i style="--v:' + value.toFixed(2) + '"></i></span>' +
        '</button>';
    }).join('');
  }

  function reportOne(): void {
    const name = SESSIONS[Math.floor(Math.random() * SESSIONS.length)];
    const emotionId = CYCLE[Math.floor(Math.random() * CYCLE.length)];
    arbiter.update({ sessionId: name, emotionId });
    paintSessions();
  }

  /** One session reports whatever a click rolls: work, failure, or done. */
  function reportFor(name: string): void {
    const roll = Math.random();
    const emotionId = roll < 0.6
      ? WORK_IDS[Math.floor(Math.random() * WORK_IDS.length)]
      : roll < 0.85 ? ERROR_ID : DONE_ID;
    arbiter.update({ sessionId: name, emotionId });
    paintSessions();
    const card = sessionsEl.querySelector<HTMLElement>('[data-session="' + name + '"]');
    if (card && !reducedMotion()) {
      card.setAttribute('data-beat', '');
      later(() => card.removeAttribute('data-beat'), 540);
    }
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

  /** Pause is a promise about the timer, not a visual switch: nothing ticks. */
  function toggleAuto(): void {
    paused = !paused;
    if (paused) {
      window.clearInterval(arbiterTimer);
      arbiterTimer = 0;
    } else {
      startTicking();
    }
    toggleEl.textContent = paused ? copy('resume') : copy('pause');
    toggleEl.setAttribute('aria-pressed', String(paused));
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
      else if (kind === 'toggle') toggleAuto();
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
    const session = target.closest<HTMLElement>('[data-session]');
    if (session) {
      reportFor(session.dataset.session!);
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
  paintSource(null);
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
