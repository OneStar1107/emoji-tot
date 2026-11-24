/**
 * Deterministic content for visual review captures.
 *
 * These values mirror the approved Polar Graphite master board. They are never
 * loaded by the production renderer; the debug-only fixture hook in island.js
 * accepts them while capture-ui.mjs runs a throwaway profile.
 */

const localDate = (day, hour = 0, minute = 0) =>
  new Date(2026, 10, day, hour, minute, 0, 0).getTime();

const isoDay = (day) => `2026-11-${String(day).padStart(2, '0')}T12:00:00+08:00`;

export function createMasterFixture(art = '') {
  return {
    clock: '07:20',
    cast: 'tot',
    battery: { level: 94, charging: false },
    weather: {
      place: { name: '香港', district: '', country: 'Hong Kong' },
      current: {
        temp: 19,
        feels: 16,
        humidity: 47,
        wind: 14,
        text: '阴',
        sunrise: '2026-11-24T06:42:00+08:00',
        sunset: '2026-11-24T17:38:00+08:00',
      },
      days: [
        { date: isoDay(24), text: '阴', max: 20, min: 13 },
        { date: isoDay(25), text: '多云', max: 21, min: 18 },
        { date: isoDay(26), text: '晴', max: 24, min: 21 },
        { date: isoDay(27), text: '多云', max: 21, min: 20 },
        { date: isoDay(28), text: '晴', max: 23, min: 17 },
      ],
    },
    media: {
      active: true,
      title: 'Desktop Dream',
      artist: 'Tot Sessions',
      album: '网易云音乐',
      playing: true,
      position: 106,
      duration: 204,
      art,
      source: '网易云音乐',
      liveSince: 0,
      // Visual captures must keep the approved 01:46 frame even while the
      // fixture-injected media session is marked as playing.
      sampledAt: 0,
    },
    lyrics: {
      title: 'Desktop Dream',
      synced: true,
      duration: 204,
      source: '网易云音乐',
      lines: [
        { t: 0, text: '灯光落在凌晨的屏幕边缘' },
        { t: 104, text: '想把这一刻留在桌面，等你回来再看一眼' },
        { t: 156, text: '风经过房间，也经过我们' },
        { t: 184, text: '让沉默也变成温柔的回声' },
        { t: 202, text: 'Desktop Dream' },
      ],
    },
    prefsPatch: {
      defaultPage: 'music',
      theme: 'dark',
      focus: { enabled: true, work: 25, rest: 5 },
      todo: { enabled: true, notify: true },
      shelf: { enabled: true, showClipboard: false },
      weather: { unit: 'c', city: '香港', autoLocate: true },
      devices: { showBattery: true, pinned: [], hidden: [] },
      pages: Object.fromEntries(
        ['music', 'weather', 'quota', 'mail', 'focus', 'todo', 'health', 'shelf', 'devices', 'calendar', 'messenger']
          .map((key) => [key, true]),
      ),
      pageOrder: ['music', 'weather', 'quota', 'mail', 'focus', 'todo', 'health', 'shelf', 'devices', 'calendar', 'messenger'],
    },
    focus: {
      phase: 'work',
      running: true,
      remaining: 984,
      total: 1500,
      cycles: 1,
      longRest: false,
      stats: {
        today: { count: 4, minutes: 100 },
        week: { count: 17, minutes: 425 },
      },
    },
    health: {
      enabled: true,
      waterMin: 45,
      standMin: 60,
      sinceWater: 28,
      sinceStand: 22,
      waterRightLabel: '46 分钟后',
      standRightLabel: '42 分钟后',
      waterDue: false,
      standDue: false,
      waterCount: 6,
      standCount: 3,
      waterLitres: 1.8,
      barPercents: [22, 55, 38, 83, 49, 94, 31, 66, 42],
      trend: [
        { water: 1, stand: 1 },
        { water: 3, stand: 2 },
        { water: 2, stand: 1 },
        { water: 5, stand: 3 },
        { water: 2, stand: 2 },
        { water: 6, stand: 3 },
        { water: 1, stand: 1 },
        { water: 4, stand: 2 },
      ],
    },
    todos: [
      { id: 'fixture-todo-1', text: '整理灵动岛组件', priority: 'high', due: localDate(24, 18), displayDue: '今天', repeat: 'none', done: false },
      { id: 'fixture-todo-2', text: '检查歌词长句', priority: 'mid', due: localDate(25, 12), displayDue: '周二', repeat: 'none', done: false },
      { id: 'fixture-todo-3', text: '同步设置页 Token', priority: 'mid', due: localDate(26, 12), displayDue: '周三', repeat: 'none', done: false },
      { id: 'fixture-todo-4', text: '验证 140% 缩放', priority: 'low', due: localDate(27, 12), displayDue: '周四', repeat: 'none', done: false },
      { id: 'fixture-todo-5', text: '冻结极地石墨交付包', priority: 'low', due: localDate(28, 12), repeat: 'none', done: true },
    ],
    todoSummary: { current: 5, due: 2, done: 2, total: 5 },
    shelf: [
      { name: 'polar-graphite-spec.pdf', size: 5177344, group: 0, category: '设计', relativeTime: '刚刚' },
      { name: 'tot-original-ring-v5.svg', size: 4096, group: 0, category: '角色', relativeTime: '1 小时前' },
      { name: '截图 2026-11-24 14:53:18.png', size: 2202009, group: 0, category: '待整理', relativeTime: '昨天' },
      { name: '设置页文案长句.txt', size: 18432, group: 0, category: '文本', relativeTime: '昨天' },
    ],
    clipboard: [
      { id: 'fixture-clip-1', text: 'EDF5F8 · Polar Graphite accent', pinned: true },
    ],
    devices: {
      scanning: false,
      devices: [
        { name: 'WH-1000XM5', displayName: 'WH-1000XM5', battery: 82, status: 'OK', source: 'bluetooth' },
        { name: 'MX Mechanical', displayName: 'MX Mechanical', battery: 66, status: 'OK', source: 'hid-wireless' },
        { name: 'MX Master 3S', displayName: 'MX Master 3S', battery: 48, status: 'OK', source: 'hid-wireless' },
        { name: 'iPhone 17 Pro', displayName: 'iPhone 17 Pro', battery: 71, status: 'OK', source: 'bluetooth' },
      ],
    },
    quota: {
      accounts: [
        { id: 'fixture-codex', name: 'Codex', provider: 'codex', current: true },
      ],
      current: { id: 'fixture-codex', name: 'Codex', provider: 'codex', current: true },
      last: {
        provider: 'codex',
        currency: 'PCT',
        total: '76',
        topped: 76,
        granted: 24,
        available: true,
        at: localDate(24, 1, 40),
        resetLabel: '周日 14:09 重置',
      },
    },
    agents: [
      { id: 'claude', label: 'Claude', on: true, active: true, running: true, since: Date.now() - 120000, taskCount: 1, percent: 42 },
      { id: 'deepseek', label: 'DeepSeek', on: true, active: true, running: true, since: Date.now() - 480000, taskCount: 0, percent: 63, displayValue: '¥20.8' },
      { id: 'kimi', label: 'Kimi', on: true, active: true, running: false, since: Date.now() - 960000, taskCount: 0, percent: 86 },
    ],
    mail: {
      accounts: [{ id: 'fixture-mail', name: 'Tot Mail', address: 'tot@example.com' }],
      syncing: false,
      error: '',
      lastSync: Date.now() - 120000,
      messages: [
        { id: 'mail-1', accountId: 'fixture-mail', fromName: 'GitHub', fromAddress: 'github@example.com', summary: '请使用 482913 完成当前登录。', subject: '邮箱验证码', displayTime: '刚刚', seen: false, date: Date.now() - 90000 },
        { id: 'mail-2', accountId: 'fixture-mail', fromName: 'Linear', fromAddress: 'linear@example.com', summary: '三个项目已被加入本次发布。', subject: '本周迭代简报', displayTime: '09:42', seen: false, date: localDate(24, 9, 42) },
        { id: 'mail-3', accountId: 'fixture-mail', fromName: 'Vercel', fromAddress: 'vercel@example.com', summary: 'project-graphite · production', subject: '预览已部署', displayTime: '08:10', seen: false, date: localDate(23, 18, 20) },
        { id: 'mail-4', accountId: 'fixture-mail', fromName: 'Notion', fromAddress: 'notion@example.com', summary: 'EmojiTot / UI System', subject: '周会纪要更新', displayTime: '昨天', seen: false, date: localDate(23, 16, 8) },
        ...Array.from({ length: 12 }, (_, index) => ({
          id: `mail-archive-${index + 1}`,
          accountId: 'fixture-mail',
          fromName: '归档',
          fromAddress: `较早已读邮件 ${index + 1}`,
          subject: '归档内容',
          seen: true,
          date: localDate(20 - index, 10, 0),
        })),
      ],
    },
    calendar: {
      subscriptions: [],
      upcoming: [],
      events: [
        { id: 'event-1', title: '设计评审 · Orbital', start: localDate(24, 9, 30), detail: 'Teams · 45 分钟' },
        { id: 'event-2', title: '极地石墨收版交付', start: localDate(24, 14, 0), detail: '本地 · 1 小时' },
        { id: 'event-3', title: 'Tot 动画复盘', start: localDate(24, 19, 30), detail: '提醒 · 30 分钟' },
        { id: 'event-4', title: '发布检查清单', start: localDate(24, 0, 0), allDay: true, detail: '深色 / 浅色 / 真实内容图' },
      ],
      reminderCount: 5,
    },
    calendarView: { year: 2026, month: 10, selected: 24 },
    messenger: {
      unread: 7,
      appCount: 5,
      apps: [
        { id: 'wechat', label: '微信', title: '微信 · 家人群', preview: '晚上一起吃饭吗？', handle: 'fixture-wechat', unread: 3, windows: 1 },
        { id: 'wecom', label: '企业微信', title: '企业微信 · 产品组', preview: '看看这次极地石墨稿', handle: 'fixture-wecom', unread: 2, windows: 1 },
        { id: 'qq', label: 'QQ', title: 'QQ · 设计交流', preview: '两张设置页差异已标', handle: 'fixture-qq', unread: 1, windows: 1 },
        { id: 'feishu', label: '飞书', title: '飞书 · 项目群', preview: '颜色系统已确认', handle: 'fixture-feishu', unread: 1, windows: 1 },
      ],
    },
  };
}
