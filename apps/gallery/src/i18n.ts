/**
 * Two languages, one dictionary.
 *
 * The site is small enough that a lookup table beats a framework; what matters
 * is that a key is never missing, so the English page cannot fall back to a
 * Chinese label in a corner nobody checked. Every string a view prints comes
 * from here — including Docs, which used to be a wall of Chinese prose.
 */
export type Lang = 'zh' | 'en';

const MESSAGES = {
  zh: {
    'nav.console': '控制台',
    'nav.gallery': '表情馆',
    'nav.scene': '场景',
    'nav.docs': '文档',
    'nav.dark': '深色背景',
    'nav.language': '语言',

    'console.title': '控制台',
    'console.lead': '改这里的所有东西，右下角的代码跟着变。',
    'console.cast': '角色',
    'console.shape': '形状',
    'console.color': '颜色',
    'console.state': '状态',
    'console.copy': '复制代码',
    'console.code': '代码',
    'console.copied': '已复制',
    'console.copyFailed': '复制失败',
    'console.noParams': '这个变体没有可调参数',
    'console.act.spin': '自旋',
    'console.act.bounce': '弹跳',
    'console.act.burst': '撒花',
    'console.finish.sticker': '贴纸',
    'console.finish.flat': '平涂',
    'console.runtime': '实时骨架',
    'console.runtime.state': '状态',
    'console.runtime.eye': '眼型',
    'console.runtime.tilt': '倾角',
    'console.runtime.lift': '抬升',
    'console.motion.pause': '暂停动作',
    'console.motion.resume': '继续动作',
    'console.snippet': '组件',
    'console.genome': '基因组',
    'console.custom': '自定义',
    'console.customGenome': '自定义组合',
    'console.islandTitle': '音乐',
    'console.islandSong': '系统正在播放',
    'console.islandHint': '桌面端就是这个形态，点胶囊收起',
    'console.islandNote': '桌面端形态：屏幕顶部居中，收起是一条胶囊，点一下展开。',

    'wall.title': '表情馆',
    'wall.lead': '61 张脸，一个两位数。',
    'wall.all': '全部',
    'wall.copy': '复制代码',
    'wall.close': '关闭',
    'wall.tab.cast': '角色',
    'wall.tab.emotion': '表情',
    'wall.count.cast': '{n} / {total} 个角色',
    'wall.count.state': '{n} / {total} 个状态',
    'docs.group.life': '生命周期',
    'docs.group.emotion': '情绪反应',
    'docs.group.agent': '代理工作',

    'wall.group.life': '生命周期',
    'wall.group.emotion': '情绪反应',
    'wall.group.agent': '代理工作',
    'wall.hover.motion': '悬停看动作',
    'wall.hover.motionShort': '悬停看动作',

    'scene.title': '场景 · 多会话仲裁',
    'scene.heading': '场景',
    'scene.lead': '九个代理各自上报状态，只有一张脸。紧急事件打断停留期，不紧急的排队。',
    'scene.act.report': '随机上报',
    'scene.act.error': '全部报错',
    'scene.act.done': '全部完成',
    'scene.act.reset': '重置',
    'scene.act.shuffle': '换一批',
    'scene.act.party': '全体开心',
    'scene.act.sleep': '全体入睡',
    'scene.idle': '待机',
    'scene.showing': '显示：',
    'scene.noSession': '还没有会话上报',
    'scene.error': '全部报错',
    'scene.done': '全部完成',
    'scene.reset': '重置',

    'drawer.cast': '角色',
    'drawer.color': '颜色',
    'drawer.face': '表情',
    'drawer.background': '背景',
    'drawer.search': '搜索名字',
    'drawer.unnamed': '一个没有被命名的组合。',

    'docs.title': '文档',
    'docs.what': '这是什么',
    'docs.genome': '角色是基因组',
    'docs.families': '角色族',
    'docs.engine': '会动的骨架',
    'docs.structure': '项目结构',
    'docs.protocol': '协议',
    'docs.desktop': '桌面端：两种形态',
    'docs.extend': '加一个页面',
    'docs.call': '调用',
    'docs.whatP1': '一个用 SVG 画出来的角色引擎。没有精灵图、没有动画文件：每个身体是一条手写的闭合轮廓，每张脸是一组眼型与嘴型，每个角色只有轮廓、五官和它天生带着的那几件东西。',
    'docs.whatP2': '引擎之上是 {cast} 个角色、{faces} 个表情、{bodies} 种轮廓、2 种画风。桌宠、控制台、站点共用同一套代码。',
    'docs.genomeIntro': '一个角色由四项组成，没有一项是图片：',
    'docs.genomeBody': '轮廓，{bodies} 条手写闭合路径（{sample} …）；梨有腰和梗叶、面包有拱顶平底、星星的五个角是真的角',
    'docs.genomeColor': '12 种实色；五官的墨色按亮度自动取反',
    'docs.genomeTrait': '{traits} 种轮廓外特征，每个角色最多佩戴一个；它会按身体高度和顶部形状自动锚定',
    'docs.genomeFace': '表情，{faces} 个状态，见下面的协议表',
    'docs.finishHeading': '画风',
    'docs.finishBody': '同一份轮廓有两种表面处理：sticker（模切白边，近白的身体自动换深色边）和 flat（纯色平涂）。它只是一个参数，不改变任何几何：',
    'docs.breedHeading': '繁衍',
    'docs.breedBody': '两个角色可以交叉出新的组合，不落库、不留痕：',
    'docs.tableId': 'id',
    'docs.tableState': '状态',
    'docs.tableGroup': '分组',
    'docs.tableName': '中文名',
    'docs.tableDesc': '它会怎么做',
    'docs.tableFamily': '族',
    'docs.tableMembers': '成员数',
    'docs.tableBody': '身体',
    'docs.tableSample': '示例',
    'docs.protocolLead': '两位数的编号就是对外契约：十位代表分组，组间空号是给扩展留的。',
    'docs.groupsSummary': '表情按三组归档：生命周期 {life} 个、情绪反应 {emotion} 个、代理工作 {agent} 个。',
    'docs.desktopP1': '桌面端有两种形态，托盘菜单与设置里随时切换：',
    'docs.desktopIsland': '灵动岛',
    'docs.desktopBall': '桌面球',
    'docs.tableForm': '形态',
    'docs.tableWhere': '位置',
    'docs.tableWhat': '它是什么',
    'docs.islandWhere': '屏幕顶部居中',
    'docs.islandWhat': '一条胶囊：脸、电量、时间、温度；点一下展开成功能面板',
    'docs.ballWhere': '任意位置，可贴边',
    'docs.ballWhat': '会跳、会生气、会被拖来拖去的球',
    'docs.desktopP2': '两者可以同时开着。形态只是 prefs.json 里的一个字段，两个窗口都提前创建，切换只改可见性 —— 所以切过去不会重载页面，岛也不会丢掉当前那一页。',
    'docs.sizeHeading': '岛的尺寸只有一个来源',
    'docs.sizeBody': '页面用 ResizeObserver 量自己的内容，主进程按这个尺寸 setBounds 并保持居中。主进程里没有一处硬编码展开宽高：页面长高，窗口就长高。',
    'docs.settingsHeading': '设置中心',
    'docs.settingsBody': '独立窗口，左侧导航、右侧分组卡片，{pages} 页。没有保存按钮：每个开关、下拉、滑块的改动立刻写进 prefs.json，别的窗口随即跟上。',
    'docs.extendIntro': '岛上的每一个页面都是注册表里的一行，加上一个只负责数据的服务：',
    'docs.extendP': '约定有三条：服务只写自己的文件；推送的载荷结构与 bootstrap 返回的一模一样（结构不一致是「推送成功但页面永远空」的经典原因）；页面在空数据时给一句话加一个动作按钮，而不是一个空盒子。',

    'footer.license': 'EmojiTot 非商用许可 · 由 @emojitot/core 绘制',
  },
  en: {
    'nav.console': 'Console',
    'nav.gallery': 'Faces',
    'nav.scene': 'Scene',
    'nav.docs': 'Docs',
    'nav.dark': 'Dark background',
    'nav.language': 'Language',

    'console.title': 'Console',
    'console.lead': 'Change anything here; the snippet in the corner follows.',
    'console.cast': 'Cast',
    'console.shape': 'Shape',
    'console.color': 'Colour',
    'console.state': 'State',
    'console.copy': 'Copy snippet',
    'console.code': 'snippet',
    'console.copied': 'Copied',
    'console.copyFailed': 'Copy failed',
    'console.noParams': 'This variant has no parameters',
    'console.act.spin': 'Spin',
    'console.act.bounce': 'Hop',
    'console.act.burst': 'Confetti',
    'console.finish.sticker': 'Sticker',
    'console.finish.flat': 'Flat',
    'console.runtime': 'Live rig',
    'console.runtime.state': 'State',
    'console.runtime.eye': 'Eye',
    'console.runtime.tilt': 'Tilt',
    'console.runtime.lift': 'Lift',
    'console.motion.pause': 'Pause motion',
    'console.motion.resume': 'Resume motion',
    'console.snippet': 'component',
    'console.genome': 'genome',
    'console.custom': 'Custom',
    'console.customGenome': 'Custom mix',
    'console.islandTitle': 'Music',
    'console.islandSong': 'Now playing',
    'console.islandHint': 'This is the desktop form; tap the pill to collapse',
    'console.islandNote': 'Desktop form: centred at the top, a pill when closed, one tap to open.',

    'wall.title': 'Faces',
    'wall.lead': '61 faces, one two-digit number.',
    'wall.all': 'All',
    'wall.copy': 'Copy snippet',
    'wall.close': 'Close',
    'wall.tab.cast': 'Cast',
    'wall.tab.emotion': 'Faces',
    'wall.count.cast': '{n} / {total} characters',
    'wall.count.state': '{n} / {total} states',
    'docs.group.life': 'Lifecycle',
    'docs.group.emotion': 'Feelings',
    'docs.group.agent': 'Agent work',

    'wall.group.life': 'Lifecycle',
    'wall.group.emotion': 'Feelings',
    'wall.group.agent': 'Agent work',
    'wall.hover.motion': 'Hover to see the motion',
    'wall.hover.motionShort': 'Hover to see the motion',

    'scene.title': 'Scene · multi-session arbitration',
    'scene.heading': 'Scene',
    'scene.lead':
      'Nine agents report their own state; there is one face. Urgent events interrupt the dwell, the rest queue.',
    'scene.act.report': 'Random report',
    'scene.act.error': 'All fail',
    'scene.act.done': 'All done',
    'scene.act.reset': 'Reset',
    'scene.act.shuffle': 'Shuffle',
    'scene.act.party': 'Party',
    'scene.act.sleep': 'Sleep',
    'scene.idle': 'Idle',
    'scene.showing': 'Showing: ',
    'scene.noSession': 'No session has reported yet',
    'scene.error': 'All fail',
    'scene.done': 'All done',
    'scene.reset': 'Reset',

    'drawer.cast': 'Cast',
    'drawer.color': 'Colour',
    'drawer.face': 'Face',
    'drawer.background': 'Background',
    'drawer.search': 'Search names',
    'drawer.unnamed': 'An unnamed combination.',

    'docs.title': 'Docs',
    'docs.what': 'What this is',
    'docs.genome': 'A character is a genome',
    'docs.families': 'Families',
    'docs.engine': 'The living rig',
    'docs.structure': 'Project structure',
    'docs.protocol': 'Protocol',
    'docs.desktop': 'Desktop: two forms',
    'docs.extend': 'Add a page',
    'docs.call': 'Calling it',
    'docs.whatP1': 'A character engine drawn in SVG. No spritesheets, no animation files: every body is a hand-written closed outline, every face is a set of eye and mouth styles, and a character is just its silhouette, its face and the few things it was born with.',
    'docs.whatP2': 'On top of the engine: {cast} characters, {faces} expressions, {bodies} outlines, 2 finishes. The desktop pet, the console and this site share one engine.',
    'docs.genomeIntro': 'A character has four parts, and none of them is a picture:',
    'docs.genomeBody': 'the outline — {bodies} hand-written closed paths ({sample} …); a pear has a waist and a stem leaf, a loaf has a domed top and a flat base, the star has five real corners',
    'docs.genomeColor': '12 solid colours; the face ink inverts by luminance',
    'docs.genomeTrait': '{traits} silhouette traits, at most one per character; each anchors to the body height and crowned shape',
    'docs.genomeFace': 'the expression — {faces} states, see the protocol table below',
    'docs.finishHeading': 'Finish',
    'docs.finishBody': 'The same outline has two surface treatments: sticker (die-cut white edge, which flips to a dark edge on near-white bodies) and flat. It is one parameter and changes no geometry:',
    'docs.breedHeading': 'Breeding',
    'docs.breedBody': 'Two characters cross into a new combination; nothing is stored:',
    'docs.tableId': 'id',
    'docs.tableState': 'state',
    'docs.tableGroup': 'group',
    'docs.tableName': 'name',
    'docs.tableDesc': 'what it does',
    'docs.tableFamily': 'family',
    'docs.tableMembers': 'members',
    'docs.tableBody': 'bodies',
    'docs.tableSample': 'examples',
    'docs.protocolLead': 'The two-digit number is the public contract: the tens digit is the group, and gaps inside a decade are left for growth.',
    'docs.groupsSummary': 'Expressions fall into three groups: {life} lifecycle, {emotion} feelings, {agent} agent states.',
    'docs.desktopP1': 'The desktop app has two forms, switchable from the tray or the settings window at any time:',
    'docs.desktopIsland': 'Island',
    'docs.desktopBall': 'Ball',
    'docs.tableForm': 'form',
    'docs.tableWhere': 'where',
    'docs.tableWhat': 'what it is',
    'docs.islandWhere': 'top centre of the screen',
    'docs.islandWhat': 'a pill with the face, battery, time and temperature; one tap opens a panel',
    'docs.ballWhere': 'anywhere, docks to an edge',
    'docs.ballWhat': 'a ball that hops, sulks and gets dragged around',
    'docs.desktopP2': 'Both can be on at once. The form is one field in prefs.json; both windows are created up front and the switch only toggles visibility, so nothing reloads and the island keeps the page it was on.',
    'docs.sizeHeading': 'The island has one source of size',
    'docs.sizeBody': 'The page measures its own content with ResizeObserver and the main process calls setBounds, centred. No expanded width or height is hard-coded in the main process: the page grows, the window grows.',
    'docs.settingsHeading': 'Settings window',
    'docs.settingsBody': 'A separate window, left rail, grouped cards, {pages} pages. There is no save button: every switch, select and slider writes to prefs.json immediately and the other windows follow.',
    'docs.extendIntro': 'Every island page is one row in the registry plus a service that owns only data:',
    'docs.extendP': 'Three rules: a service writes only its own file; a pushed payload has exactly the shape bootstrap returns (a mismatch is the classic “push succeeds but the page stays empty”); and an empty page offers one sentence plus one action, not an empty box.',

    'footer.license': 'EmojiTot Noncommercial License · drawn by @emojitot/core',
  },
} as const;

export type MessageKey = keyof (typeof MESSAGES)['zh'];

let lang: Lang = 'zh';
const listeners = new Set<() => void>();

try {
  const saved = localStorage.getItem('es.lang') as Lang | null;
  if (saved === 'zh' || saved === 'en') lang = saved;
} catch {
  /* private mode */
}

export const getLang = (): Lang => lang;

/**
 * Look up a message, with `{name}` placeholders filled in.
 *
 * Counts come from the engine, so a sentence like "{n} / {total} characters"
 * must not be glued together at the call site — that is how a translated
 * string ends up with the English word order in the Chinese page.
 */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const raw = MESSAGES[lang][key] ?? MESSAGES.zh[key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole,
  );
}

export function setLang(next: Lang): void {
  lang = next;
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  try {
    localStorage.setItem('es.lang', next);
  } catch {
    /* private mode */
  }
  for (const fn of listeners) fn();
}

export function onLangChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

setLang(lang);
