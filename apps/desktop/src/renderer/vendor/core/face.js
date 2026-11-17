export const FACES = {
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
};
export const FACE_IDS = Object.keys(FACES);
/** Anything unlisted still gets a face: a character must never render blank. */
export function faceFor(state) {
    return FACES[state] ?? FACES.idle;
}
/**
 * The state table a picker reads: Chinese name, group, and one behaviour line.
 *
 * Grouping follows the three things this ball actually does — living, feeling,
 * and working — so a host can offer "what is it up to" without inventing its
 * own taxonomy.
 */
export const FACE_META = [
    // ---- 生命周期：它在不在场 ----
    { id: 'idle', name: '待机放空', group: 'life', desc: '左看看右看看，安静地等着' },
    { id: 'waking', name: '唤醒', group: 'life', desc: '眼皮慢慢抬起，先迷糊地眨两下' },
    { id: 'sleeping', name: '睡眠', group: 'life', desc: '闭眼成细线，右上角飘起 zzz' },
    { id: 'drowsy', name: '犯困', group: 'life', desc: '眼皮半垂，脑袋一点一点' },
    { id: 'bored', name: '发呆', group: 'life', desc: '两眼各望各的，时间像停住了' },
    { id: 'spawning', name: '加载苏醒', group: 'life', desc: '双眼逐项亮起，像系统在初始化' },
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
];
const META_BY_ID = new Map(FACE_META.map((m) => [m.id, m]));
/** Look one up, or fall back to the raw id so a picker never shows nothing. */
export function faceMeta(id) {
    return META_BY_ID.get(id) ?? { id, name: id, group: 'emotion', desc: '' };
}
/** Just the states in one group, in table order — the shape a menu wants. */
export function facesInGroup(group) {
    return FACE_META.filter((m) => m.group === group);
}
