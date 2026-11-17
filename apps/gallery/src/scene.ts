/**
 * The scene: several agents, one face.
 *
 * This is the page that makes the arbitration rule visible. Nine sessions each
 * report their own state; the big character shows what the arbiter decided.
 * Click a session to make it report something else and watch the face switch —
 * including the rule that an urgent event interrupts a dwell while a lesser
 * one waits its turn.
 */
import { DEMO_SESSIONS } from './sessions';
import { createArbiter } from '@emojibot-studio/protocol';
import { getEmotion } from '@emojibot-studio/protocol';
import { look } from './store';
import { t } from './i18n';

const STATES = [
  { id: '30', label: '思考中' },
  { id: '32', label: '处理中' },
  { id: '33', label: '完成' },
  { id: '34', label: '出错' },
  { id: '40', label: '检索' },
  { id: '43', label: '写入' },
  { id: '48', label: '等待' },
];

export function createScene(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'scene';

  el.innerHTML = `
    <h1 class="view-title">${t('scene.title')}</h1>
    <p class="lead">${t('scene.lead')}</p>
    <div class="scene-grid">
      <section class="sessions" id="sessions"></section>
      <section class="stage-col">
        <div class="stage bg-grid">
          <aora-bot data-hero shape="${look.shape}" color="${look.color}"
                    style-id="${look.styleId}" variant="${look.variant}" size="200"></aora-bot>
        </div>
        <div class="stage-bar">
          <span class="hint" id="verdict"></span>
          <div class="actions">
            <button type="button" data-scene="error">${t('scene.error')}</button>
            <button type="button" data-scene="done">${t('scene.done')}</button>
            <button type="button" data-scene="reset">${t('scene.reset')}</button>
          </div>
        </div>
      </section>
    </div>
  `;

  const hero = el.querySelector<HTMLElement & { state: string }>('[data-hero]')!;
  const sessionsBox = el.querySelector<HTMLElement>('#sessions')!;
  const verdict = el.querySelector<HTMLElement>('#verdict')!;

  const arbiter = createArbiter({
    minDisplayMs: 900,
    onApply: (result) => {
      hero.state = result.state;
      const def = getEmotion(result.emotionId);
      const name = def ? (document.documentElement.lang === 'en' ? def.name.en : def.name.zh) : result.emotionId;
      verdict.textContent = result.sessionId
        ? `${t('scene.showing')}${name} · ${result.sessionId}`
        : `${t('scene.showing')}${t('scene.idle')}`;
    },
  });

  sessionsBox.innerHTML = DEMO_SESSIONS.map(
    (name) => `<button type="button" class="session" data-session="${name}">
      <span class="session-name">${name}</span>
      <span class="session-state" data-state-for="${name}">${t('scene.idle')}</span>
    </button>`,
  ).join('');

  function report(session: string, id: string): void {
    arbiter.update({ sessionId: session, emotionId: id });
    const label = el.querySelector<HTMLElement>(`[data-state-for="${session}"]`);
    if (label) label.textContent = STATES.find((s) => s.id === id)?.label ?? id;
  }

  el.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const session = target.closest<HTMLElement>('[data-session]')?.dataset.session;
    if (session) {
      const next = STATES[Math.floor(Math.random() * 3)];
      report(session, next.id);
      return;
    }
    const action = target.closest<HTMLElement>('[data-scene]')?.dataset.scene;
    if (action === 'error') for (const name of DEMO_SESSIONS) report(name, '34');
    if (action === 'done') for (const name of DEMO_SESSIONS) report(name, '33');
    if (action === 'reset') {
      for (const name of DEMO_SESSIONS) {
        arbiter.remove(name);
        const label = el.querySelector<HTMLElement>(`[data-state-for="${name}"]`);
        if (label) label.textContent = t('scene.idle');
      }
    }
  });

  return el;
}
