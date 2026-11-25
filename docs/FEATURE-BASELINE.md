# EmojiTot 功能基准

> **这是什么**：每个用户可见功能必须怎么表现、现在走到哪一步、凭什么相信它是对的。改功能前先查这里，验收时按这里的合同逐条对。
> **配套**：全站地图在 [baseline/README.md](baseline/README.md)；每条功能的完整合同与逐行证据在 `baseline/0X-*.md` 的 §6（共 171 条工程合同）。
> **核对基准**：HEAD `bb435d1`（tag `v0.8.20.26`），2026-11-25 18:05（Asia/Hong_Kong）。本文件只写事实，不写愿望。

## 1. 用法与状态口径

- 要改一个功能：先在本文件找到它 → 读「合同要点」→ 看状态。状态不是**已确认**时，改完必须补证据才能升级。
- 要验收一次改动：按合同逐条对，证据只认三种 —— 自动化测试输出、`pnpm ui:audit` 的 JSON、`design-qa.md` / `docs/RELEASE-NOTES.md` 里可查的验收记录。「看起来对」不算。
- 要新增功能：先在 §3 加一行（ID 用模块前缀：RUNTIME / ISLAND / SET / SURF / ENG / WEB），再在对应 `baseline` 文件的 §6 写完整合同。
- 要删功能：状态改**已废弃**并在 §4 登记，不要直接删行 —— 删掉的行会让人以为它从没存在过。

| 状态 | 含义 | 证据要求 |
| --- | --- | --- |
| 已确认 | 代码可达，且行为被测试或验收记录固定 | 给出测试文件或验收记录 |
| 开发中 | 链路只通一半，用户拿不到完整效果 | 指出缺口位置 |
| 待验证 | 代码可达，但没人证明它现在是对的 | 明确写「未验证」 |
| 实验性 | 只有环境变量 / 开发钩子能进 | 指出开关名 |
| 已废弃 | 用户路径不可达，或已被新实现替代 | 指出替代者 |

## 2. 总览

统计口径：6 个模块 §6 的功能合同行。

| 模块 | 合同数 | 已确认 | 开发中 | 待验证 | 实验性 | 已废弃 |
| --- | --- | --- | --- | --- | --- | --- |
| 运行时与窗口 [01](baseline/01-runtime.md) | 30 | 22 | 1 | 7 | 0 | 0 |
| 灵动岛 [02](baseline/02-island.md) | 27 | 21 | 1 | 5 | 0 | 0 |
| 设置中心 [03](baseline/03-settings.md) | 21 | 12 | 0 | 5 | 0 | 4 |
| 引擎与协议 [04](baseline/04-engine.md) | 33 | 22 | 0 | 11 | 0 | 0 |
| 球 / 托盘 / 引导 / 更新卡 [05](baseline/05-ball-tray-onboarding.md) | 24 | 7 | 1 | 15 | 1 | 0 |
| 站点与发布链 [06](baseline/06-web-release.md) | 36 | 24 | 0 | 12 | 0 | 0 |
| **合计** | **171** | **108（63%）** | **3** | **55（32%）** | **1** | **4** |

读法：63% 已确认不等于「产品完成度 63%」。**待验证**集中在「代码写得出来、但没人试过」的部分（球的时序、托盘交互、引导链路、站点复制反馈、引擎的 5 种 finish）；**已废弃**全在设置中心，是整块功能失去入口，不是零星死代码。

## 3. 用户功能矩阵

### 3.1 桌面球

| 功能 | 状态 | 合同要点 | 详见 |
| --- | --- | --- | --- |
| 球窗口常驻、三态形态 | 已确认 | 任何 `displayMode` 都先建窗口；island 只 hide，ball/both 用 showInactive；切形态不重建 | SURF-01、RUNTIME-03 |
| 球尺寸与留白 | 待验证 | 窗口 = 球 + 208（16 动画边距 + 88 气泡空间 × 2 边）；五档 64/88/120/160/220；球 clamp 48–240 | SURF-02 |
| 位置恢复与落点 | 待验证 | 启动用 `prefs.position`，否则主屏右下距边 8；未贴边才写回 | SURF-03 |
| 点击穿透 | 已确认 | 光标到球心 ≤ dim/2 才接收输入；拖拽期间一律不穿透 | SURF-04 |
| 拖拽与「戳一下」 | 待验证 | 超过 4px 才算拖拽；主进程 16ms 跟手且宽高固定；小于 4px 释放 → 随机 bounce/spin/burst | SURF-05 |
| 拖到边缘停靠 | 已确认 | 距工作区边 ≤ 8px 停靠左/右；否则清贴边态；`ui-check.mjs` 有端到端记录 | SURF-06 |
| 半隐与悬停展开 | 已确认 | 停靠只留 0.5×dim 在屏内；必须先离开过一次才允许再次展开 | SURF-07 |
| 气泡 | 待验证 | 只在贴边时出现；文本 = KAOMOJI，无映射则隐藏；3400ms 自动隐藏；aria-live=polite | SURF-08 |
| 减少动态 | 待验证 | `reduceMotion` 或 `motion=false` 时加 paused，呼吸/跳动停止但换脸照常 | SURF-10 |
| 角色切换同步 | 待验证 | `cast:changed` 同时更新球、托盘图标、tooltip，并重播招牌表情 | SURF-11 |

### 3.2 灵动岛

| 功能 | 状态 | 合同要点 | 详见 |
| --- | --- | --- | --- |
| 窗口几何与尺寸上报 | 已确认 | 窗口 = 页面实测 box + 左右 32 / 上下 36；box 夹 120–720 × 28–640；水平居中、贴工作区顶 | ISLAND-01/02 |
| 点击穿透（自适应轮询） | 已确认 | 指针距画面 ≤180px → 25ms、≤700px → 120ms、更远 → 250ms；命中用画出来的矩形；收起时一律穿透 | ISLAND-04/05 |
| 展开与收起 | 已确认 | 只认落在画面上的左键；Esc 与失焦受 `blurCollapse` 控制；没有「点外部收起」处理器 | ISLAND-08/09 |
| 悬停展开 / 自动收起 | 待验证 | 进入后 `hoverOpenDelay`（默认 100ms，上限 800）展开；`hoverAutoHide` 时 `hoverCloseDelay`（默认 120ms）收起 | ISLAND-06/07 |
| 翻页（按钮 / 键盘 / 滚轮） | 已确认 | 首尾不循环；←/→ 翻页；滚轮只看 deltaY 且 ≥8px，**无节流锁**（§4-9） | ISLAND-10..13 |
| 媒体页 | 已确认 | 封面 + 三行歌词 + 进度轨（可 seek ±5s）+ 传输键；有 duration 才可 seek，提交后 900ms 抑制回写 | ISLAND-20/21/23 |
| 天气页 | 已确认 | 当前温度 + 五日预报；失败保留上次读数；城市菜单写 city 并关自动定位 | ISLAND-13、SET-13 |
| AI 工作台页 | 已确认 | 余额/账号切换/Agent 三行；「查不到」与「0」分开画 | ISLAND-16、RUNTIME-20 |
| 邮箱页 | 待验证 | 4 行上限；未读数取账号答复；「全部已读」按账号范围批量写；失败不乐观更新 | ISLAND-26 |
| 专注页 | 已确认 | 96px 环 + 计时 + 三键 + 本轮/本日 | ISLAND 页面表、services.test |
| 待办页 | 待验证 | 清单/添加/优先级/重复/完成态 | 页面表（无断言） |
| 健康页 | 待验证 | 喝水/久坐两行 + 9 天柱图 | 页面表（无断言） |
| 置物架页 | 待验证 | 拖入文件、搜索、分组折叠、剪贴板块 | 页面表（无断言） |
| 设备页 | 已确认 | 5 行设备/电量条/置顶★/刷新/系统蓝牙；名字是唯一身份 | ISLAND 页面表、devices-settings.test |
| 日程页 | 待验证 | 7×5 月历 + 当日行 + 内联编辑（保存/删除） | 页面表（无断言） |
| 消息页 | 已确认 | 五个消息应用 4 行会话切换 | ISLAND 页面表、island-ui.test |
| 状态组件（电量/时间/温度/余额/颜文字） | 已确认 | 按 `statusItems` 顺序；无读数不画占位；超宽只切整组件并补省略号；颜文字要有真实读数才出现 | ISLAND-15/16 |
| 胶囊三态 | 已确认 | 播放 → 歌词 + 歌名；无播放但有读数 → 状态行；都没有 → 只有脸；文字槽固定不随歌词伸缩 | ISLAND-17 |
| 暂停交还 + 恢复按钮 | 已确认 | 只有「播放→暂停」触发；恢复按钮空闲 `music.pausedHideMin`（0=永不）；悬停/聚焦重新计时 | ISLAND-18/19 |
| 歌词同步 | 已确认 | 位置 = 采样 + Δt×rate（夹 0.25–4）；二分查行；offset 默认 0.35s；暂停不排下一句 | ISLAND-20 |
| 直播识别 | 已确认 | 以 provider 元数据/标题为证据，不把「没有时长」当直播；无起点显示「直播中」，有则 HH:MM:SS | ISLAND-21 |
| 通知插页 | **开发中** | 设计为 3.5s 临时插页并恢复滚动位置；**当前无 IPC/preload 通道**，只有 `capture-ui.mjs` 调试钩子能触发 | ISLAND-24、§4-5 |
| 自动避让横条 | 已确认 | 避让且未展开时收成 6px 高、宽 max(48, 岛宽/3) 的 slit；展开优先；收起期不上报 box | ISLAND-25 |

### 3.3 设置中心

| 功能 | 状态 | 合同要点 | 详见 |
| --- | --- | --- | --- |
| 窗口几何 | 已确认 | 1080×760 固定，`resizable:false`、`maximizable:false`；三列 212 / 1fr / 276 | SET-17 |
| 打开定位 / 单例 / 关窗不退出 | 待验证 | 已开则 show+focus+goto；关窗只关窗，退出只走托盘或 `app:quit` | SET-01/02 |
| 即时写盘、无保存按钮 | 已确认 | 控件 → `settings:patch` → `writePrefs` → 回包整体重绘 + 广播 | SET-03 |
| 未知键与非法值丢弃 | 已确认 | `filterPatch` 只接受 schema 拥有的键；skin 只允许三值 | SET-04 |
| 改动跨窗口同步 | 待验证 | `settings:changed` 推给设置/岛/球 | SET-05 |
| 页面开关 → 服务启停 | 已确认 | 服务集 = 已开页面 + 状态组件所需，再被 `focus/health/todo/shelf` 等开关扣减 | SET-07 |
| 页面排序（拖拽 + 键盘） | 已确认 | dragend 读 DOM 顺序写 pageOrder；↑↓ 写完焦点回原位 | SET-08 |
| 设备页活数据 / 显隐 / 顺序 | 已确认 | 进页才起探针；显隐与顺序只发名字走窄通道，不整组覆盖 | SET-09/10 |
| 角色切换 | 已确认 | 15 张卡经 `settings:action`，未知 id 归一 `tot` | SET-11 |
| 主题 / 皮肤 | 已确认 | `theme`、`skin` 即时生效；`data-theme` 与 `data-skin` 驱动 | SET-06 |
| 圆角 / 界面缩放 | 待验证 | `radius` 12–30、`uiScale` 80–140；只由 HTML 属性限值，无二次钳制 | SET-06 |
| 敏感值只在主进程 | 已确认 | 渲染进程没有任何 secrets 通道；`v1:` / `plain:` 前缀语义不可改 | SET-15 |
| 「恢复界面」 | 待验证 | 一次写回 25 个键；不动 pages/statusItems/pageOrder/账号 | SET-12 |
| 自定义下拉键盘 | 待验证 | ↑↓/Home/End/Enter/Space/Esc/Tab + popover 顶层不被裁 | SET-14 |
| 界面语言切换 | **已废弃** | `prefs.lang` 与词典都在，但**没有任何控件写它** | SET-18 |
| 四套快速方案 | **已废弃** | `PRESET_MANIFEST` 与 `presetPatch` 都在，点击分支存在，**无渲染点** | SET-19 |
| 胶囊状态组件开关 / 排序 | **已废弃** | `residencyCard()` 定义后从未被调用；测试只断言源码字符串存在 | SET-20 |
| 自动避让应用清单 | **已废弃** | 选择器与窄通道都在，**无渲染点**输出 `avoid-add` | SET-21 |
| 60 处示意控件 | **开发中** | `aria-hidden` + `data-decorative` + title=「示意控件」，明确不写盘；覆盖 10 个页面 | 03 §3.2、§4-2 |
| 81 条偏好里 43 条无入口 | **开发中** | 含 `islandWidth` / `pillHeight` / `islandTopGap` / `statusItems` / `defaultPage` / `avoidEnabled` 等；岛宽等用户改不动 | 03 §8-2、§4-3 |

### 3.4 托盘 / 首次引导 / 更新卡

| 功能 | 状态 | 合同要点 | 详见 |
| --- | --- | --- | --- |
| 托盘面板定位 | 已确认 | 图标中心对齐并夹紧工作区；优先有余量一侧；无锚点落右下 12px；7 个用例 | SURF-13 |
| 托盘面板开关 / 内容 / 键盘 | 待验证 | 左/右键都 toggle；刚关 250ms 内点击算关；blur 200ms 宽限；↑↓ 环绕、Enter、Esc | SURF-12/14/15 |
| 托盘图标与置顶 | 待验证 | 图标用当前角色 SVG，失败回落资源 PNG；置顶写 `pinned` 并换层 | RUNTIME-21 |
| 全局快捷键 | 待验证 | `Alt+Shift+T` 切岛显隐；`hotkey=false` 不注册 | RUNTIME-22 |
| 首次引导 | 待验证 | `onboardingDone!==true` 才开；跳过只写 done，完成才写形态/皮肤（白名单） | SURF-17/18/19 |
| 更新检查 | 已确认 | GitHub latest，正式版且版本更高才通知；8s 超时、6h 周期、忽略 draft/prerelease | RUNTIME-24、SURF-20 |
| 更新卡出现与去重 | 已确认 | payload 只留 version + ≤2 条 notes；每次运行只弹一次；24h 内不弹；URL 是常量 | SURF-20 |
| 更新卡「稍后」 | 待验证 | 应写 `snoozeUntil = now + 24h` 并关窗 | SURF-21 |
| 更新卡三个出口 | **开发中（P0）** | 「稍后」「打开下载页」「Esc」全部被 IPC 守卫以 frame 理由拒绝，无任何副作用 | SURF-22、§4-1 |
| 测试注入 | 实验性 | `EMOJITOT_UPDATE_TEST` 注入固定 0.6.6 卡片；因上一条只能验证「卡片出现」 | SURF-24 |

### 3.5 Web 站点

| 功能 | 状态 | 合同要点 | 详见 |
| --- | --- | --- | --- |
| 四视图 hash 路由 | 已确认 | console/gallery/scene/docs；未知路由落 console；只认 `?state=` | WEB-01 |
| 视图先销毁再新建 | 已确认 | 旧视图 dispose 后替换；20 次切换后活跃 interval = 0 | WEB-02 |
| 语言 / 明暗 | 已确认 | 写 localStorage + html lang + 重渲染；默认 dark，显式 '0' 才 light | WEB-03/04 |
| 控制台（代码卡 / 尺寸 / 抽屉） | 待验证 | 代码卡与舞台同源；换表情不重建运行时；抽屉写同一 `look` | WEB-06/07/09/11 |
| 表情馆 | 已确认 | 双 tab、4 过滤、计数、灯箱 ←→/Esc 焦点归还 | WEB-12/13 |
| 场景 | 已确认 | 九会话单脸仲裁；历史 ≤5；reset 后 owner 变 — 但历史保留 | WEB-14 |
| 文档页 | 已确认 | 九节 + TOC 高亮 + 3 个实时骨架 + 375px | WEB-16/19 |
| 文档协议表交互 | 待验证 | 三组 details、hover 预览缓存、点击复制、1200ms 回原值 | WEB-18 |
| CSP / 零网络 | 待验证 | `default-src 'self'`；无 fetch/XHR/WebSocket；**无断言** | WEB-21/28 |

### 3.6 引擎与协议

| 功能 | 状态 | 合同要点 | 详见 |
| --- | --- | --- | --- |
| 渲染是纯函数 | 已确认 | 同入参两次输出逐字节相同；不读时钟、不碰 DOM | ENG-01 |
| 角色词汇 | 已确认 | 15 身体 / 12 配色 / 26 特征 + none / 61 表情 / 15 人阵容（一人最多一特征） | ENG-04/07/09/11 |
| 叠放顺序 | 待验证 | 表面在脸下、表头特征在脸上；**没有断言**，写反测试不会红 | ENG-02 |
| 墨色规则 | 待验证 | 亮度小于 0.55 用白墨，否则 #1F1F1F；无断言 | ENG-03 |
| 7 种 finish | 待验证 | 只有 sticker（桌面默认）与 flat 进过界面；其余 5 种无 UI、无测试 | ENG-13 |
| 运行时挂载 | 已确认 | innerHTML 渲染后替换 live-face + 信号层 + 粒子层；挂载失败抛错 | ENG-16 |
| 销毁契约 | 待验证 | 取消 RAF、移除 3 个监听、清粒子、删 dataset、清空 root | ENG-17 |
| 16 顶点眼型 | 已确认 | 10 种拓扑顶点数恒为 16，可同编号插值；长度不一致抛错 | ENG-18 |
| 弹簧边界 | 已确认 | dt 夹 0.5s，子步 ≤1/120s；非有限值吸附 target | ENG-19 |
| 两位 id 与段回退 | 已确认 | 只接受 0–99；未知 id 按十年段落回退；60–99 无段 → idle | ENG-21/22 |
| 事件 vs 条件 | 已确认 | 10 个 oneshot id 是事件，其余是条件 | ENG-23 |
| 仲裁 | 已确认 | 39 项优先级；停留 900ms；更紧急立即打断；headless 不上屏；TTL 120s | ENG-24..28 |
| 事件桥 | 已确认（无生产宿主） | initial '`02`'；读不懂发 error 且不改屏幕；dispose 清三类监听 | ENG-29/30 |
| 信号层 / 一次性动作 / 眼型轮转 | 待验证 | 五种信号、spin/bounce/burst、按 eyeHold 轮转；全部无断言 | ENG-31/32/33 |

### 3.7 运行时、数据与发布

| 功能 | 状态 | 合同要点 | 详见 |
| --- | --- | --- | --- |
| 单实例 / 启动次序 / 三态 | 已确认 | 抢锁失败即退出；二次启动按 prefs 恢复形态；启动顺序固定 | RUNTIME-01/02/03 |
| IPC 守门 | 已确认 | 角色 → frame → 字节（默认 64KB，shelf 8MB）→ 形状；拒绝返回 null | RUNTIME-16 |
| 单一「脸」所有权 | 已确认 | 只有主进程 `faceBus` 决定表情并广播；渲染层不得上报 | RUNTIME-17、SURF-09 |
| 情绪优先级与停留 | 已确认 | manual > agent > media > idle；上台至少 2000ms；同脸换源不重置 | RUNTIME-18 |
| Agent 联动 | 已确认 | 每秒 stat 三个状态文件；只有 running 进仲裁；过期只当回执 | RUNTIME-20 |
| 服务计划 | 已确认 | 页面/状态组件决定服务集；已启用的不重启；不支持的平台跳过 | RUNTIME-12 |
| 全屏隐藏 / 自动避让 | 待验证 | 连续两样本确认全屏才藏；避让由常驻脚本判定 | RUNTIME-13/14 |
| 退出清理 | 待验证 | before-quit 停表、注销快捷键、killWatchers、逐服务 stop、unwatch state | RUNTIME-27 |
| 存储原子写 | 已确认 | 临时文件 + fsync + rename；失败保留旧文件 | RUNTIME-28 |
| 安全加固 | 已确认 | 禁 GPU 加速/窗口/跨源导航/webview；六窗沙箱三件套 | RUNTIME-29 |
| 四段版本号与产物 | 已确认 | 三段 + 构建位；Setup/Portable 命名固定；便携靠追加启动器 | WEB-23/24 |
| 签名策略 | 已确认（产物签名未验证） | 无证书跳过并 warn；只对本地证书补签 | WEB-25 |
| 隐私扫描 / 文档闸门 | 已确认 | `pnpm scan` FAIL 阻断；docs/settings 闸门 | WEB-27/34/35 |
| 版本纪律闸门 | 待验证 | 当前版本必须严格大于最近 tag，且 notes 条目数达标；**当前按设计必失败**（§4-8） | WEB-26 |

## 4. 失效与不可达登记

| # | 级别 | 现象 | 根因（证据） | 用户影响 | 修法 | 回归缺口 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **P0** | 更新卡「稍后」「打开下载页」「Esc」全部无反应 | `src/main/ipc-frame.js:1-6` 的 FRAME 没有 `update`；`frameMatches('update',…)` 恒 false，`ipc-guard.js:77-81` 以 frame 理由拒绝三个通道 | 卡片只能 Alt+F4，且 `snoozeUntil` 永不写入（下次启动仍可能弹） | 仿 `onboarding.js:36` 在 update 模块补 FRAME.update 正则；补 ipc-frame 用例 | `test/ipc-frame.test.mjs` 只覆盖 island / tray |
| 2 | P1 | 设置中心 10 个页面、60 处控件是示意，不写盘 | `settings.js:287-302` 的 visual* 家族，显式 aria-hidden + data-decorative | 页面看起来可配，实际点了没反应 | 逐页接线，或页首标明「即将支持」 | 无测试区分「占位」与「真控件」 |
| 3 | P1 | 81 条偏好里 43 条没有入口（含岛宽 / 胶囊高 / 顶部间距 / 状态组件排序 / 默认页 / 避让开关） | 设置页只有装饰字段；`settings.js:549` 兜底 12 与 DEFAULTS 的 8 不一致 | 用户改不动岛宽等核心外观 | 优先补 layout 页三滑块 + 页面管理里的状态组件行 | settings-audit 只查「谁读」，不查「谁写」 |
| 4 | P1 | 四个整块功能失去入口：界面语言、四套方案、状态组件开关/排序、避让应用清单 | `settings.js` 中 residencyCard / preset 分支 / avoid 选择器都没有渲染点；测试只断言源码字符串 | 已宣称的能力拿不到 | 补渲染点；把「源码字符串」测试换成渲染级测试 | `status-order.test.mjs:131-146` 一类的假保护 |
| 5 | P1 | 岛通知插页不出现 | `island.js:4592` 调 `api.onNotification?.()`，preload 无此方法，全仓无 `island:notify` 发送方 | 通知只在系统托盘弹出，不在岛上 | 补通道并接 notify.js，或删掉这段死码 | 无 |
| 6 | P1 | 设备无法置顶 | 设备行写了 `data-pin` 属性（`settings.js:1306`），但全仓没有读取它的事件；device-pin 处理器无入口 | 「置顶设备」做不到 | 接事件或删属性与处理器 | `devices-settings.test.mjs` 只断言 `api.pinDevice?.` 字符串存在 |
| 7 | P1 | 文档闸门红：sync-docs --check 5 处、docs-consistency 4 处 | 发版 `v0.8.20.26` 已打 tag，但 README 下载链接仍指 .18、RELEASE-NOTES 最新 .18、settingsPages 仍写 15（实际 16） | `pnpm check` 不能通过；README 下载旧版 | 补 .26 的 release notes → `pnpm docs:sync` → 复跑 docs:check | —— |
| 8 | P1 | `pnpm version:check` 必失败 | 最近 tag 与 build-info.buildVersion 都是 `0.8.20.26`，脚本要求当前版本严格大于 tag | 发版流程中会误判 | 按流程先 bump 再 check | 无单测 |
| 9 | P2 | 一次滚轮手势可能连翻多页 | `island.js:4198-4203` 只判 deltaY 绝对值 ≥ 8，无冷却 | 触控板惯性体验差 | 加 200ms 冷却/锁，一次手势最多一页 | 无真机测试 |
| 10 | P2 | 从托盘改「置顶」，设置窗可能显示旧值 | 托盘走 `savePrefs()` 直写（`main.js:1176-1181`），不发 `settings:changed` | 两个入口状态不一致 | 改走 applyPatch | 无 |
| 11 | P2 | 设置·设备页在无数据时显示 4 台虚构设备 | `settings.js:1275-1283` 的占位数据 | 用户以为真机设备叫这些名字 | 换成空态「还没有检测到设备 → 重新探测」 | 无 |
| 12 | P2 | 引导取初值失败后点「完成」会把形态/皮肤写回默认 | `onboarding.js:31` 初值 island+frost，只有 get 成功才覆盖 | 极端条件下覆盖用户设置 | get 失败时禁用「完成」或提交前重读 | 无 |

> 第 7、8 条不是代码缺陷，是「事实与记录不一致」；它们让闸门失去信号价值，优先级按 P1 处理。

## 5. 跨模块不可协商的合同

改任何一条都算破坏基线，必须单独说明并取得确认。

1. **表情只在主进程产生**：渲染层只消费 `face:apply`，不得上报表情、不得自跑心情时钟。
2. **IPC 必须过守卫**：角色 → frame → 字节 → 形状；拒绝返回 null 而不是抛。不得新增裸 `ipcMain.handle`。
3. **岛尺寸只有一个来源**：页面 ResizeObserver → 主进程 setBounds；morph 期间不得上报中间盒。
4. **命中区 = 画出来的矩形**：窗口的 32/36 留白必须穿透，收成 slit 时同样穿透。
5. **偏好只有一个 schema**：新键必须同时进 DEFAULTS 与 CONSUMERS；写入一律经 filterPatch。
6. **敏感值只在主进程**：只经 `secrets.js`；`v1:` / `plain:` 前缀语义不可改；日志与 prefs 不得出现明文。
7. **站点零外部请求**：CSP `default-src 'self'`；加任何 CDN 都要同时改 CSP、README 与 PRIVACY。
8. **站点 localStorage 键名是数据 ABI**：`es.look.v3` / `es.lang` / `es.mono` / `es.stage.size` / `es.motion.paused`。
9. **协议只加不改**：两位 id 段边界（0-9 / 10-29 / 30-49 / 50-59）与回退表固定；已发出的编号永不重排。
10. **引擎几何契约**：叠放顺序、墨色阈值 0.55、16 顶点眼型、一人最多一特征。
11. **六窗沙箱三件套**：sandbox / contextIsolation / nodeIntegration:false，每窗独立 preload。
12. **发布纪律**：四段版本号、`pnpm check` 全绿、`pnpm scan` FAIL 清零、真机装验；README 每版保留「不授予服务商标使用权，也不代表官方合作或认证」。

## 6. 验收怎么跑

**本轮已跑（2026-11-25 18:05，HEAD `bb435d1`）**

| 命令 | 结果 |
| --- | --- |
| `cd apps/desktop && node --test` | ✅ 565 passed / 149 suites / 0 failed |
| `cd packages/protocol && npx vitest run` | ✅ 34 passed |
| `cd packages/core && npx vitest run` | ✅ 27 passed |
| `node scripts/settings-audit.mjs --check` | ✅ 81 个偏好路径一致 |
| `node scripts/sync-docs.mjs --check` | ❌ 5 处过期（§4-7） |
| `node scripts/docs-consistency.mjs` | ❌ 4 处（README 下载链接） |

**本轮未跑，不要当成通过**

| 命令 | 覆盖什么 | 为什么需要它 |
| --- | --- | --- |
| `pnpm ui:audit` | 11 岛页 × 皮肤 + 16 设置页的文字边界、越界、几何稳定性 | 本基线里所有「视觉/布局」结论的复核入口 |
| `pnpm smoke:desktop` | 真窗口：沙箱、尺寸、二次启动、设置窗几何 | 跑 node --test 不会开窗口 |
| `pnpm check:gallery` | 真 Chrome 走查四页、焦点、375px、interval 清理 | 站点全部验收压在这里 |
| `pnpm preview` | Node 里渲染全部协议 id 与表情 | 静态渲染回归 |
| `pnpm audit:ci` / `pnpm scan` | 依赖漏洞 / 隐私扫描 | 发版前必跑 |

## 7. 维护规则

1. **状态只能靠证据升级**。要写「已确认」，必须能指出测试文件或验收记录；否则保持「待验证」。
2. **新增功能先加 ID**，再写合同；合同必须能写成「判定条件 / 时序 / 文案 / 数据副作用」中的至少两条。
3. **删除功能标「已废弃」**，保留行并在 §4 登记原因与替代者。
4. **每次发版更新 §2 统计与 §4 登记**；§4 修好的条目写明证据后可移到「已修复」区或删除并在提交说明里留痕。
5. **本文件里的数字是手写的**：代码计数变化时同步改 §2 与 §3 的行数；`docs:check` 不保护这份文件。
6. **本文件只写当前事实**：不要把「计划」「待排期」写成合同；计划放 `docs/UI-DESIGN-BACKLOG.md` 或 issue。
