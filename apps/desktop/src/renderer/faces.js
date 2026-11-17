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

/** Plain words under the kaomoji, so the bubble explains itself. */
export const STATE_LABEL = {
  idle: '待机',
  sleeping: '睡着了',
  waking: '刚醒',
  drowsy: '有点困',
  bored: '发呆',
  thinking: '在想事情',
  working: '处理中',
  searching: '找资料',
  reading: '在看',
  writing: '在写',
  loading: '加载中',
  progress: '进行中',
  listening: '在听',
  waiting: '等你',
  happy: '开心',
  excited: '兴奋',
  laughing: '笑了',
  shy: '害羞',
  sad: '有点低落',
  angry: '生气了',
  confused: '没懂',
  surprised: '惊了',
  scared: '吓到',
  curious: '好奇',
  proud: '得意',
  celebrate: '做完了',
  bouncing: '蹦一下',
  humming: '哼歌',
  alerting: '出错了',
  refusing: '不行',
  notifying: '提醒你',
  radar: '扫描中',
  messaging: '有消息',
  receiving: '收到',
  sending: '发出去',
  uploading: '上传中',
  dictating: '听你说',
  orbit: '绕一下',
  spawning: '登场',
  composing: '组织语言',
  dragging: '拖我',
  'powering-down': '歇了',
};

/**
 * Bubble content: the face and nothing else.
 *
 * The words were useful but they made the bubble a caption box; a pet that
 * comments on itself in prose reads like a notification. The kaomoji alone
 * carries the mood, and the state's own drawing carries the rest.
 */
export function faceFor(state) {
  return KAOMOJI[state] ?? '';
}
