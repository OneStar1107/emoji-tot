# Electron 主进程与运行时

> 一个主进程如何把「球 / 岛 / 设置 / 托盘面板 / 更新卡 / 首启引导」六个 BrowserWindow、12 个后台服务、62 个守门 IPC 通道拼成一只桌宠：谁创建谁、谁守谁、写哪个文件、退出时清什么。实现根目录 `apps/desktop/src/`，入口 `apps/desktop/src/main.js`（2477 行）。
>
> **写作基准**：HEAD `bb435d1`、tag `v0.8.20.26`（与 `docs/baseline/README.md:5` 同一基准；本文件自带 `git rev-parse` 校验，`apps/desktop/package.json:4` 写的是 0.8.20）。

## 1. 范围与边界

**本文件覆盖**：主进程入口与启动次序（`apps/desktop/src/main.js`）、六个窗口的创建与生命周期、preload 暴露面（`src/preload*.js`）、IPC 守卫（`src/main/ipc-guard.js` / `ipc-shape.js` / `ipc-frame.js`）、单实例 / 托盘 / 全局快捷键 / 开机启动 / 全屏隐藏 / 自动避让 / 窗口状态、`src/main/services/*` 清单与其数据文件、`%APPDATA%\EmojiTot` 存储与密钥边界（`src/main/paths.js`、`secrets.js`）、更新检查与更新卡、首次引导、face-bus 与 agent 联动、退出清理。

**不覆盖（见对应文件）**：

| 主题 | 去哪里看 |
| --- | --- |
| 岛窗口内部的 11 页与收起胶囊 | 同目录 `02-island.md`、`docs/ISLAND.md` |
| 设置窗口的左栏 16 页与每个控件 | 同目录 `03-settings.md`、`docs/SETTINGS.md` |
| 桌面球 / 托盘面板 / 引导的界面与交互 | 同目录 `05-ball-tray-onboarding.md` |
| 协议解析与仲裁、角色渲染与运动运行时 | 同目录 `04-engine.md`、`docs/PROTOCOL.md`、`docs/ARCHITECTURE.md` |
| 数据保留多久、怎么删的政策表述 | `docs/PRIVACY.md`（本文件 §4 只写实现位置） |
| 加固清单与依赖审计 | `docs/SECURITY.md` |
| 设置项逐条审计（谁读、是否即时生效） | `docs/SETTINGS-AUDIT.md`、`src/shared/schema.js CONSUMERS`（`schema.js:797`） |
| 打包、签名、发版、安装目录清理 | `docs/RELEASING.md`、`docs/SIGNING.md`、`AGENTS.md` |

**判定口径（怎么读本文的状态词）**：

- **已确认** = 当前代码可达，且行为被自动化测试断言（本文件会给 `test:` 文件）或有可查验收记录（`docs/UI-AUDIT.md` / `docs/baseline/README.md` 认可的记录）。
- **开发中** = 代码路径存在但用户拿不到完整效果（有窗口没动作、有数据没链路）。
- **待验证** = 代码可达，但既无测试断言，也无验收记录；不是「坏」，是「没人证明它现在是对的」。
- **实验性** = 只在环境变量、开发参数或明确标注实验的开关后可用的。本模块当前没有此类条目（`EMOJITOT_UPDATE_TEST` 是验证入口，不是用户功能）。
- **已废弃** = 用户路径不可达，或已被新实现取代但仍留在代码里（本文件只对 `§8.3` 的废分支使用）。

约定：只写**当前代码事实**；每条判断给仓库相对路径 + 行号 / 常量名；没有直接证据的写「推断：」或「未验证」。

**忽略的生成物**：`node_modules`、`dist`、`out`、`release`、`apps/desktop/.ui-capture`、`src/renderer/vendor/`、`src/vendor/`。它们只作为「构建产物存在」记录：`apps/desktop/package.json:36-38` 只把 `src/main/services/*.ps1` 解包到 `app.asar.unpacked`（原因见 `src/main/paths.js:17-30`），`scripts/copy-vendor.mjs` 负责把 core/protocol 拷进 vendor。

## 2. 模块与文件清单

| 模块 | 职责 | 实现位置 | 触发 / 生命周期 |
| --- | --- | --- | --- |
| 主进程入口 | 装配六个窗口、12 个后台服务、全部 IPC；单实例与退出清理 | `src/main.js:1` | `app.whenReady()` 一次（`main.js:2312`） |
| 球窗口 | 无框透明置顶圆球：拖拽、贴边、点击穿透、Agent 表情 | `main.js:435 createWindow()`，窗口在 `main.js:444` | 启动即建，`closed` 后置 null（`main.js:564-568`） |
| 岛窗口 | 顶部居中胶囊，尺寸由页面上报 | `src/main/island.js:323 create()`，窗口在 `island.js:333` | `applyForm()` → `island.show()` 首次懒建（`main.js:1138`、`island.js:402`） |
| 设置窗口 | 1080×760 固定阅读面，单例 | `src/main/settings.js:102 create()`，窗口在 `settings.js:109` | 托盘 / 岛 / 引导按需；已开则 `show+focus+goto`（`settings.js:103-108`） |
| 托盘图标 | 托盘身份（当前角色 SVG → nativeImage） | `main.js:1476 createTray()`、`main.js:328 trayImageForCast()` | 启动建；`trayIcon` 关闭时销毁（`main.js:1322-1331`） |
| 托盘面板 | 自绘菜单窗口：头部 + 三行（设置 / 置顶 / 退出） | `src/main/tray-panel.js:90 ensureWindow()`，尺寸 `tray-panel.js:18-22` | 首次点击托盘时建，之后复用 |
| 托盘定位（纯函数） | 图标矩形 → 面板左上角 | `src/main/tray-menu.js:43 placePanel()` | 每次 `show()` |
| 更新卡 | 320×200 卡片：版本号 + 最多两条更新点 + 两个按钮 | `src/main/update-prompt.js:84 create()`，尺寸 `update-prompt.js:28` | `notifyAvailable()` 首次（`update-prompt.js:133`） |
| 更新检查 | GitHub latest release 轮询与版本比较 | `src/main/update-check.js:88 checkNow()` | 启动一次 + 每 6h（`update-check.js:11,136`） |
| 首启引导 | 780×630 两页：欢迎 + 形态 / 皮肤，可跳过 | `src/main/onboarding.js:91 create()`，尺寸 `onboarding.js:41-42` | 启动末尾 `maybeShow()`（`main.js:2432`），`onboardingDone` 拦截 |
| IPC 守门 | 发送者角色 + frame + 字节数 + 形状四查；`safeSend` | `src/main/ipc-guard.js:69`（Handle）、`:122`（Send）、`:170`（safeSend） | 各模块注册通道时包装 |
| IPC 形状库（纯函数） | 字节估算、字段 / 枚举 / 集合校验 | `src/main/ipc-shape.js:23 byteSize`、`:60 actionPayload`、`:89 checkLocal` | 被守门与单测直接使用 |
| IPC 归属表 | role → 页面 URL 正则 | `src/main/ipc-frame.js:1-11`（ball/island/settings/tray）；`onboarding.js:36` 追加 `onboarding` | 模块加载期 |
| 面总线 | 全局唯一「现在这张脸」+ 广播 + 重发 | `src/main/face-bus.js:23 createFaceBus()` | 启动创建（`main.js:1665`） |
| 情绪闸门 | manual > agent > media > idle，最短停留 2000ms | `src/main/media-emotion.js:72 createEmotionDirector()`；实例 `main.js:207-220` | 首次 `emotions()` 惰性创建 |
| 空闲情绪时钟 | 待机时借表情，70% 概率带招牌动作 | `src/main/idle-mood.js`；实例 `main.js:1686-1702` | 启动创建，`before-quit` 停 |
| Agent 分类（纯函数） | 状态文件 + 进程存在 → `active/running/taskCount` | `src/main/agent-status.js:71 classifyAgent()`、`:98 orderActiveAgents()` | 每秒 tick |
| Agent 进程探查 | PowerShell 只回三个布尔，命令行为不出子进程 | `src/main/services/agent-presence.js:12` | 任一 `agent_*` 开关打开时 |
| 窗口状态（纯函数） | 穿透决策 / 拖拽独占 / 显示器 id 比较 | `src/main/window-state.js:9-31` | 60ms 指针轮询与 16ms 拖拽 |
| 路径与原子写 | userData 下全部文件路径、fsync + rename 写 | `src/main/paths.js:12-109` | 每次读写 |
| 密钥封装 | safeStorage 加解密，`v1:` / `plain:` 前缀 | `src/main/secrets.js:11-31` | 存 / 取凭证 |
| 平台能力表 | 功能 → 是否可用；PowerShell 子进程唯一通道 | `src/main/platform.js:28-76`、`:166 spawnPowerShell`、`:155 killWatchers` | 每次服务决策 |
| 登录项 | 开机启动参数（`EMOJITOT_LAUNCHER` 优先） | `src/main/login-item.js:1-7` | `applyPatch` 收到 `launchAtLogin`（`settings.js:178-184`） |
| 构建版本 | 读 `build-info.json`，只有构建位合法才拼 `x.y.z.N` | `src/main/build-version.js:14-21` | 设置 / 引导 / 更新 |
| 角色 id 规范化 | 未知 cast 回落 `tot` | `src/main/cast-state.js:12` | 启动（`main.js:2346`）与 `setCast()`（`main.js:355`） |
| 设置 schema（跨界，主进程动态 import） | DEFAULTS / PAGE_MANIFEST / CONSUMERS | `src/shared/schema.js:183`、`:27`、`:797` | `main.js:301-311 loadSchema()` |
| 服务动作封装 | 服务动作 + 快照合成，失败不伪装成功 | `src/main/data-actions.js:17-62` | `mail:do` / `calendar:do` / `quota:do` |

### 2.1 启动顺序（`main.js:2312-2433`，按执行次序）

1. `app.setName('EmojiTot')`（`main.js:2275`）—— 它决定 `userData` 目录名，必须早于任何 `getPath`。
2. 渲染开关：`disableHardwareAcceleration()` + `--disable-gpu` + `--in-process-gpu`（`main.js:2283-2293`，后者专治 Windows 上 GPU 子进程起不来导致「窗口不出现」）。
3. `requestSingleInstanceLock()`（`main.js:2295`）—— 抢不到锁立即 `app.quit()`（`2296-2298`）。
4. `whenReady()` → `session.setProxy({mode:'direct'})`（`2323`）→ `hardenSession(session.defaultSession)`（`2328`）。
5. `devices.setLocale(app.getSystemLocale())`（`2331`）—— 设备名跟系统区域，不跟界面语言。
6. `loadCore()`（`2334`）：ESM 载入 `renderer/vendor/core/index.js`；失败则 `CORE=null`，托盘图标回落资源 PNG（`290-299`）。
7. `loadSchema()`（`2335`）：ESM 载入 `shared/schema.js` 并注入 `paths.configureSettingsSchema`；失败时 `readPrefs()` 退化为「文件原样」（`301-311`）。
8. 读 `prefs.json` → 只对 `enabledServices()` 命中的 `devices`/`weather` 做预热（`2343-2345`）→ `castId` 规范化并回写（`2346-2349`）→ `displayMode`（`2350`）。
9. `createWindow()`（`2351`）；`did-finish-load` 时补发 `cast:changed` / `settings:changed` / `faceBus.resend()`（`2353-2358`）。
10. 六个窗口的 IPC 注册：`settings` → `island` → `onboarding`（`2360-2362`）→ `updatePrompt`（`2369`）→ 更新检查（`2371`）→ `trayPanel`（`2385`）。注册顺序不影响权限，因为角色在 `loadFile` 之前就 `claim` 了（如 `main.js:532`、`island.js:369`）。
11. `updatePrompt.startTestInjection()`（`2370`，无 `EMOJITOT_UPDATE_TEST` 时是空操作）→ `updateCheck.start({currentVersion: loadBuildVersion(...)})`（`2371-2375`）。
12. `island.onLoaded(...)`（`2377-2384`）：岛页面加载完才补推 battery / weather / prefs / avoid / face —— 早推的帧没有监听者，会丢。
13. `trayPanel.setHooks({state, act})` + `createTray()`（`2386-2387`）。
14. `screen` 的 `display-removed`/`display-added`/`display-metrics-changed` → `handleDisplayChange`（`2388-2390`）。
15. `ensureStateFile()`（`2391`）→ `startPointerWatch()`（`2392`）→ `startAgentWatch()`（`2393`）→ `startServices()`（`2394`）→ `applyForm()`（`2395`）→ `applyMainPrefs()`（`2396`）。
16. 注入钩子：`settings.setWeatherRefresher`/`setActionHook`（`2398-2399`）、`setClosedHook`（`2403-2407`）。
17. `island.startOledShift()`（`2408`）、`island.setBoundsHook(avoidance.setIslandRect)`（`2409`）、把当前 `pillRect()` 立刻交给避让脚本（`2412`）。
18. `settings.onPrefs(...)` 唯一分派（`2414-2429`）→ 最后 `onboarding.maybeShow()`（`2432`，刻意留到最后：引导的「完成」要能立刻移动岛、换皮）。

`startServices()` 内部先注册各服务 `onChange` 监听，再调 `applyServicePlan()`（`main.js:1921-1988`）——「先挂监听、再决定启停」是刻意的：被关掉又打开的服务不会叠出第二份监听。

### 2.2 preload 暴露面（6 个窗口，共 102 个成员）

| preload | 挂到 window | 暴露成员 | 涉及通道 | 说明 |
| --- | --- | --- | --- | --- |
| `src/preload.js` | `petAPI` | 12 | 12 | 球：`dragStart/dragEnd/openMenu/poke`、5 个入向事件、`debugState/debugDock` |
| `src/preload-island.js` | `islandAPI` | 44 | 41 | 岛：自报 box/hit、`bootstrap`、`patchPrefs`、设备、媒体 / 音量、`local:do`、`webUtils` 取拖入文件路径（`preload-island.js:92-99`） |
| `src/preload-settings.js` | `settingsAPI` | 35 | 34 | 设置：prefs 读写、版本、显示器、设备、邮件 / 日历 / 额度、避让列表与图标、窗口按钮 |
| `src/preload-tray.js` | `trayAPI` | 4 | 3 | 面板：`state/act/close` + 订阅 `tray:state` |
| `src/preload-update.js` | `updateAPI` | 4 | 4 | 更新卡：`onShow` + 三个动作（三个动作当前被拒，见 §8.1） |
| `src/preload-onboarding.js` | `onboardingAPI` | 3 | 3 | 引导：`get/finish/onCast` |

所有 preload 只用 `contextBridge` / `ipcRenderer`（岛额外用 `webUtils`），没有 `require` 泄漏到页面；`preload-island.js:7` 的 `webUtils.getPathForFile` 是「Electron 33 移除 `File.path`」后的替代。

### 2.3 IPC 通道分布（渲染 → 主进程，全部经守门）

| 文件 | `guardedHandle` | `guardedSend` | 备注 |
| --- | --- | --- | --- |
| `main.js` | 24 | 5 | `debug:state`/`debug:dock`/`drag:start`/`drag:end`/`pet:menu`/`pet:action`、`mail|calendar|quota:get/do`、`local:get/do`、`island:bootstrap`、设备 8 条、`media:control`、`media:hold-paused`、`volume:get/set/mute` |
| `main/settings.js` | 18 | 0 | prefs 读写、版本、显示器、避让、`settings:action`/`meta`、数据目录、`app:quit`、窗口按钮 |
| `main/island.js` | 5 | 2 | `island:box`/`island:hit`（Send）、`island:prepare-size`/`visible`/`show`/`hide`/`ready` |
| `main/tray-panel.js` | 3 | 0 | `tray:state`/`tray:act`/`tray:close` |
| `main/update-prompt.js` | 3 | 0 | `update:snooze`/`open`/`close` —— 三个都因缺 `FRAME.update` 被拒（§8.1） |
| `main/onboarding.js` | 2 | 0 | `onboarding:get`/`finish` |
| **合计** | **55** | **7** | 62 条通道；出向推送（`face:apply`、`island:*`、`settings:*`、`update:show`、`tray:state`、`cast:changed`、`dock:changed`、`size:changed`、`state:action`、`onboarding:cast`）不设守门，统一走 `guard.safeSend` |

### 2.4 后台服务清单

启动集合由 `SERVICE_PLAN` 定义（`main.js:1782-1819`，共 12 项：battery / weather / media / focus / health / todo / quota / mail / calendar / clipboard / devices / messenger），实际启停由 `enabledServices(prefs)` 决定（`schema.js:573`）。下面 19 行 = 这 12 项 + 由别的模块直接驱动的 7 项（lyrics / agent-presence / avoidance / fullscreen / games / volume / shelf）：

| 服务 | 职责 | 数据文件 | 外部依赖 | 启动条件 |
| --- | --- | --- | --- | --- |
| `battery` | 电量 / 充电态，30s 轮询 | 无 | PowerShell CIM（`battery.js:23`） | 页面或「电量」状态项需要 |
| `weather` | Open-Meteo 天气 + 自动定位 | `cache-weather.json`、`cache-weather-locate.json`（`weather.js:87,91`） | `weather.ps1` 子进程 | 页面或「温度」状态项开 |
| `media` | 系统媒体会话 + 网易云回退 + 封面 | 无（内存） | `media.ps1` 长驻 + `netease-*.ps1` | `pages.music` |
| `lyrics` | 同步歌词（播放器目录 / LRCLIB） | `cache-lyrics-<hash>.json`（`lyrics.js:121`） | `lyrics.ps1` | 由 media 事件驱动（不在 SERVICE_PLAN） |
| `focus` | 番茄钟（以结束时间戳为准） | `cache-focus.json`（`focus.js:26,33`） | 无 | `focus.enabled` 且页面开 |
| `health` | 喝水 / 久坐计数 + 七日桶 | `cache-health.json`（`health.js:49,71`） | 无 | `health.enabled` 且页面开 |
| `todo` | 待办 + 到期提醒 | `cache-todos.json`（`todo.js:35,40`） | 无 | `todo.enabled` 且页面开 |
| `quota` | AI 余额，Key 只走 `secrets.bin` | `secrets.bin`（`quota.js:31`） | `quota.ps1`（Key 走环境变量） | `pages.quota` 或「余额」状态项 |
| `mail` | IMAP 未读摘要 / 验证码 / 邀请 | `mail.json`（`mail.js:25`） | imapflow（Node socket） | `pages.mail` |
| `calendar` | 本地日程 + ICS 导入 + 订阅 | `cache-calendar.json`（URL 加密） | `calendar-fetch.ps1` | `pages.calendar` |
| `clipboard` | 剪贴板历史（默认关） | `clipboard.json`（`clipboard.js:24`） | Electron clipboard | `shelf.clipboard` 且置物架页开 |
| `devices` | 蓝牙 / PnP 设备与电量（含 `device-battery.js` 厂商档） | `cache-devices.json`（`devices.js:48`） | `devices.ps1` / `device-battery.ps1` 长驻 | `pages.devices` 或设置·设备页在看 |
| `messenger` | 五个消息应用未读（只读窗口标题） | 无 | `messenger.ps1` 长驻 | `pages.messenger` |
| `agent-presence` | 三个 Agent 是否在跑（只回布尔） | 无 | `agent-presence.ps1` 长驻 | 任一 `agent_*` 开 |
| `avoidance` | 自动避让：被列表应用盖住就收起 | `avoidance.json`（`avoidance.js:34`） | `avoidance.ps1` 长驻 | `avoidEnabled` 且平台支持 |
| `fullscreen` | 全屏时藏岛（两样本确认） | 无 | `fullscreen.ps1` 长驻 | `hideFullscreen` 开 |
| `games` | 前台游戏 → 媒体情绪第三信号 | 无 | `games.ps1` 长驻 | `mediaEmotion` 开 |
| `volume` | 系统主音量（-Watch 长驻，10ms / 次） | 无 | `volume.ps1` | 首次音量通道调用（不在 SERVICE_PLAN） |
| `shelf` | 置物架文件收纳与分组 | `shelf-groups.json`、`shelf/`（`shelf.js:28,61`） | 无（纯文件） | 非后台循环，页面直达 |

## 3. 窗口 / 条目清单

| 条目 | 用途 | 入口 / 触发 | 实现位置 | 状态 |
| --- | --- | --- | --- | --- |
| 球窗口 | 桌面球：拖拽、贴边、穿透、表情 | 启动 `createWindow()`；`displayMode` 含 ball 时显示 | `main.js:435-569` | 已确认（`scripts/window-smoke.mjs:158,228` 断言沙箱与球运行时；`test/platform.test.mjs:93-141` 断言几何） |
| 岛窗口 | 顶部胶囊，尺寸随内容 | `applyForm()` → `island.show()` 懒建 | `src/main/island.js:323-400` | 已确认（`window-smoke.mjs:175,409,691,835`；`scripts/ui-audit.mjs:982`；`docs/UI-AUDIT.md`） |
| 设置窗口 | 16 页设置中心（单例、固定 1080×760；页数来自 `schema.js:105 SETTINGS_PAGE_KEYS`，实测 16） | 托盘第一行、岛上齿轮、`settings:open` | `src/main/settings.js:102-158` | 已确认（`window-smoke.mjs:1388` 断言固定尺寸；`ui-audit.mjs:895`） |
| 托盘图标 | 通知区身份与唯一菜单入口 | 启动 `createTray()`；`trayIcon` 开关 | `main.js:1476-1489` | 待验证（无自动化覆盖，也无验收记录） |
| 托盘面板 | 自绘菜单：设置 / 置顶 / 退出 | 左键或右键托盘；球右键 `pet:menu` | `src/main/tray-panel.js:90-150`；`main.js:1506-1519` | 待验证（仅放置算术有单测 `test/tray-menu.test.mjs`，面板交互未验证） |
| 更新卡 | 新版本提示（版本 + 两条更新点） | `updateCheck` 发现新版 → `notifyAvailable()` | `src/main/update-prompt.js:84-124` | 开发中（三个动作通道被守门拒绝，见 §8.1） |
| 首启引导 | 两页：欢迎 + 选形态 / 皮肤，可跳过 | 启动末尾 `maybeShow()`，`onboardingDone` 为 false | `src/main/onboarding.js:91-157` | 待验证（只有 `scripts/capture-ui.mjs:278-307` 的截图流程与 `test/i18n.test.mjs:108` 一处文案断言） |
| 全局快捷键 | `Alt+Shift+T` 显隐岛 | `applyHotkey()`，`hotkey` 开关 | `main.js:1333-1346` | 待验证（无测试、无验收记录） |
| 状态文件监听 | 外部写 `state.json` 即换表情 | `ensureStateFile()`，400ms `fs.watchFile` | `main.js:942-969` | 待验证（协议契约见 `docs/PROTOCOL.md`，解析单点在 `main.js:958`，但主进程监听链路无自动化覆盖，`window-smoke.mjs` 也未驱动它） |
| 托盘「置顶」 | 球窗口 always-on-top 即时切换 | `runTrayAction('pin')` → `togglePinned()` | `main.js:1176-1195` | 待验证（只有消费点审计 `docs/SETTINGS-AUDIT.md:66` + 代码路径 `main.js:1409-1419`，无运行期断言） |
| 设置·设备探测 | 打开设置·设备即起探测，关窗释放 | `settings:devices-watch` → `devicesWatch` | `main.js:84, 2153-2161, 2403-2407` | 已确认（`test/devices-settings.test.mjs`） |

## 4. 数据与存储

存储根：`app.getPath('userData')`（`paths.js:12`），Windows 即 `%APPDATA%\EmojiTot\`；进程名为产品名（`main.js:2275 app.setName('EmojiTot')`）。所有 JSON 写入都走同一原子写（临时名含 pid + 时间 + 序号 → `fsync` → `rename`，失败保留旧文件，`paths.js:42-64`）。

| 数据 | 位置 / 文件 | 写入者 | 读写时机 | 备注 |
| --- | --- | --- | --- | --- |
| 全部偏好 | `prefs.json`（`paths.js:13`） | `writePrefs` 是唯一入口（`paths.js:100`），经 `settings.applyPatch`（`settings.js:173`）/ `settings:patch` | 读时统一补默认值（`withDefaults`）；未知键被 `filterPatch` 丢弃 | 结构以 `schema.js DEFAULTS:183` 为唯一事实 |
| 当前表情（对外接口） | `state.json`（`paths.js:14`） | 主进程只做初始化（`main.js:965`），之后由外部工具写 | 400ms `fs.watchFile`（`main.js:967`） | 文件即协议：裸 id / JSON 字符串 / 对象都接受（`main.js:958`） |
| 邮箱授权码 / AI Key | `secrets.bin`（`quota.js:31`）、`mail.json`（`mail.js:25`，仅 secret 字段加密） | `quota.js:155`、`mail.js:378` 经 `secrets.encrypt` | 添加账号时写，请求时解密 | `v1:` = safeStorage 密文，`plain:` = 无钥匙串的可见降级（`secrets.js:11-31`） |
| 日程与订阅 | `cache-calendar.json`（`calendar.js:41,51`） | calendar 服务 | 30 分钟刷新一轮 | 订阅 URL 加密写入（`calendar.js:53`） |
| 天气 / 定位 | `cache-weather.json`、`cache-weather-locate.json`（`weather.js:87,91`） | weather 服务 | 默认 15 分钟（`main.js:1771`） | 失败保留上次好读数 |
| 设备快照 | `cache-devices.json`（`devices.js:48`） | devices 服务 | 首帧先给缓存，再给探针结果 | 探测分两行推送 |
| 歌词缓存 | `cache-lyrics-<hash>.json`（`lyrics.js:121`） | lyrics 服务 | 换歌即查，按条数上限裁剪 | 负缓存 `NEGATIVE_TTL` 只记几分钟（`test/services.test.mjs:240-280`） |
| 番茄钟 | `cache-focus.json`（`focus.js:26,33`） | focus 服务 | 每次状态变化 | 以 `endsAt` 为准，可跨睡眠 |
| 喝水 / 久坐 | `cache-health.json`（`health.js:49,71`） | health 服务 | 每次计数变化 | 保留七日分桶 |
| 待办 | `cache-todos.json`（`todo.js:35,40`） | todo 服务 | 每次增删改 | 提醒标记随条目存，重启不重复播报 |
| 剪贴板历史 | `clipboard.json`（`clipboard.js:24`） | clipboard 服务 | 1.5s 轮询；关闭时清未固定项 | 默认关（`schema.js DEFAULTS.shelf.clipboard=false`；`test/security.test.mjs:215-241`） |
| 置物架 | `shelf/` 目录 + `shelf-groups.json`（`shelf.js:28,61`） | shelf 服务 | 拖入即复制 | 同名加 ` (1)` 不覆盖 |
| 自动避让配置 | `avoidance.json`（`avoidance.js:34`） | avoidance 服务 | 列表或图标变化时 | 只存 exe 路径与图标缓存 |
| Agent 状态源（外部只读） | `~/.dsh/dsh-progress.json`、`~/.claude/emojitot-state.json`、`~/.codex/emojitot-state.json`（`main.js:128,142,148`） | 各 Agent 自己 | 每秒 stat，内容变化才解析 | 不落盘、不进渲染进程 |
| 构建版本（只读） | `apps/desktop/build-info.json`（`build-version.js:16`） | 构建脚本 | 设置·关于 / 引导 / 更新比较 | `resolveBuildVersion` 只接受 `x.y.z.<1–5 位>` |

## 5. 状态与异常矩阵

| 场景 | 当前表现 | 实现位置 | 备注 |
| --- | --- | --- | --- |
| 启动中（页面未就绪） | 球窗 `show:false`，`ready-to-show` 才 `showInactive`；加载完成补发 cast / prefs / face | `main.js:536-542`、`:2353-2358`；岛 `island.js:370-385` | 加载前的推送会丢，靠 `did-finish-load` 与 `faceBus.resend()` 补 |
| 空（无数据） | 电量 null → 岛不画该组件；Agent 全关 → 行仍显示「关」 | `battery.js:1-10`；`main.js:982-1004` | 空态不是错误态 |
| 部分成功 | 设备探测先推缓存列表、再推电量；余额快照带 `error` | `devices.js:1-20`；`main.js:1015-1026` | 页面按整体快照替换，不等第二行 |
| 服务启动失败 | 单服务 `try/catch` 打日志，不记入 `runningServices`；下次 prefs 变化重试 | `main.js:1898-1912` | 一个服务失败不拖垮其它 |
| 平台不支持 | 该服务跳过且不重试（`continue`）；能力由 `platform.capabilities()` 提供 | `main.js:1892-1897`；`platform.js:65` | 非 Windows 只剩 battery（`platform.js:50-55`） |
| 离线（天气） | 保留上次读数，同时推 `{error, at}`，页面显示错误而非「正在获取」 | `main.js:1755-1765` | 循环仍按计划重试 |
| 歌词不可用 | 推 `{unavailable:true}`；负缓存按分钟过期，不按天 | `main.js:1953-1964`；`lyrics.js:245` | 有单测 |
| 状态文件缺失 / 写到一半 | 缺失 → 只移除仲裁条目；解析 null → 不推进 mtime，下一 tick 重试 | `main.js:944-960`、`:1074-1084`；`agent-file.js:2` | 半写入不会把旧表情卡成「已完成」 |
| IPC 被拒 | 返回 null，不抛；同 channel 同原因只记一条日志 | `ipc-guard.js:55-60, 69-96` | 拒绝是静默的，页面把 null 当「没变」 |
| prefs 只读盘 | 写失败吞掉，旧文件保持完整 | `paths.js:42-64` | 只读 profile 不崩 |
| 全屏 / 避让触发 | 只按边沿动作；全屏需连续两样本确认；手动隐藏优先 | `main.js:1381-1400`；`fullscreen-guard.js:8-32` | 自动避让另有 `island.pillRect()` 输入 |
| 二次启动 | 不新开进程；按 `prefs.displayMode` 恢复形态并清全屏闩 | `main.js:2295-2310` | 有 `window-smoke.mjs:1435` 端到端断言 |
| 更新检查失败 | `state='error'` + 截断 200 字错误；卡片不弹 | `update-check.js:120-125` | 不阻塞启动（`main.js:2371` 不 await） |

## 6. 功能合同

| ID | 功能 | 入口 | 行为合同（判定 / 时序 / 文案 / 副作用） | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- |
| RUNTIME-01 | 单实例 | 再次双击快捷方式 | `requestSingleInstanceLock()` 失败即 `app.quit()`；成功则 `second-instance` 重读 `prefs.displayMode` → `applyForm()` → 球显示时 `focus()`；同时清 `hiddenByFullscreen` | 已确认 | `main.js:2295-2310`；`window-smoke.mjs:1435` |
| RUNTIME-02 | 启动次序 | `app.whenReady()` | 直连代理 → 硬化 session → 动态 import core/schema → 预热 weather/devices → 建球窗 → 注册六个窗口 IPC → 启更新检查 → 托盘 → 屏幕事件 → 状态文件 / 指针 / agent / 服务 → `applyForm`+`applyMainPrefs` → 引导 | 已确认 | `main.js:2312-2433`；`window-smoke.mjs` 全流程 |
| RUNTIME-03 | 三态形态 | 设置·常规 / 引导第二页 | `displayMode` 是唯一显示态来源；`island` 只藏球、`ball` 只藏岛、`both` 都显示；改后即时 `applyForm()` | 已确认 | `main.js:368-371, 1138-1145`；`schema.js:801`；`window-smoke.mjs:1435` |
| RUNTIME-04 | 拖拽与贴边 | 球上按下拖动 → 松开 | 拖拽期间 16ms 跟手且 `setBounds` 固定尺寸（跨缩放显示器不变形）；松手在左 / 右 8px 内 → `dock(side)`，否则记住位置 | 已确认 | `main.js:860-908`；`test/platform.test.mjs:108-125`（源码级） |
| RUNTIME-05 | 点击穿透 | 指针移动 | 60ms 轮询光标；落在球心 `dim/2` 内恢复输入，否则穿透；拖拽期间强制不穿透 | 已确认 | `main.js:581-613`；`window-state.js:23`；`test/window-state.test.mjs`；`security.test.mjs:153-156` |
| RUNTIME-06 | 贴边悬停展开 | 收起后悬停细条 | 140ms 轮询；离开细条 → 关闭并置 `armed`；再次进入且已 armed → 展开；`armed` 防止落下瞬间自动弹开 | 已确认 | `main.js:690-727, 821-856`；`test/platform.test.mjs:119` |
| RUNTIME-07 | 岛尺寸单一来源 | 页面 `ResizeObserver` | 页面报 `{w,h}`（w 120–720、h 28–640）→ 窗口 = 内容 + 左右 32 / 上下 36；位置 = 目标屏工作区顶部居中 + `topGap`（0–24，默认 8） | 已确认 | `island.js:28-31, 110-144, 418-435`；`main.js:2070` bootstrap；`window-smoke.mjs:409,889` |
| RUNTIME-08 | 岛悬停判定 | 指针移动 | 以页面上报的 `hit` 矩形（折叠时为 5px 条）判定；指针离矩形距离决定轮询频率 25 / 120 / 250ms；折叠条外一律穿透 | 已确认 | `island.js:238-321`；`window-smoke.mjs:245` |
| RUNTIME-09 | 设置窗口单例与即写 | 托盘 / 岛 / 引导打开 | 已存在则 `show+focus` 并 `settings:goto`；每个控件 `settings:patch` → `applyPatch` → 写盘 + 广播（含自己）；无「应用」按钮 | 已确认 | `settings.js:102-108, 173-190`；`window-smoke.mjs:1098,1388` |
| RUNTIME-10 | 托盘面板开闭 | 托盘左 / 右键、球右键 | 已开 → 关；刚关闭 250ms 内的点击视为「关」，否则定位到图标上方 / 下方（默认 200×164）；失焦即关 | 待验证 | `main.js:1506-1519`；`tray-panel.js:32-34, 120-150`；仅 `test/tray-menu.test.mjs` 覆盖定位算术 |
| RUNTIME-11 | 配置即时生效 | 任意窗口改 prefs | `settings.onPrefs` 一次分派：`displayMode` / `applyMainPrefs` / `applyServicePlan` / 媒体暂停阈值 / weather 重排 / quota 重排 / messenger 刷新，再广播 `settings:changed` | 已确认 | `main.js:2400-2429`；`schema.js:797-896`（逐项 live:true） |
| RUNTIME-12 | 服务计划 | 启动 / 每次 prefs 变化 | 想要 = 页面开着的 `service` + 打开着的状态组件所需服务 + 设置·设备页需求；不在集合里的逐个 `stop()`；已启用的不重启 | 已确认 | `main.js:1879-1914`；`schema.js:573-599`；`test/schema.test.mjs` |
| RUNTIME-13 | 全屏隐藏 | 前台应用全屏 | 连续两次采样为全屏才隐藏岛；恢复同理；`hideFullscreen=false` 时立即停表并还原 | 待验证 | `main.js:1381-1400`；`fullscreen-guard.js`；`test/fullscreen-guard.test.mjs`（只覆盖守卫纯逻辑） |
| RUNTIME-14 | 自动避让 | 列表应用覆盖岛 | `avoidEnabled` 且平台支持才起表；把 `{enabled, browsers, apps}` 与 `pillRect()` 交给常驻脚本；脚本回 1/0 → 推 `island:avoid` | 待验证 | `main.js:1359-1379, 2409-2412`；`avoidance.js:1-20` |
| RUNTIME-15 | 显示器变化 | 插拔 / 改分辨率 / 换屏 | 球：不在工作区内则回默认角落并清贴边；岛：重新 `place()`；托盘面板按图标所在屏 | 已确认 | `main.js:1430-1455, 2388-2390`；`island.js:395-397`；`test/platform.test.mjs:127-141` |
| RUNTIME-16 | IPC 守门 | 任意渲染进程调用 | 四查顺序：角色（webContents id 登记）→ frame（`ipc-frame.js` 正则）→ 字节（默认 64KB，`local:do addBuffer` 8MB）→ 形状（逐通道）；任一失败返回 null | 已确认 | `ipc-guard.js:69-96`；`security.test.mjs:27-201`；`test/ipc-frame.test.mjs` |
| RUNTIME-17 | 单一「脸」所有权 | 状态文件 / 预览 / Agent / 媒体 / 空闲 | 只有主进程能决定表情；变更经 `faceBus.set(state, source)` 广播给球、岛、设置预览；晚加入者 `attach` 立即补当前值；同状态同来源不重复广播 | 已确认 | `main.js:1651-1674`；`face-bus.js:23-91`；`test/face-sync.test.mjs` |
| RUNTIME-18 | 情绪优先级与停留 | 同一时刻多来源 | manual(3) > agent(2) > media(1) > idle；任何来源上台至少 2000ms；同脸换来源只换提示、不重置停留 | 已确认 | `media-emotion.js:32-158`；`main.js:207-220`；`test/media-emotion.test.mjs` |
| RUNTIME-19 | 空闲借脸 | 待机 | 仅当开关开、无拖拽、无避让 / 全屏隐藏、有可见表面、当前显示源为 idle 时借；返回时只有脸仍属自己才还原 | 已确认 | `main.js:1686-1721`；`test/idle-mood.test.mjs` |
| RUNTIME-20 | Agent 联动 | 三个状态文件 + 进程存在 | 每秒 stat；文件词汇 → 协议 id（dsh：blocked→34、done→33、running→30，满 100% → 33）；只有 `running` 才进仲裁；过期文件只当回执 | 已确认 | `main.js:124-151, 942-960, 1035-1131`；`test/agents.test.mjs`、`test/agent-status.test.mjs`、`test/agent-presence.test.mjs` |
| RUNTIME-21 | 托盘与置顶 | 托盘图标 / 面板第二行 | `trayIcon=false` 销毁托盘；图标用当前角色 SVG（32 / 16px），失败回落资源 PNG；置顶在 `floating`/`screen-saver` 层切换并写 `prefs.pinned` | 待验证 | `main.js:328-353, 1176-1181, 1322-1331, 1476-1489` |
| RUNTIME-22 | 全局快捷键 | `Alt+Shift+T` | `hotkey=false` 时不注册；按下切换岛显隐并刷新菜单；注册异常不影响启动 | 待验证 | `main.js:1333-1346` |
| RUNTIME-23 | 开机启动 | 设置·常规 | `applyPatch` 见到 `launchAtLogin` 才调 `app.setLoginItemSettings`；有 `EMOJITOT_LAUNCHER` 用它，否则 `process.execPath`；失败只吞错，prefs 仍记意图 | 已确认 | `login-item.js:1-7`；`settings.js:178-184`；`test/login-item.test.mjs`（只覆盖参数构造，OS 副作用未验证，见 §8.4） |
| RUNTIME-24 | 更新检查 | 启动 / 6h 定时 | `GET api.github.com/repos/OneStar1107/emoji-tot/releases/latest`（8s 超时、`inFlight` 去重、忽略 draft / prerelease）；状态机 idle / checking / available / current / error；仅 `available` 才推卡片 | 已确认 | `update-check.js:8-11, 88-138`；`test/update-check.test.mjs` |
| RUNTIME-25 | 更新卡规则 | 收到一条新版本事件 | 规范化只留 version（≤32 字）+ 两条 note（≤160 字）；每次运行只弹一次；`snoozeUntil` 未过期不弹；「稍后」写 `+24h` 并关窗；下载页固定 `RELEASES_URL`（不接受事件里的 URL） | 开发中 | `update-prompt.js:28-34, 63-74, 133-169`；动作通道见 §8.1 |
| RUNTIME-26 | 首启引导 | 启动末尾 | `onboardingDone!==true` 才开；「跳过」只写 `onboardingDone`；选形态 / 皮肤写 `displayMode`/`skin`（白名单 `island|ball|both`、`frost|solid|plain`） | 待验证 | `onboarding.js:54-89, 153-177`；`schema.js:802` |
| RUNTIME-27 | 退出清理 | 任意退出路径 | `before-quit`：置 `__emojitotQuitting`（岛 / 设置据此允许关闭）→ 停拖拽 / 空闲时钟 / 悬停 / 指针 / 电池 / 天气定时器 → 注销快捷键 → 停全屏、更新检查、音量、前台游戏 → `killWatchers()` → 停全部服务 → 停 agent 监听 → `fs.unwatchFile(state.json)` | 待验证 | `main.js:2439-2476`；`island.js:387-389` |
| RUNTIME-28 | 存储原子性 | 任意 JSON 写 | 临时文件（pid + 时间 + 序号）→ 写 → `fsync` → `rename`；失败删临时文件、保留旧目标；prefs 写入前过 `filterPatch` | 已确认 | `paths.js:40-109`；`test/services.test.mjs:496-511` |
| RUNTIME-29 | 安全加固 | 进程启动 | 禁硬件加速 + `disable-gpu` + `in-process-gpu`；`web-contents-created` 一律禁 `window.open` / 跨源导航 / webview；session 三类权限一律 false | 已确认 | `main.js:2243-2271, 2283-2293`；`security.test.mjs:176-191` |
| RUNTIME-30 | 直连网络 | 启动 | `session.defaultSession.setProxy({mode:'direct'})`，失败只记日志 | 已确认 | `main.js:2322-2327`；`docs/PRIVACY.md:97` |

## 7. 不可随意改变（红线）

1. **单实例语义**：不得改成「允许双开」或在 `second-instance` 里新建窗口 —— 球 / 岛的位置、`prefs.json` 的写者、托盘图标都假定只有一个进程（`main.js:2295-2310`）。
2. **表情只有一个所有者**：渲染进程不得回报 / 决定表情。任何「让页面告诉主进程它画了什么」的改动都会重现球与岛错脸的老问题（`face-bus.js:1-15`、`main.js:1651-1664`）。
3. **IPC 必须过守门**：不得新增裸 `ipcMain.handle/on`；不得放宽角色或 frame 检查；失败仍要返回 null 而不是抛（`ipc-guard.js:69-96`；`security.test.mjs:168-173` 会挂）。
4. **六窗沙箱**：`sandbox:true`、`contextIsolation:true`、`nodeIntegration:false` 是每个窗口的固定组合；preload 只经 `contextBridge` 暴露白名单方法（`security.test.mjs:158-166`，注意该测试只扫了 6 个文件里的 4 个，见 §8.2）。
5. **点击穿透靠光标轮询**：不要改回依赖 `setIgnoreMouseEvents(true,{forward:true})` 转发 mousemove —— Windows 上不生效是实测结论（`main.js:571-585`、`island.js:224-230`）。
6. **岛尺寸只有一个来源**：主进程不得硬编码展开宽高；窗口永远 = 页面上报 + 固定透明边距（`island.js:418-435`、`docs/ARCHITECTURE.md:26`）。
7. **不要引入原生材质**：`systemMaterial()` 故意恒为 `'none'`，所有表面由 CSS 画；DWM 材质会填满矩形 padding 并在圆角处漏灰框（`main.js:423-433`、`docs/ISLAND.md`）。
8. **退出必须走 `before-quit` 清单**：孤儿 PowerShell 会累积留在系统里，`killWatchers()` + 逐服务 `stop()` 是唯二保险（`platform.js:137-164`、`main.js:2454-2473`）。
9. **prefs 只有一个写入口**：所有写入经 `writePrefs` / `applyPatch`；未知键必须被 `filterPatch` 丢弃；带 OS 副作用的键（`launchAtLogin`）必须在该入口统一处理（`paths.js:100-109`、`settings.js:173-190`）。
10. **凭证只走 `secrets.js`**：不得把 Key / 授权码 / 订阅 URL 明文写进 `prefs.json` 或日志；`plain:` 前缀必须保留，让「没有钥匙串」可见（`secrets.js:11-31`、`docs/PRIVACY.md:32`）。
11. **最短停留 2000ms**：不得为了「更灵敏」把 `minDisplayMs` 降到 0；这是媒体 / Agent 事件不闪脸的唯一闸门（`main.js:210`、`media-emotion.js:76`）。
12. **出网只在已知目的地**：新增请求必须同时改 `docs/PRIVACY.md` 的网络表，否则「没有遥测」的表述立刻失真（`docs/PRIVACY.md:83-101`）。

## 8. 已知缺口与风险

### 8.1 更新卡的三个动作被自己的 IPC 守门拒绝（已确认缺陷）

`update-prompt.js:112` 登记角色 `update`，但 `src/main/ipc-frame.js:1-6` 的 `FRAME` 只有 `ball/island/settings/tray`，唯一在别处追加的是 `onboarding`（`onboarding.js:36`）。`frameMatches('update', …)` 因 `!FRAME[role]` 恒为 false（`ipc-frame.js:8-11`），所以 `update:snooze` / `update:open` / `update:close`（`update-prompt.js:206-213`）在 `guardedHandle` 第一步就按 `'frame'` 被拒并返回 null。实测（`cd apps/desktop && node -e ...` 只 require 无 Electron 依赖的 ipc-frame.js）：

```
roles at load: [ 'ball', 'island', 'settings', 'tray' ]
update frame ok? false
roles after onboarding require: [ 'ball', 'island', 'settings', 'tray', 'onboarding' ]
onboarding ok? true   update ok? false
```

用户可见后果：卡片能弹出，但「稍后」「打开下载页」与 Esc 全部无反应，`snoozeUntil` 永不写入，窗口也没有失焦关闭逻辑（`update-prompt.js:84-124` 无 `blur` 处理），只能 Alt+F4。修复点很窄（给 `FRAME` 加一条 `update` 正则），但现状因此把该条目记为**开发中**。回归缺口：`test/ipc-frame.test.mjs` 只覆盖 `island` / `tray` 两个角色。

### 8.2 文档与代码已经对不上（改代码时请一并改文档）

| 位置 | 文档说法 | 代码事实 |
| --- | --- | --- |
| `docs/SECURITY.md:36` | 「四个窗口（球、岛、设置、更新卡）全部 sandbox」 | 实际 6 个窗口都 sandbox（另有 `tray-panel.js:109-114`、`onboarding.js:116-121`） |
| `docs/SECURITY.md:42` | 「所有 36 个渲染进程到主进程的调用」 | 注册的守门通道实测 62 个（`guardedHandle` 55 + `guardedSend` 7，对 `src/main/**` 枚举） |
| `docs/ARCHITECTURE.md:19-22` | 「桌面端四个窗口」+ 四个 preload | 6 窗 6 preload（多 `preload-tray.js`、`preload-onboarding.js`） |
| `docs/ARCHITECTURE.md:24` | 「更新卡…不含检查逻辑」 | `src/main/update-check.js` 已在 `main.js:2371` 启动 |
| `docs/PRIVACY.md:85-96` | 网络表不含 GitHub | `update-check.js:9` 启动即请求 + 每 6h；`PRIVACY.md:101`「更新靠手动下载」与自动检查并存 |
| `docs/ARCHITECTURE.md:19` | facts 标记写「15 页」 | `SETTINGS_PAGE_KEYS` 实测 16 页（`schema.js:62-105`，`scripts/facts.mjs:50` 就是用它的长度）→该标记已过期；`docs/UI-AUDIT.md:3` 写的是 16（未运行 `pnpm docs:check` 验证闸门，它需要先 build） |
| `docs/SETTINGS.md:3` | 「窗口 1080×760，可缩放」 | `settings.js:112-117` `resizable:false, maximizable:false`；`window-smoke.mjs:1388` 断言固定尺寸 |
| `update-prompt.js:4-9`（源码注释） | 「There is no release checker in this build」 | 同上，检查器已存在 |
| `docs/baseline/README.md:5` | 功能合同在 `../FEATURE-BASELINE.md` | 该文件当前不存在（`glob docs/FEATURE-BASELINE.md` 为空）→ 本文件 §6 的 RUNTIME-01..30 是目前唯一可查的主进程侧合同 |

### 8.3 死代码与废分支（不要照着它们理解当前行为）

- `main.js:501-530 applyIslandShape()` 在 `systemMaterial() !== 'acrylic'` 时直接 return，而 `systemMaterial()` 恒返回 `'none'`（`main.js:431-433`）→ 整段 `setShape` 与 `resize` 80ms 去抖路径不可达（**已废弃**）。
- `island.js:449 loadFile()` 导出但无调用者；`island.js:211 stopOledShift()` 导出但 `before-quit` 未调用（进程退出即失效）。
- `ipc-guard.js:105 guardedSync()` 无任何通道使用；`platform.js:210 windowsOnly` 无消费者；`ipc-shape.js:123 checkRect` 只有 `security.test.mjs:115-123` 在用（原 backdrop 通道已移除，`main.js:2101-2102` 有注记）。
- `preload.js:49-52` 注释写「debugState / debugDock 只在 `--dev` 时可用」，但 `debug:state` / `debug:dock` 是无条件注册（`main.js:1610-1631`），且全仓已无 `--dev` 读取点（`main.js:1602-1609` 自己也说明了这点）。可按「已废弃的 dev 开关」理解，但通道本身仍常开。

### 8.4 未验证（本模块没有任何测试或验收记录的部分）

- 退出清理时序（`before-quit` 各步顺序、强杀时 watcher 是否残留）。
- 全局快捷键注册成功 / 被占用两种情形（`main.js:1333-1346`）。
- 托盘面板真实交互：失焦关闭、Escape、键盘 Enter 提交（`tray-panel.js:120-150` 与 `renderer/tray.js`）。
- 首启引导「完成」链路：`onboarding:finish` → `settings.applyPatch` → 形态立即生效（`onboarding.js:83-89`）。
- 开机启动的系统副作用（`app.setLoginItemSettings`）—— `login-item.test.mjs` 只测参数构造。
- 更新卡真机验证：`EMOJITOT_UPDATE_TEST` 注入（`update-prompt.js:188-204`）就是为此准备的入口，但 `docs/` 内没有对应验收记录。
- 更新检查的真网络路径（`test/update-check.test.mjs` 用注入的 `fetchImpl`）。

### 8.5 其它风险

- **非 Windows 是降级而非支持**：`platform.js:28-55` 只有 win32 全绿、darwin 仅 battery、linux 空表；产品只发 Windows（`test/platform.test.mjs:142-156` 会挂掉任何 macOS 承诺）。
- **`local:do` 是唯一带字节的通道**：8MB 上限同时写在守门默认与 `checkLocal`（`main.js:1580-1598`、`ipc-shape.js:96`），两处漂移时先失败的是窗口而不是主进程内存。
- **`devicesWatch` 是 0/1 需求闩，不是计数**（`main.js:84, 2153-2161`）：设置窗口关闭即清零。当前只有设置窗口写它（岛走 `island:devices-focus` → `devices.setFocused`），所以成立；若将来第二个窗口也要「打开即探测」，这里必须改成计数，否则先关的那个会替所有人关掉探针（推断）。
- **隐性出网点**：`netease-artwork.js`（music.163.com + 允许的 CDN）、`netease-cdp.js`（本机 127.0.0.1:9223 CDP）都是网络行为，改 `docs/PRIVACY.md` 时最容易漏（该文档 `49-53` 行有记录）。
- **托盘图标依赖 core 的 SVG 解码**：`nativeImage.createFromDataURL` 解不出 SVG 时回落资源 PNG（`main.js:328-346`）；若打包漏掉 `assets/tray-*.png`，通知区会变空图标（打包产物内容未验证）。
