/**
 * The demo: one character, one input, one protocol.
 *
 * The point of this page is the smallest possible integration story — paste
 * an id, the character reacts — while the drawing itself comes from the
 * upstream engine. The protocol package decides what an id means; the Web
 * Component decides what it looks like.
 */
import { defineAoraBot } from '@aora-bot/element';
import { allVariants, getStyle } from '@aora-bot/engine';
import {
  EMOTIONS,
  createEmotionChannel,
  getEmotion,
  type EmotionId,
} from '@emotion-studio/protocol';
import './style.css';

defineAoraBot();

const ball = document.querySelector('aora-bot') as HTMLElement & {
  state: string;
  styleId: string;
  variant: string;
};
const input = document.querySelector<HTMLInputElement>('#wire')!;
const presets = document.querySelector<HTMLDivElement>('#presets')!;
const caption = document.querySelector<HTMLParagraphElement>('#caption')!;
const logEl = document.querySelector<HTMLPreElement>('#log')!;
const styleSelect = document.querySelector<HTMLSelectElement>('#style')!;
const variantSelect = document.querySelector<HTMLSelectElement>('#variant')!;

const channel = createEmotionChannel({ initial: '02' });
const lines: string[] = [];

function log(text: string, kind: 'info' | 'err' = 'info'): void {
  const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  lines.unshift(kind === 'err' ? `[${stamp}] ! ${text}` : `[${stamp}] ${text}`);
  if (lines.length > 30) lines.length = 30;
  logEl.innerHTML = lines
    .map((line) => (line.includes('! ') ? `<span class="err">${escapeHtml(line)}</span>` : escapeHtml(line)))
    .join('\n');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
}

function label(id: EmotionId): string {
  const def = getEmotion(id);
  return def ? `${id} ${def.name.zh}` : id;
}

let captionTimer: ReturnType<typeof setTimeout> | null = null;

channel.on('change', (event) => {
  ball.state = event.state;
  markActive();
  log(`→ ${label(event.emotionId)} (${event.source})`);
});

channel.on('tips', (event) => {
  caption.textContent = event.text;
  caption.dataset.visible = 'true';
  if (captionTimer) clearTimeout(captionTimer);
  captionTimer = setTimeout(() => {
    caption.dataset.visible = 'false';
  }, 3200);
});

channel.on('error', (event) => {
  log(`无法识别的消息：${event.reason}`, 'err');
});

// A short list that covers the four decades. The whole table is in the
// protocol package; this is only what fits on one row.
const PRESET_IDS: EmotionId[] = ['00', '02', '10', '13', '14', '21', '30', '32', '33', '34', '40', '50'];
for (const id of PRESET_IDS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.id = id;
  button.textContent = label(id);
  button.addEventListener('click', () => channel.feed({ emotionId: id }));
  presets.append(button);
}

/** Keep the pressed button in step with whatever is actually on screen. */
function markActive(): void {
  const current = channel.current().emotionId;
  for (const button of presets.querySelectorAll<HTMLButtonElement>('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.id === current));
  }
}

input.addEventListener('input', () => {
  const value = input.value.trim();
  if (value) channel.feed(value);
});

input.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  const value = input.value.trim();
  if (!value) return;
  channel.feed(value);
  input.value = '';
});

// Style series and their variants come from the engine, so this list never
// drifts from what the renderer actually supports.
const styles = ['vector', 'pixel', 'kaomoji'];
function fillVariants(styleId: string): void {
  variantSelect.replaceChildren();
  const style = getStyle(styleId);
  const variants = allVariants(style);
  for (const variant of variants) {
    const option = document.createElement('option');
    option.value = variant;
    option.textContent = variant;
    variantSelect.append(option);
  }
  variantSelect.value = style.defaultVariant;
  ball.styleId = styleId;
  ball.variant = style.defaultVariant;
}

styleSelect.addEventListener('change', () => fillVariants(styleSelect.value));
variantSelect.addEventListener('change', () => {
  ball.variant = variantSelect.value;
});

fillVariants('vector');
markActive();
log(`协议就绪：${EMOTIONS.length} 个 id，四段（生命周期 / 情绪 / 代理工作 / 提示）`);
log('试试在输入框里输入 34、{"emotionId":"33"} 或 thinking');