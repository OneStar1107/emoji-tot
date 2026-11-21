/**
 * Faces, as a small vocabulary rather than a picture per state.
 *
 * Two eyes and a mouth, each with a handful of styles, is enough for sixty
 * expressions: the difference between "thinking" and "confused" is a mouth
 * curve, not a new drawing. Keeping it a vocabulary also means a new state
 * costs three words.
 */
export type EyeStyle = 'dot' | 'arc' | 'closed' | 'wide' | 'star' | 'line' | 'heart' | 'squint' | 'pill' | 'half';
export type MouthStyle = 'smile' | 'open' | 'flat' | 'wave' | 'o' | 'grin' | 'tiny' | 'tongue' | 'big' | 'smirk' | 'dot' | 'frown';

/**
 * The eyebrow line, as a posture rather than a picture.
 *
 * Eyebrows are the one part a mouth cannot fake: "puzzled" and "confused" are
 * the same mouth and different brows, and so are "satisfied" and "proud".
 * Six postures cover every pair the lexicon actually distinguishes.
 */
export type BrowStyle = 'flat' | 'raised' | 'down' | 'one-up' | 'knit' | 'skeptic';

/** Which part of the day a state belongs to. */
export type FaceGroup = 'life' | 'emotion' | 'agent';

/**
 * What a state means, in the words a picker shows.
 *
 * The face itself is geometry; this is the only place that says "this one is
 * called 待机放空 and it means the ball is looking around quietly". Keeping the
 * copy next to the geometry is what lets a host label a menu without a second
 * table drifting out of sync.
 */
export interface FaceMeta {
  id: string;
  name: string;
  group: FaceGroup;
  /** One line, behaviour first — what you would see, not how it feels. */
  desc: string;
}

/** Little props emoji use to make a feeling unmistakable. */
export type FaceMark = 'tear' | 'sweat' | 'anger' | 'sparkle' | 'zzz';

export interface FaceSpec {
  eye: EyeStyle;
  mouth: MouthStyle;
  blush?: boolean;
  /**
   * Where the face leans, in shape units.
   *
   * A face pinned to the centre of the body reads as a decal. Leaning it —
   * back when surprised, down when sad, sideways when confused — is most of
   * what makes an expression look felt rather than displayed.
   */
  dx?: number;
  dy?: number;
  /** Extra eye size on top of the shape's own. */
  eyeScale?: number;
  /** Extra mouth size. */
  mouthScale?: number;
  /** Second eye size relative to the first: one waking eye, one still shut. */
  eyeAsym?: number;
  /** Eyebrow posture drawn above the eyes, in ink. */
  brow?: BrowStyle;
  /**
   * How hard the whole face trembles, 0–1.
   *
   * Drawn as a small uneven offset plus two motion ticks at the temples: a
   * still image of a shaking face still has to read as shaking, because the
   * gallery renders stills and a screenshot is the only evidence a reviewer
   * has.
   */
  shake?: number;
  /** Prop drawn next to the face (tear, sweat, anger vein, sparkle, zzz). */
  marks?: FaceMark[];
}

export const FACES: Record<string, FaceSpec> = {
  idle: { eye: 'pill', mouth: 'wave', blush: true, mouthScale: 1.3 },
  sleeping: { eye: 'closed', mouth: 'tiny', marks: ['zzz'] },
  waking: { eye: 'wide', mouth: 'o' },
  drowsy: { eye: 'arc', mouth: 'tiny' },
  bored: { eye: 'line', mouth: 'flat' },
  'powering-down': { eye: 'closed', mouth: 'flat' },

  listening: { eye: 'wide', mouth: 'tiny' },
  thinking: { eye: 'arc', mouth: 'wave' },
  searching: { eye: 'wide', mouth: 'o' },
  reading: { eye: 'line', mouth: 'flat' },
  writing: { eye: 'arc', mouth: 'tiny' },
  working: { eye: 'line', mouth: 'wave' },
  loading: { eye: 'arc', mouth: 'o' },
  progress: { eye: 'dot', mouth: 'flat' },
  radar: { eye: 'wide', mouth: 'flat' },
  orbit: { eye: 'dot', mouth: 'o' },
  dictating: { eye: 'arc', mouth: 'o' },
  uploading: { eye: 'dot', mouth: 'grin' },
  sending: { eye: 'arc', mouth: 'smile' },
  receiving: { eye: 'wide', mouth: 'grin' },
  messaging: { eye: 'dot', mouth: 'o' },
  waiting: { eye: 'dot', mouth: 'wave' },
  spawning: { eye: 'star', mouth: 'grin' },
  composing: { eye: 'arc', mouth: 'flat' },
  dragging: { eye: 'wide', mouth: 'wave' },

  happy: { eye: 'pill', mouth: 'wave', blush: true, dy: -1, mouthScale: 1.35 },
  excited: { eye: 'star', mouth: 'grin', blush: true, dy: -3, eyeScale: 1.15, mouthScale: 1.15, marks: ['sparkle'] },
  laughing: { eye: 'squint', mouth: 'tongue', blush: true, dy: 1, mouthScale: 1.3, marks: ['sparkle'] },
  playful: { eye: 'arc', mouth: 'grin', blush: true, dx: -2, dy: -1 },
  proud: { eye: 'dot', mouth: 'smile', dy: -2, eyeScale: 1.05 },
  celebrate: { eye: 'star', mouth: 'open', blush: true, dy: -3, eyeScale: 1.2, mouthScale: 1.25 },
  bouncing: { eye: 'arc', mouth: 'smile', dy: -2 },
  shy: { eye: 'arc', mouth: 'tiny', blush: true, dy: 2, dx: -2 },
  sad: { eye: 'arc', mouth: 'wave', dy: 2, eyeScale: 0.95, marks: ['tear'] },
  angry: { eye: 'line', mouth: 'flat', dy: 2, dx: 1, mouthScale: 0.9, marks: ['anger'] },
  confused: { eye: 'dot', mouth: 'wave', dx: 3, dy: 1 },
  suspicious: { eye: 'line', mouth: 'flat', dx: -2 },
  surprised: { eye: 'wide', mouth: 'big', dy: -2, eyeScale: 1.3, mouthScale: 1.15, marks: ['sweat'] },
  scared: { eye: 'wide', mouth: 'wave', dy: -1, eyeScale: 1.25 },
  curious: { eye: 'wide', mouth: 'smile', dx: -2, dy: -1, eyeScale: 1.1 },
  humming: { eye: 'arc', mouth: 'smile', dx: -1, dy: -1 },

  alerting: { eye: 'line', mouth: 'open' },
  notifying: { eye: 'wide', mouth: 'smile' },
  refusing: { eye: 'line', mouth: 'flat' },

  /*
   * The reference lexicon (mood-mates' 33 names) in this engine's own words.
   *
   * Only the naming and the life / emotion / agent split are borrowed; every
   * shape below is drawn from the primitives in this file. The ids match the
   * two-digit protocol so a state can be sent by name and by id.
   */
  'spacing-out': { eye: 'half', mouth: 'dot', brow: 'flat', dy: 1 },
  booting: { eye: 'dot', mouth: 'flat', eyeAsym: 0.45, brow: 'flat' },
  dormant: { eye: 'half', mouth: 'flat', eyeScale: 0.9, dy: 2 },
  'shake-awake': { eye: 'wide', mouth: 'o', eyeAsym: 0.6, brow: 'raised', shake: 0.9 },

  puzzled: { eye: 'dot', mouth: 'wave', eyeAsym: 1.2, brow: 'one-up', dx: 2 },
  down: { eye: 'arc', mouth: 'frown', dy: 3, brow: 'knit', marks: ['tear'] },
  tired: { eye: 'half', mouth: 'flat', dy: 1, brow: 'flat', eyeScale: 0.92 },
  focused: { eye: 'line', mouth: 'flat', brow: 'down', eyeScale: 0.95, mouthScale: 0.9 },
  panicked: { eye: 'wide', mouth: 'big', eyeScale: 1.25, brow: 'knit', shake: 0.8, marks: ['sweat'] },
  resigned: { eye: 'line', mouth: 'frown', dx: -2, dy: 1, brow: 'skeptic' },
  satisfied: { eye: 'arc', mouth: 'smile', blush: true, dy: -1, brow: 'raised' },

  busy: { eye: 'line', mouth: 'flat', eyeScale: 0.95, mouthScale: 0.9, brow: 'flat', dx: 1 },
  done: { eye: 'star', mouth: 'grin', blush: true, dy: -3, mouthScale: 1.2, brow: 'raised', marks: ['sparkle'] },
  error: { eye: 'wide', mouth: 'open', brow: 'knit', dy: -1, marks: ['anger'] },
  recalling: { eye: 'arc', mouth: 'tiny', dx: -2, dy: -2, brow: 'raised' },
  replying: { eye: 'arc', mouth: 'smirk', mouthScale: 1.1, brow: 'flat' },
  'powering-off': { eye: 'closed', mouth: 'flat', eyeScale: 0.85, dy: 2 },
};

export const FACE_IDS: readonly string[] = Object.keys(FACES);

/** Anything unlisted still gets a face: a character must never render blank. */
export function faceFor(state: string): FaceSpec {
  return FACES[state] ?? FACES.idle;
}

/**
 * The state table a picker reads: Chinese name, group, and one behaviour line.
 *
 * Grouping follows the three things this ball actually does — living, feeling,
 * and working — so a host can offer "what is it up to" without inventing its
 * own taxonomy.
 */
export const FACE_META: readonly FaceMeta[] = [
  // ---- 生命周期：它在不在场 ----
  { id: 'idle', name: '待机放空', group: 'life', desc: '左看看右看看，安静地等着' },
  { id: 'waking', name: '唤醒', group: 'life', desc: '眼皮慢慢抬起，先迷糊地眨两下' },
  { id: 'sleeping', name: '睡眠', group: 'life', desc: '闭眼成细线，右上角飘起 zzz' },
  { id: 'drowsy', name: '犯困', group: 'life', desc: '眼皮半垂，脑袋一点一点' },
  { id: 'bored', name: '发呆', group: 'life', desc: '两眼各望各的，时间像停住了' },
  { id: 'spacing-out', name: '出神', group: 'life', desc: '半合的眼看不住焦点，嘴缩成一个小点' },
  { id: 'booting', name: '加载苏醒', group: 'life', desc: '两眼一先一后地亮起来，像系统在自检' },
  { id: 'dormant', name: '休眠', group: 'life', desc: '眼皮半掩，呼吸浅到几乎看不见' },
  { id: 'shake-awake', name: '抖动唤醒', group: 'life', desc: '整只一抖，眼睛猛地睁开' },
  { id: 'spawning', name: '登场', group: 'life', desc: '从一点光里出现，先眨眼再看向你' },
  { id: 'powering-down', name: '停止终止', group: 'life', desc: '眼睛慢慢收成一条线，然后不动了' },

  // ---- 情绪反应：它的心情 ----
  { id: 'happy', name: '开心', group: 'emotion', desc: '弯眼笑，身体轻快地上下起伏' },
  { id: 'excited', name: '兴奋', group: 'emotion', desc: '星星眼，身边蹦出小光点' },
  { id: 'laughing', name: '大笑', group: 'emotion', desc: '笑到眯眼、吐舌头' },
  { id: 'playful', name: '玩耍', group: 'emotion', desc: '歪头偷笑，随时要跳起来' },
  { id: 'proud', name: '得意', group: 'emotion', desc: '下巴微抬，眼睛弯成一条缝' },
  { id: 'celebrate', name: '庆祝', group: 'emotion', desc: '星星眼加撒花，整只弹起来' },
  { id: 'bouncing', name: '雀跃', group: 'emotion', desc: '原地一下一下地弹' },
  { id: 'shy', name: '害羞', group: 'emotion', desc: '目光躲向一边，脸颊慢慢泛红' },
  { id: 'sad', name: '失落', group: 'emotion', desc: '眼睛下沉，眼角挂一滴泪' },
  { id: 'angry', name: '生气', group: 'emotion', desc: '横眉怒目，额角冒出怒筋' },
  { id: 'confused', name: '困惑', group: 'emotion', desc: '两眼大小不一，注视方向对不齐' },
  { id: 'suspicious', name: '怀疑', group: 'emotion', desc: '眯起一只眼斜着打量' },
  { id: 'surprised', name: '惊讶', group: 'emotion', desc: '双眼猛地放大，嘴巴张成 O' },
  { id: 'scared', name: '慌张', group: 'emotion', desc: '瞳孔放大，整只在轻轻发抖' },
  { id: 'curious', name: '好奇', group: 'emotion', desc: '头一歪，目光上上下下地打量' },
  { id: 'humming', name: '哼歌', group: 'emotion', desc: '闭眼微笑，脑袋跟着节拍摇' },
  { id: 'puzzled', name: '疑惑', group: 'emotion', desc: '一边抬眼一边斜眼，眉毛一高一低' },
  { id: 'down', name: '失落', group: 'emotion', desc: '眉尾下垂，嘴角向下，眼角挂一滴泪' },
  { id: 'tired', name: '疲惫', group: 'emotion', desc: '眼皮沉到只剩一条缝，五官整体下沉' },
  { id: 'focused', name: '专注', group: 'emotion', desc: '眉毛压下来，眼睛眯起，嘴抿成一条平线' },
  { id: 'panicked', name: '慌张', group: 'emotion', desc: '眼睛放大、眉毛拧紧，整只在细细发抖' },
  { id: 'resigned', name: '无奈', group: 'emotion', desc: '眼睛眯成横线，眉毛一挑，嘴角向下' },
  { id: 'satisfied', name: '满意', group: 'emotion', desc: '弯眼笑，眉毛舒展，脸颊带一点红' },

  // ---- 代理工作状态：它手上在干什么 ----
  { id: 'thinking', name: '思考中', group: 'agent', desc: '目光在上方打转，头顶绕着一条彩带' },
  { id: 'searching', name: '检索资料', group: 'agent', desc: '目光左右快速扫过，像在翻页' },
  { id: 'reading', name: '阅读', group: 'agent', desc: '视线一行一行往下走' },
  { id: 'writing', name: '输出回复', group: 'agent', desc: '跟着输出节奏轻微缩放' },
  { id: 'working', name: '处理中忙碌', group: 'agent', desc: '目光小幅循环，身体几乎不动' },
  { id: 'loading', name: '联网加载', group: 'agent', desc: '左右眼轮流眨，像信号在两端跳' },
  { id: 'progress', name: '进度推进', group: 'agent', desc: '一格一格往前挪，看得见走了多少' },
  { id: 'radar', name: '扫描环境', group: 'agent', desc: '目光一圈一圈地扫过四周' },
  { id: 'orbit', name: '环绕巡检', group: 'agent', desc: '绕着圈看，不放过一个角落' },
  { id: 'dictating', name: '听写中', group: 'agent', desc: '压着听，边听边记' },
  { id: 'uploading', name: '上传中', group: 'agent', desc: '鼓着劲往上顶' },
  { id: 'sending', name: '发送中', group: 'agent', desc: '往前一推，东西递出去' },
  { id: 'receiving', name: '接收任务', group: 'agent', desc: '轻轻眨一下并放大，像点头确认收到' },
  { id: 'messaging', name: '回消息', group: 'agent', desc: '一句一句地往外吐' },
  { id: 'waiting', name: '等待输入', group: 'agent', desc: '安静地等，目光追着你' },
  { id: 'listening', name: '聆听', group: 'agent', desc: '目光轻轻上下扫读，像在听你说话' },
  { id: 'composing', name: '组织回复', group: 'agent', desc: '先在脑子里排好，再开口' },
  { id: 'dragging', name: '被拖动', group: 'agent', desc: '被拎起来，晃着脑袋' },
  { id: 'alerting', name: '出错', group: 'agent', desc: '脸色急促闪烁，最后定格成警示色' },
  { id: 'notifying', name: '提示提醒', group: 'agent', desc: '轻轻跳一下，引起你的注意' },
  { id: 'refusing', name: '拒绝受限', group: 'agent', desc: '斜眼下压并摇头，明确表示不行' },
  { id: 'busy', name: '处理中', group: 'agent', desc: '眼睛压成专注的横线，嘴抿紧，几乎不动' },
  { id: 'done', name: '任务完成', group: 'agent', desc: '星星眼加咧嘴笑，身边蹦出小光点' },
  { id: 'error', name: '出错', group: 'agent', desc: '瞪大眼、眉毛拧紧，额角冒出怒筋' },
  { id: 'recalling', name: '复述回忆', group: 'agent', desc: '目光向上翻，像在记忆里翻检' },
  { id: 'replying', name: '输出回复', group: 'agent', desc: '一边说一边挑嘴角，句子跟着往外递' },
  { id: 'powering-off', name: '关机', group: 'agent', desc: '眼睛慢慢合上，五官一点点沉下去' },
];

const META_BY_ID = new Map(FACE_META.map((m) => [m.id, m]));

/** Look one up, or fall back to the raw id so a picker never shows nothing. */
export function faceMeta(id: string): FaceMeta {
  return META_BY_ID.get(id) ?? { id, name: id, group: 'emotion', desc: '' };
}

/** Just the states in one group, in table order — the shape a menu wants. */
export function facesInGroup(group: FaceGroup): FaceMeta[] {
  return FACE_META.filter((m) => m.group === group);
}
