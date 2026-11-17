/**
 * What the ball says about itself.
 *
 * The bubble is kaomoji first: it is the same medium as the character (text
 * drawing a face), it needs no translation, and it reads at 11px. A state
 * with no kaomoji falls back to words, which the main process supplies as
 * `tips`.
 */
export const KAOMOJI = {
  idle: '(｡･ω･｡)',
  sleeping: '(－_－) zzZ',
  waking: '(⊙_⊙)',
  drowsy: '(´-ω-`)',
  bored: '(￣～￣)',
  thinking: '(｡•́︿•̀｡)',
  working: '(ง •̀_•́)ง',
  searching: '(・∀・)ノ',
  reading: '(⋯_⋯)',
  writing: '✍(◔◡◔)',
  loading: '(◌˘◡˘◌)',
  progress: '▓▓▓░░',
  listening: '(・_・)',
  waiting: '(￣ω￣;)',
  happy: '(◕‿◕)',
  excited: 'ヽ(✿ﾟ▽ﾟ)ノ',
  laughing: '(≧▽≦)',
  shy: '(*/ω＼*)',
  sad: '(｡•́︿•̀｡)',
  angry: '(╯°□°)╯',
  confused: '(・_・?)',
  surprised: '(°ロ°)',
  scared: '(ﾉﾟ0ﾟ)ﾉ',
  curious: '(・・?',
  proud: '(￣▽￣)ゞ',
  celebrate: 'ヽ(°〇°)ﾉ',
  bouncing: '(ﾉ^_^)ﾉ',
  humming: '♪(・ω・)',
  alerting: '(╬ Ò﹏Ó)',
  refusing: '(￣^￣)',
  notifying: '(´・ω・)',
  radar: '((((・_・))))',
  messaging: '(・ω・)ノ',
  receiving: '(・∀・)ノ',
  sending: '(・ω・)ノ→',
  uploading: '↑(・_・)',
  dictating: '🎤(・_・)',
  orbit: '(・∨・)',
  spawning: '(ﾉ◕ヮ◕)ﾉ',
  composing: '(￣ω￣)',
  dragging: '(・_・)',
  'powering-down': '(－ω－)',
};

/** Seconds worth of wording for each state, used when there is no kaomoji. */
export const STATE_TEXT = {
  working: '处理中',
  thinking: '在想',
  progress: '进行中',
  waiting: '等你',
  alerting: '出错了',
  celebrate: '做完了',
};

/** The bubble content for a state: kaomoji, else a short word, else nothing. */
export function faceFor(state, tips) {
  if (tips) return tips;
  return KAOMOJI[state] ?? STATE_TEXT[state] ?? '';
}
