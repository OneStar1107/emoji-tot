export const LEXICON = [
    // Lifecycle (00–08): is it present at all?
    { id: '00', en: 'Sleeping', zh: '睡眠', group: 'life', state: 'sleeping' },
    { id: '01', en: 'Waking', zh: '唤醒', group: 'life', state: 'waking' },
    { id: '02', en: 'Idle', zh: '待机', group: 'life', state: 'idle' },
    { id: '03', en: 'Curious', zh: '好奇', group: 'life', state: 'curious' },
    { id: '04', en: 'Spacing Out', zh: '出神', group: 'life', state: 'spacing-out' },
    { id: '05', en: 'Booting', zh: '加载苏醒', group: 'life', state: 'booting' },
    { id: '06', en: 'Dormant', zh: '休眠', group: 'life', state: 'dormant' },
    { id: '07', en: 'Shake Awake', zh: '抖动唤醒', group: 'life', state: 'shake-awake' },
    { id: '08', en: 'Spawning', zh: '登场', group: 'life', state: 'spawning', extra: true },
    // Feelings (10–21): what it feels.
    { id: '10', en: 'Happy', zh: '开心', group: 'emotion', state: 'happy' },
    { id: '11', en: 'Puzzled', zh: '疑惑', group: 'emotion', state: 'puzzled' },
    { id: '12', en: 'Down', zh: '失落', group: 'emotion', state: 'down' },
    { id: '13', en: 'Surprised', zh: '惊讶', group: 'emotion', state: 'surprised' },
    { id: '14', en: 'Shy', zh: '害羞', group: 'emotion', state: 'shy' },
    { id: '15', en: 'Tired', zh: '疲惫', group: 'emotion', state: 'tired' },
    { id: '16', en: 'Focused', zh: '专注', group: 'emotion', state: 'focused' },
    { id: '17', en: 'Panicked', zh: '慌张', group: 'emotion', state: 'panicked' },
    { id: '18', en: 'Resigned', zh: '无奈', group: 'emotion', state: 'resigned' },
    { id: '19', en: 'Satisfied', zh: '满意', group: 'emotion', state: 'satisfied' },
    { id: '20', en: 'Confused', zh: '困惑', group: 'emotion', state: 'confused' },
    { id: '21', en: 'Angry', zh: '生气', group: 'emotion', state: 'angry' },
    // Agent work (30–41): what it is doing.
    { id: '30', en: 'Thinking', zh: '思考中', group: 'agent', state: 'thinking' },
    { id: '31', en: 'Receiving', zh: '接收任务', group: 'agent', state: 'receiving' },
    { id: '32', en: 'Busy', zh: '处理中', group: 'agent', state: 'busy' },
    { id: '33', en: 'Done', zh: '任务完成', group: 'agent', state: 'done' },
    { id: '34', en: 'Error', zh: '出错', group: 'agent', state: 'error' },
    { id: '35', en: 'Listening', zh: '等待输入', group: 'agent', state: 'listening' },
    { id: '36', en: 'Loading', zh: '联网加载', group: 'agent', state: 'loading' },
    { id: '37', en: 'Recalling', zh: '复述回忆', group: 'agent', state: 'recalling' },
    { id: '38', en: 'Refusing', zh: '拒绝/受限', group: 'agent', state: 'refusing' },
    { id: '39', en: 'Replying', zh: '输出回复', group: 'agent', state: 'replying' },
    { id: '40', en: 'Searching', zh: '检索资料', group: 'agent', state: 'searching' },
    { id: '41', en: 'Powering Off', zh: '停止终止', group: 'agent', state: 'powering-off' },
];
/** One entry by protocol id; null for anything not in the lexicon. */
export function lexiconEntry(id) {
    return LEXICON.find((entry) => entry.id === id) ?? null;
}
