/**
 * What the island can show, and in what order.
 *
 * One table, used by the island and by the settings page manager. A page that
 * has no data source yet still appears, as an empty state with one action —
 * a hidden page reads as "the feature is missing", an empty one reads as "not
 * set up yet", and only the second is true.
 */
export const PAGES = [
  { key: 'music', title: '音乐', sub: '系统正在播放', icon: 'music', stage: 1 },
  { key: 'weather', title: '天气', sub: '当地与七日', icon: 'sun', stage: 1 },
  { key: 'quota', title: 'AI 额度', sub: '余额与账号', icon: 'coin', stage: 1 },
  { key: 'mail', title: '邮箱', sub: '摘要与验证码', icon: 'mail', stage: 1 },
  { key: 'focus', title: '专注', sub: '番茄钟与休息', icon: 'timer', stage: 1 },
  { key: 'todo', title: '待办', sub: '清单与到期', icon: 'check', stage: 1 },
  { key: 'health', title: '健康', sub: '喝水与久坐', icon: 'drop', stage: 1 },
  { key: 'shelf', title: '置物架', sub: '临时收纳', icon: 'tray', stage: 1 },
  { key: 'calendar', title: '日程', sub: '月历与邀请', icon: 'calendar', stage: 3 },
];

export const STATUS_ITEMS = [
  { key: 'battery', label: '电量' },
  { key: 'clock', label: '时间' },
  { key: 'weather', label: '温度' },
  { key: 'quota', label: '余额' },
  { key: 'volume', label: '音量' },
];

/** Pages switched on by default: the six that need no setup. */
export const DEFAULT_PAGES = ['music', 'weather', 'focus', 'todo', 'quota', 'mail'];
