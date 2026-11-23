/**
 * The guide's two pages: welcome, then form and skin.
 *
 * The page owns only its own selection state. Whatever ends up in prefs.json
 * is decided by main/onboarding.js, so a reload of this page cannot write a
 * form the app does not have and the two endings (完成 / 跳过) stay one call.
 */
const SKIN_PREVIEWS = [
  ['frost', 'Liquid Glass', '半透明浅蓝，桌面会透出来'],
  ['solid', '实色', '不透明深色卡片'],
  ['plain', '极简', '收起时只剩一条细线'],
];

const welcome = document.getElementById('page-welcome');
const setup = document.getElementById('page-setup');
const formSeg = document.getElementById('form-seg');
const skinCards = document.getElementById('skin-cards');
const hero = document.querySelector('.hero');
const startBtn = document.getElementById('btn-start');
const doneBtn = document.getElementById('btn-done');

/** Preselected from the current profile, so "完成" without touching anything
 *  means "keep what I already had" rather than "reset to the factory". */
const choice = { displayMode: 'island', skin: 'frost' };
/** One answer per window: a double click must not write two patches. */
let finished = false;

function renderSkinCards() {
  skinCards.replaceChildren(...SKIN_PREVIEWS.map(([value, label, hint]) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'skin-card';
    card.dataset.value = value;
    card.title = hint;
    card.setAttribute('aria-pressed', String(choice.skin === value));
    const thumb = document.createElement('span');
    thumb.className = 'skin-thumb skin-thumb-' + value;
    thumb.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'skin-card-name';
    name.textContent = label;
    card.append(thumb, name);
    return card;
  }));
}

function paint() {
  for (const button of formSeg.querySelectorAll('[data-display-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.displayMode === choice.displayMode));
  }
  for (const card of skinCards.querySelectorAll('.skin-card')) {
    card.setAttribute('aria-pressed', String(card.dataset.value === choice.skin));
  }
}

function showSetup() {
  welcome.hidden = true;
  setup.hidden = false;
  doneBtn.focus();
}

async function finish(skipped) {
  if (finished) return;
  finished = true;
  try {
    await window.onboardingAPI.finish({
      skipped,
      displayMode: choice.displayMode,
      skin: choice.skin,
    });
  } catch {
    // The window is closed by the main process as the answer lands; a reply
    // that never arrives is the normal end of this call, not an error.
  }
}

function applyTheme(theme) {
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  document.documentElement.dataset.theme =
    theme === 'light' || (theme === 'system' && prefersLight) ? 'light' : 'dark';
}

startBtn.addEventListener('click', showSetup);
doneBtn.addEventListener('click', () => finish(false));
document.getElementById('btn-skip-welcome').addEventListener('click', () => finish(true));
document.getElementById('btn-skip-setup').addEventListener('click', () => finish(true));

formSeg.addEventListener('click', (event) => {
  const button = event.target.closest('[data-display-mode]');
  if (!button) return;
  choice.displayMode = button.dataset.displayMode;
  paint();
});

skinCards.addEventListener('click', (event) => {
  const card = event.target.closest('.skin-card');
  if (!card) return;
  choice.skin = card.dataset.value;
  paint();
});

/* Esc is the third way out, and means the same as 跳过. */
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  finish(true);
});

async function boot() {
  const info = await window.onboardingAPI.get().catch(() => null);
  if (info) {
    if (typeof info.cast === 'string' && info.cast) hero.setAttribute('cast', info.cast);
    if (['island', 'ball', 'both'].includes(info.displayMode)) choice.displayMode = info.displayMode;
    if (SKIN_PREVIEWS.some(([value]) => value === info.skin)) choice.skin = info.skin;
    applyTheme(info.theme);
  }
  renderSkinCards();
  paint();
  startBtn.focus();
}

boot();
