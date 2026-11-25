# 球窗口、托盘面板、首次引导、更新卡

> 桌面端四个「非设置」界面：常驻的球、按需弹出的托盘面板、一次性的两页引导、一张 320×200 的更新卡。实现根目录 `apps/desktop/src/`（主进程 `src/main.js` 与 `src/main/`，页面 `src/renderer/`，桥 `src/preload*.js`）。

## 1. 范围与边界

本文件覆盖：

- **球窗口**：`src/renderer/index.html` + `renderer.js` + `style.css`，以及 `src/main.js` 里的窗口创建、贴边停靠、点击穿透、拖拽、气泡通知。
- **托盘面板**：`src/renderer/tray.html` / `tray.js` / `tray.css` + `src/main/tray-panel.js`（窗口与 IPC）+ `src/main/tray-menu.js`（定位算术）。
- **首次引导**：`src/renderer/onboarding.html` / `onboarding.js` / `onboarding.css` / `onboarding-polar.css` + `src/main/onboarding.js`。
- **更新卡**：`src/renderer/update.html` / `update.js` / `update.css` + `src/main/update-prompt.js`，以及它与 `src/main/update-check.js` 的唯一接口。
- **四个 preload 的暴露面**：`src/preload.js`、`preload-tray.js`、`preload-onboarding.js`、`preload-update.js`。

本文件不覆盖（去哪看）：

| 主题 | 权威位置 |
| --- | --- |
| 灵动岛（胶囊、页面、避让、OLED 位移） | `docs/ISLAND.md`，以及 `docs/baseline/` 的岛模块文件 |
| 设置中心 16 页（含「托盘」预览页、颜色令牌） | `docs/SETTINGS.md`、`docs/SETTINGS-AUDIT.md`，以及设置模块基线文件 |
| 角色引擎（61 表情、眼睛拓扑、弹簧运行时） | `docs/ARCHITECTURE.md`「角色是基因组」「渲染四层」，以及 core 模块基线文件 |
| 两位数协议、仲裁、事件桥 | `docs/PROTOCOL.md` |
| GitHub 发布检查的网络细节、版本比较规则 | `docs/ARCHITECTURE.md:24` 与 `apps/desktop/src/main/update-check.js`（本文只写它与卡片的接口） |
| 打包、签名、安装、卸载清理 | `docs/SIGNING.md`、`docs/RELEASING.md` |

生成物只记录存在、不逐行分析：`src/renderer/vendor/core/` 与 `src/vendor/protocol/` 由 `apps/desktop/scripts/copy-vendor.mjs` 从 `packages/core/dist`、`packages/protocol/dist-cjs` 复制；`release/` 是 electron-builder 产物；`apps/desktop/.ui-capture/` 是 `capture-ui.mjs` 的截图目录，已在 `.gitignore` 中忽略（现有 `onboarding-01-welcome.png`、`onboarding-02-setup.png` 两张引导截图，没有球与更新卡的截图）。

## 2. 模块与文件清单

| 模块 | 职责 | 实现位置 | 触发 / 生命周期 |
| --- | --- | --- | --- |
| 球窗口（主进程） | 建一个方形透明置顶窗，承载球与气泡 | `apps/desktop/src/main.js:435-569` | 启动时创建（`main.js:2351`），进程内常驻；`displayMode='island'` 时只隐藏不销毁 |
| 球页面 | 挂 `<emojitot-ball>` 与 `#bubble` | `renderer/index.html:11-19` | `loadFile` 于 `main.js:535` |
| 球渲染逻辑 | 指针手势、表情上屏、气泡、尺寸自适应 | `renderer/renderer.js:11-236` | 页面加载后立即执行（`await customElements.whenDefined`，`renderer.js:19`） |
| 球样式 | 透明底、球居中、气泡四向定位与过渡 | `renderer/style.css:1-116` | 静态 |
| 气泡文案表 | 61 张脸（与引擎 FACE_META 一一对应）→ 颜文字，未知状态返回空串 | `renderer/faces.js:9-71` 与 `:136-138` | `onFace` 每次调用 |
| 点击穿透 / 命中判定 | 60ms 轮询光标，落在球半径内收回输入 | `main.js:571-613` | `startPointerWatch()` 于 `main.js:2392` |
| 拖拽 | 16ms 跟手移动窗口，固定宽高 | `main.js:858-908` + `renderer.js:61-118` | `drag:start` / `drag:end` |
| 贴边停靠与悬停展开 | 半隐、伸出、收起三套坐标 | `main.js:673-856` | 拖拽释放 + 140ms 轮询 |
| 托盘面板窗口 | 自绘 200×164 弹层，懒创建后复用 | `src/main/tray-panel.js:90-156` | 首次打开时创建，之后 `hide()` 复用 |
| 托盘定位算术 | 以图标矩形为锚计算面板左上角 | `src/main/tray-menu.js:43-67` | 每次 `show()` |
| 托盘面板页面 | 头部 + 三行 + 键盘 | `renderer/tray.html:13-36`、`tray.js:7-67`、`tray.css` | 窗口创建后常驻 |
| 托盘图标 | 当前角色的 32/16px 图与 tooltip，左/右键都开面板 | `main.js:328-353`、`main.js:1476-1489` | 启动 + `prefs.trayIcon` 变化 |
| 引导窗口 | 780×630 居中、两页、可跳过 | `src/main/onboarding.js:91-157` | 启动最后一步（`main.js:2432`），一次性 |
| 引导页面 | 欢迎页与「形态 + 皮肤」页 | `renderer/onboarding.html:27-78`、`onboarding.js:8-135` | 窗口加载后 |
| 更新卡窗口 | 320×200 卡片，单次运行只弹一次 | `src/main/update-prompt.js:84-151` | `notifyAvailable()` 触发；关闭即销毁 |
| 更新卡页面 | 版本、最多两条要点、两个按钮 | `renderer/update.html:11-22`、`update.js:8-42`、`update.css` | 窗口加载后 |
| 发布检查器 | 每 6h 查 GitHub latest，只在更新时调 `notifyAvailable` | `src/main/update-check.js:88-143` | 启动（`main.js:2371`）+ 6h 定时 |
| 窗口状态纯函数 | 穿透决策（含拖拽优先级）、显示器 id 比较 | `src/main/window-state.js:9-33` | 每 60ms 轮询调用 |
| IPC 守卫与帧登记 | 校验来源窗口、frame URL、payload；登记六个角色 | `src/main/ipc-guard.js:69-96`、`src/main/ipc-frame.js:1-11` | 每个 invoke/send |
| 相关偏好声明 | 四界面读写的键、默认值、审计出处 | `src/shared/schema.js:183-236,272,347,800-889` | 启动加载 schema（`main.js:2335`） |
| 桥 | 四个页面各自一份最小 API | `preload.js`、`preload-tray.js`、`preload-onboarding.js`、`preload-update.js` | 各窗口创建时 |

### 2.1 preload 暴露面（四个桥，各自最小）

| 桥 | 暴露对象与成员 | 用途 | 证据 |
| --- | --- | --- | --- |
| `preload.js`（球） | `petAPI`：`dragStart(point)`、`dragEnd()`、`openMenu()`、`poke()`、`onFace`、`onAction`、`onCast`、`onDock`、`onSize`、`onPrefs`、`debugState()`、`debugDock(side)` | 拖拽 / 右键 / 戳一下；收表情、一次性动作、角色、贴边、尺寸、偏好；两个 `debug:*` 读窗口状态与驱动贴边 | `preload.js:9-66` |
| `preload-tray.js`（面板） | `trayAPI`：`state()`、`act(kind)`、`close()`、`onState` | 读一次状态、报一个动作、关闭、订阅状态 | `preload-tray.js:9-18` |
| `preload-onboarding.js`（引导） | `onboardingAPI`：`get()`、`finish(choice)`、`onCast` | 取预选值（角色 / 形态 / 皮肤 / 主题 / 版本）、提交一次答案、跟随角色切换 | `preload-onboarding.js:11-19` |
| `preload-update.js`（更新卡） | `updateAPI`：`onShow`、`snooze()`、`openDownload()`、`close()` | 收一次 payload；三个出口 | `preload-update.js:10-22` |

- 四个桥都不暴露 `require` / `process`，也不用 `sendSync`；每个订阅（`onFace`、`onState`、`onShow` 等）都返回取消函数（`preload.js:25-29`、`preload-tray.js:13-17`、`preload-update.js:12-16`）。
- 通道名写死在 preload 里（`face:apply`、`tray:act`、`update:show` 等），页面无法自造通道。
- 每个 invoke 都过 `main/ipc-guard.js` 的三重检查：发送窗口 id → frame URL → payload 形状与字节上限（`ipc-guard.js:69-96`）。面板的 `tray:act` 只放行 `settings|pin|quit`（`tray-panel.js:25,172`），引导的 `onboarding:finish` 只放行三个字段（`main/onboarding.js:63-70`）。

## 3. 页面 / 窗口 / 条目清单

| 条目 | 用途 | 入口 / 触发 | 实现位置 | 状态 |
| --- | --- | --- | --- | --- |
| 球窗口本体 | 常驻桌面的角色 | 启动即创建；`displayMode` 为 `ball`/`both` 时可见 | `main.js:435-569`、`main.js:1138-1144` | 已确认 |
| 球 · 拖拽跟手 | 按住拖动，松手落位 | 左键按下 + 位移 >4px | `renderer.js:74-102`、`main.js:860-889` | 待验证 |
| 球 · 贴边半隐 | 拖到左右边缘后只留半个球 | 释放时距边 ≤8px | `main.js:690-727` | 已确认 |
| 球 · 悬停展开 | 光标回到球上，球滑出 | 140ms 轮询命中 sliver | `main.js:821-851` | 已确认 |
| 球 · 气泡 | 用颜文字说当前表情 | 仅在贴边时显示，3.4s 后自动隐藏 | `renderer.js:31-54`、`style.css:56-116` | 待验证 |
| 球 · 右键菜单 | 打开与托盘同一个面板 | 右键球体 | `renderer.js:120-123`、`main.js:1638-1644` | 待验证 |
| 托盘面板 · 头部 | 20px 角色 + EmojiTot + 角色名 + 版本 | 面板显示时 | `tray.html:14-18`、`tray.js:15-22` | 待验证 |
| 托盘面板 · 设置… | 打开设置中心（常规页） | 点击行 / Enter | `tray.html:20-23`、`main.js:1186-1188` | 待验证 |
| 托盘面板 · 置顶 | 切换始终置顶，勾选态跟随 prefs | 点击行 / Enter | `tray.html:24-28`、`main.js:1176-1181` | 待验证 |
| 托盘面板 · 退出 | 结束进程（唯一退出入口） | 点击行 / Enter | `tray.html:29-32`、`main.js:1192-1193` | 待验证 |
| 引导 · 第 1 页 | 一句话介绍 + 开始 / 稍后再说 | 引导窗口打开，`onboardingDone` 非 true | `onboarding.html:28-47` | 待验证 |
| 引导 · 第 2 页 | 选形态（岛/球/两者）与皮肤（3 张卡） | 点「开始」 | `onboarding.html:50-78`、`onboarding.js:8-12` | 待验证 |
| 引导 · 完成 / 跳过 | 写偏好并关窗；跳过只写「看过了」 | 按钮或 Esc | `onboarding.js:71-95`、`main/onboarding.js:54-60` | 待验证 |
| 球 · 尺寸档 | 64/88/120/160/220 五档，改档要重开窗口 | 设置「尺寸与位置」 | `main.js:70,615-625`；`shared/schema.js:234` | 待验证 |
| 引导 · 步骤指示 | 右上角「初次见面 01/02」→「显示与外观 02/02」 | 进入第二页时改写 | `onboarding.html:20-24`、`onboarding.js:63-69` | 待验证 |
| 更新卡 · 卡片 | 版本号 + 最多两条更新要点 | 检查器发现新版本 | `update.html:11-21`、`update.js:16-27` | 待验证 |
| 更新卡 · 稍后 | 写 24h 免打扰并关窗 | 点击 / 触屏 | `update.html:18`、`update-prompt.js:163-169` | 开发中 |
| 更新卡 · 打开下载页 | 打开固定 GitHub Releases 地址并关窗 | 点击 | `update.html:19`、`update-prompt.js:171-186` | 开发中 |

### 3.1 入口、退出路径、键盘可达与状态同步

| 界面 | 入口 | 退出路径 | 键盘可达性 | 与设置 / 岛的状态同步 |
| --- | --- | --- | --- | --- |
| 球窗口 | 启动即建窗；`displayMode` 为 `ball`/`both` 时可见 | 被形态开关隐去（窗口保留）；进程退出时销毁 | 无任何键盘入口；`Alt+Shift+T` 只切岛（`main.js:1338-1341`） | 收 `settings:changed`（`main.js:2426-2427`）；写 `position`/`sizeKey`/`pinned`；表情与岛共用 `faceBus`（`main/face-bus.js`） |
| 托盘面板 | 左/右键托盘图标；右键球（同一个面板，`main.js:1638-1644`） | 点行（先隐藏）、Esc、点面板外（blur）、再点图标 | 完整：方向键环绕 / Home / End / Esc / Enter（`tray.js:35-58`）；`Tab` 未拦截，推断会离开页面并触发 blur 关闭 | 显示时读 `trayState()`（版本 / 置顶 / 主题 / 角色）；prefs 变化与系统主题变化都会 `refresh()`（`main.js:1457-1460`、`tray-panel.js:185`） |
| 首次引导 | 启动最后一步，`onboardingDone !== true` | 完成 / 跳过 / Esc / 关窗 | 完整：Tab 到四个按钮，Esc 等同跳过（`onboarding.js:92-116`） | 写 `onboardingDone`（完成时再加 `displayMode`/`skin`）经 `settings.applyPatch()`，立即改球与岛的可见性、皮肤（`main.js:2414-2429`） |
| 更新卡 | 发布检查器（6h 一次）或 `EMOJITOT_UPDATE_TEST` | 设计上：稍后 / 打开下载页 / Esc；**现状三个出口都被守卫拒绝**（见 SURF-22） | 只能 Tab/Enter 到两个按钮；刻意无初始焦点（`update.js:40-42`）；Esc 监听在文档级 | 除「稍后」写 `updatePrompt.snoozeUntil` 外不写设置；与岛无联动；About 页另读 `update-check` 快照（`main.js:2374`、`main/settings.js:80`） |

## 4. 数据与存储

| 数据 | 位置 / 文件 | 写入者 | 读写时机 | 备注 |
| --- | --- | --- | --- | --- |
| `position` | `prefs.json`（`main/paths.js:13`） | 球主进程 `savePrefs()` `main.js:373-380` | 拖动结束且未贴边、窗口 `moved` 且未贴边（`main.js:561-563`） | 贴边状态下不写，避免把半隐坐标存成家 |
| `sizeKey` | 同上，默认 `md`（`shared/schema.js:234`） | 设置在写，球读取 | 启动 `createWindow()`（`main.js:437`） | 改尺寸需重开球窗口（`docs/SETTINGS-AUDIT.md:65`） |
| `pinned` | 同上，默认 `true`（`schema.js:235`） | 托盘「置顶」行 `main.js:1176-1181`、设置 | 启动建窗 + `applyWindowFlags()` `main.js:1409-1419` | 同时决定窗口层级 |
| `clickThrough` | 同上，默认 `true`（`schema.js:236`） | 设置 | 同上 | 用户关掉后 60ms 轮询不再放行（`window-state.js:9-11`） |
| `displayMode` | 同上，默认 `island`（`schema.js:185`） | 设置、引导 | 启动与每次 prefs 变化（`main.js:2417-2419`） | 球/岛可见性的唯一来源（`main.js:368-371`） |
| `skin` | 同上，默认 `frost`（`schema.js:210`） | 设置、引导 | 岛与设置窗绘制 | 球与该四界面不套皮肤 |
| `onboardingDone` | 同上，默认 `false`（`schema.js:193`） | 引导 `settings.applyPatch()` `main/onboarding.js:83-89` | 启动 `maybeShow()`（`main/onboarding.js:153-157`） | 唯一阻止引导再出现的键 |
| `trayIcon` | 同上，默认 `true`（`schema.js:272`） | 设置 | `applyTrayPreference()` `main.js:1322-1331` | 关掉即销毁图标并关面板 |
| `updatePrompt.snoozeUntil` | 同上，默认 `0`（`schema.js:347`，说明见 `schema.js:889`） | 更新卡「稍后」`update-prompt.js:163-169` | 每次 `notifyAvailable()` 前读（`:140-144`） | 毫秒时间戳，24h |
| `lang` / `theme` | 同上，`zh` / `dark`（`schema.js:206,209`） | 设置 | 面板与引导读 theme | `lang` 明确未接入这四界面（`schema.js:199-206`） |
| 表情状态 | `state.json`（`main/paths.js:14`）→ `faceBus` 内存态 | 协议/Agent 链路（`main.js:921-960`） | 球只经 `face:apply` 收，不读文件 | 归属协议模块，本文只记它是球的输入 |
| 贴边三态 | 内存：`dockSide` / `dockOpen` / `dockArmed`（`main.js:169-171`） | 主进程 | 进程内 | 不落盘，重启后球回到 `position` |
| 更新卡去重标记 | 内存：`shownThisRun`（`update-prompt.js:46`） | 主进程 | 进程内 | 同一次运行只弹一次 |
| 面板 / 引导 / 卡的位置 | 不存储 | — | 每次显示时重算 | 面板跟图标（`tray-menu.js`）、引导居中、卡片右下角（`update-prompt.js:76-82`） |

### 4.1 偏好写入的三条路径（决定「谁会立刻看到变化」）

| 路径 | 写法 | 是否广播 | 谁在用 |
| --- | --- | --- | --- |
| `settings.applyPatch(patch)` | `writePrefs` → 合并 → 发给设置窗 + `broadcastPrefs` | 是（`main/settings.js:173-190`） | 设置中心、首次引导（`main/onboarding.js:85`） |
| `savePrefs()`（球自己的写） | 直接 `writePrefs({sizeKey,pinned,position})` | 否（`main.js:373-380`） | 拖拽落点、窗口移动、托盘「置顶」（`main.js:1180`） |
| `writePrefs(...)`（卡片自己的写） | 读旧值再合并写 `updatePrompt` | 否（`update-prompt.js:163-169`） | 只有「稍后」 |

- 底层落盘是「临时文件 + fsync + rename」，权限不足时静默放弃、保留旧文件（`main/paths.js:42-64`）。
- `writePrefs` 用 schema 的 `filterPatch` 丢掉未知键，所以「写了不存在的键」不会留下死配置（`main/paths.js:100-109`）。
- 前两条的区别就是 §8 第 2 条的根因：不经 `applyPatch` 的写入不会发 `settings:changed`。

## 5. 状态与异常矩阵

| 场景 | 当前表现 | 实现位置 | 备注 |
| --- | --- | --- | --- |
| 球窗口加载中 | `show:false`，`ready-to-show` 后才 `showInactive()`，透明底无白闪 | `main.js:467`、`:536-542` | 不抢焦点 |
| 启动即无表情 | HTML 自带 `state="idle"`，总线初值也是 `idle` | `index.html:12`、`main/face-bus.js:24` | 不会出现空窗 |
| 球未贴边 | 气泡永不显示（`bubbleAllowed=false`） | `renderer.js:38-54` | 设计如此：自由摆放时气泡没有归属 |
| 球贴边 | 悬停展开后通知 `…-open`，气泡立刻说当前表情 | `main.js:821-851`、`renderer.js:191-199` | — |
| 贴边后光标仍在边缘 | 不展开，必须先离开一次（`dockArmed`） | `main.js:722`、`:834-845` | 这是首版「一放下就弹开」的回归保护 |
| 拖拽中 | 尺寸更新与 `fitBall()` 被忽略；窗口 16ms 跟手且宽高固定；不穿透 | `renderer.js:171-176`、`:225-226`、`main.js:609`、`:879-888` | 防跨屏缩放导致球越拖越大 |
| 拖到边缘 8px 内 | 停靠左/右并半隐；否则清贴边态并写 `position` | `main.js:891-908` | 拖拽只触发左右；top 只能由设置的贴边侧（top/left/right/none）指定，bottom 仅代码兜底 |
| `displayMode='island'` | 球窗口存在但隐藏；岛显示 | `main.js:1138-1144` | 窗口不销毁，位置与页面状态保留 |
| 全屏应用运行 | `hideFullscreen` 只隐藏岛，球照旧 | `main.js:1381-1399` | 球不参与全屏隐藏 |
| 托盘不提供图标矩形 | 面板落到工作区右下角（距边 12） | `tray-menu.js:28-33`、`:44` | 平台差异兜底 |
| 面板刚关闭（<250ms）又点图标 | 本次点击判为关闭，不重开 | `tray-panel.js:57-61`、`main.js:1506-1519` | 否则菜单点不掉 |
| 面板 show 后 200ms 内 blur | 忽略这次 blur | `tray-panel.js:120-125` | Windows 激活抖动 |
| 面板任一行被点 | 先 `hide()`，再执行副作用；异常只 `console.warn` | `tray-panel.js:158-178` | 不留半开面板 |
| `trayIcon=false` | 图标销毁、面板关闭；球的右键仍可打开面板 | `main.js:1322-1331`、`:1638-1644` | 所以面板不是「只有托盘能到」 |
| 引导已完成 | 不创建窗口 | `main/onboarding.js:153-157` | 没有第二次入口 |
| 引导取初值失败 | 页面沿用自带默认值 `island` + `frost`，仍能走到完成 | `onboarding.js:118-125` | `get()` 的结果 `catch(() => null)`；此时点「完成」写的是默认值而不是当前 prefs，见 §8 第 17 条 |
| 引导连点完成 | `finished` 守卫，只写一次 | `onboarding.js:31-33`、`:71-74` | — |
| 面板打开时系统主题切换 | `nativeTheme` 的 `updated` 事件重发一次状态，页面只换 `data-theme` | `tray-panel.js:185`、`tray.js:17` | 偏好固定主题时仍按偏好 |
| 球窗口收到尺寸变更 | 拖拽中忽略；否则夹到 48–240 后重设 `--ball-size` | `renderer.js:171-176` | `size:changed` 由 `setSize()` 发（`main.js:622`） |
| 球被拖到另一块屏幕 | 拖拽用 `setBounds` 固定宽高（用 `setPosition` 会让 OS 按新屏缩放挑尺寸，球越拖越大） | `main.js:869-888` | 拖完不迁移「显示在哪块屏」的偏好 |
| 显示器被拔掉 / 分辨率变化 | `applyDisplayPreference()` 发现窗口不在目标工作区内，就移到该屏默认角并清贴边态 | `main.js:1430-1455,2388-2390` | 副屏负坐标用绝对坐标比较处理 |
| 更新卡同一次运行第二次推送 | 丢弃并打日志 | `update-prompt.js:136-139` | 后台轮询不会造成弹窗风暴 |
| 更新卡 24h 内 | 丢弃并打日志 | `update-prompt.js:140-144` | 读 `updatePrompt.snoozeUntil` |
| 更新卡 payload 非法 | `normalize()` 返回 null，`notifyAvailable()` 返回 false，不建窗 | `update-prompt.js:63-65`、`:133-135` | `notes` 可缺省 → 只有标题与版本 |
| 更新卡三个出口 | 全部被 IPC 守卫以 frame 理由拒绝，无任何副作用 | 见 SURF-22 | 卡片只能随退出消失 |
| 发布检查失败 | 状态记为 `error`，不弹卡；About 页读快照 | `update-check.js:120-125`、`main.js:2374` | 检查器不阻塞启动（`start()` 内 `unref`，`:133-138`） |
| 打开下载页失败 | 返回 `{ok:false}`，卡不关，用户无提示 | `update-prompt.js:182-185` | 没有错误文案 |
| 球窗口 `sizeKey` 非法 | 回落 `md`（120px） | `main.js:437` | 旧配置不炸 |
| 面板取状态失败（hooks 未注入或抛错） | `state()` 返回 null，`paint(null)` 直接返回，行保持默认 | `tray-panel.js:46-52`、`tray.js:16` | 面板不空白也不报错，代价是版本号/勾选可能为空 |
| 面板首次 show 时页面仍在加载 | 等 `ready-to-show` 再定位、刷新、显示、聚焦 | `tray-panel.js:148` | 避免「先闪一个错位置」 |
| 动作钩子缺失（`hooks.act` 未注入） | 面板先隐藏，随后动作静默不发生 | `tray-panel.js:161-172` | 只打 warn |
| `prefs.json` 读不到 | `readPrefs()` 回落 schema 默认（岛形态、120px、置顶开、穿透开） | `main/paths.js:88-91`、`shared/schema.js:183-236` | 首次运行即这条路径 |

## 6. 功能合同

| ID | 功能 | 入口 | 行为合同（判定条件 / 时序 / 文案 / 数据副作用） | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- |
| SURF-01 | 球窗口恒存、按形态显隐 | 启动 | 无论 `displayMode` 是什么都在启动时建窗；`island` 只 `hide()`，`ball`/`both` 用 `showInactive()`（不抢焦点）；`both` 时岛在上、球在边，互不抢焦点 | 已确认 | `main.js:2351`、`:1138-1144`；`scripts/window-smoke.mjs:1433-1445`（island-only 重启不露出球） |
| SURF-02 | 球窗口与球的尺寸 | 启动、窗口 resize | 窗口边长 = `SIZES[sizeKey]` + (`BALL_PAD`16 + `BUBBLE_ROOM`88)×2 = 尺寸 + 208；球边长 = clamp(窗口短边 − 208, 48, 240)；五档 64/88/120/160/220；球始终是完整的圆，留白属于窗口 | 待验证 | `main.js:70,99,110,411-413,445-446`；`renderer.js:221-233` |
| SURF-03 | 位置恢复与落点 | 启动、拖动结束 | 启动用 `prefs.position`，否则主屏右下角距边 8；拖动结束只在未贴边时写 `position` | 待验证 | `main.js:415-419,442,373-380,900-906` |
| SURF-04 | 点击穿透 | 光标移动 | 每 60ms 读屏幕光标；到球心距离 ≤ `dim/2` 即 `setIgnoreMouseEvents(false)`，否则按 `prefs.clickThrough`（默认穿透）；拖拽中一律不穿透 | 已确认 | `main.js:571-613`；`test/window-state.test.mjs:16-53`；`test/security.test.mjs:153-156` |
| SURF-05 | 拖拽与「戳一下」 | 左键按下并移动 | 位移 ≤4px 不算拖拽（避免长按发位置流）；>4px 才 `drag:start`；主进程 16ms `setBounds`（宽高固定）；释放时位移 <4px 走 `pet:action`，主进程随机发 `bounce`/`spin`/`burst` | 待验证 | `renderer.js:61-118`；`main.js:860-889`；`main.js:1645-1649` |
| SURF-06 | 拖到边缘即停靠 | 拖拽释放 | 窗口左边 ≤ 工作区左 + `EDGE_SNAP`(8) → 停左；`x+dim` ≥ 右 − 8 → 停右；其他情况清贴边态 | 已确认 | `main.js:891-908`；`scripts/ui-check.mjs:58-69`（拖到右边→`docked=right`，窗口越过屏幕边缘） |
| SURF-07 | 半隐与悬停展开 | 停靠后光标 | 停靠后只留 `peek=0.5×dim` 在屏内（窗口其余部分在屏外）；光标离开过 sliver 才 `arm`；再次悬停（140ms 轮询）移到「全露」坐标并通知 `side-open`；离开回到「半隐」并通知 `side` | 已确认 | `main.js:690-727,765-856`；`scripts/ui-check.mjs:71-86` |
| SURF-08 | 气泡 | 贴边状态下的表情变化 | 只在贴边时可见；文本 = `KAOMOJI[state]`，无映射则为空串（气泡隐藏，不回退成随机文案）；显示 3400ms 后自行隐藏；`dock` 变化时立刻用当前表情重说一次；解开贴边立刻隐藏；`aria-live="polite"` | 待验证 | `renderer.js:31-54,140-152,185-199`；`faces.js:136-138`；映射表有测试 `test/face-sync.test.mjs:95-110`，时序无测试 |
| SURF-09 | 表情单一来源 | 任意表情变化 | 主进程 `faceBus` 持有 `{state,source,at,seq}` 并一次广播给球与岛；球只 `ball.state=state` + 念颜文字 + 可选 `play(motion)`；渲染层不得上报表情，不得自跑心情时钟；重载窗口在 `did-finish-load` 后由 `resend()` 补齐 | 已确认 | `main/face-bus.js:23-91`；`main.js:921-960,1652-1660`；`test/face-sync.test.mjs:32-91,113-129` |
| SURF-10 | 一次性动作与减少动态 | 主进程下发、设置开关 | `state:action` 只接受 `bounce`(0.5)/`spin`(1.5)/`burst`(18) 三种；`reduceMotion===true` 或 `motion===false` 时给球加 `paused` 属性（呼吸/跳动停止，状态变化仍画） | 待验证 | `renderer.js:24-29,156-160`；球侧无测试（岛侧的同类 paused 有 `scripts/window-smoke.mjs:171-194`） |
| SURF-11 | 角色切换同步 | 设置「角色与表情」 | `cast:changed` → `ball.cast=id`；主进程同时换托盘图与 tooltip、并重播当前表情，让招牌表情池生效 | 待验证 | `renderer.js:163-169`；`main.js:348-365` |
| SURF-12 | 托盘面板开关 | 点托盘图标、右键球 | 左键与右键图标都 `toggle`；面板开着时再点图标 → 关；刚关 250ms 内的点击算「关」不算「开」；窗口 blur（`shownAt` 200ms 之后）即隐藏；Esc 关；点任一行先隐藏再执行 | 待验证 | `main.js:1476-1519,1638-1644`；`tray-panel.js:27-34,120-125,137-178` |
| SURF-13 | 面板定位 | 每次显示 | 水平以图标中心对齐并夹紧到工作区（`EDGE=8`）；垂直优先「有余量的一侧」（图标在上半屏→面板在下方，反之在上方），两侧都不够时夹到 `EDGE`；无锚点/零尺寸矩形 → 工作区右下角（`CORNER=12`）；工作区比面板小时贴左上 | 已确认 | `tray-menu.js:14-19,28-33,43-67`；`test/tray-menu.test.mjs:10-61`（7 例） |
| SURF-14 | 面板内容与主题 | 面板显示/刷新 | 头部 20px 角色 + `EmojiTot` + 角色中文名 + `v<app.getVersion()>`；三行 40px：设置… / 置顶（`aria-checked` = `prefs.pinned`）/ 退出；主题只由主进程解析后下发（`theme=light` 或 `system`+系统浅色 → `data-theme=light`），系统主题变化时重发 | 待验证 | `tray.html:14-32`；`tray.js:15-22`；`main.js:1161-1173`；`tray-panel.js:185` |
| SURF-15 | 面板键盘 | 面板打开 | 打开即聚焦第一行；`ArrowUp/Down` 环绕、`Home/End`、`Esc` 关闭；`Enter/Space` 用按钮原生激活；`Tab` 不拦截；焦点环 2px 内描边（面板即窗口，外环会被裁） | 待验证 | `tray.js:24-58,66-67`；`tray.css:152-163` |
| SURF-16 | 三行语义 | 点击/Enter | 设置… → `settings.create('general')`；置顶 → 翻转 `pinned`（写 prefs + `setAlwaysOnTop`）；退出 → `app.quit()`；`tray:act` 只接受这三个值，其余被守卫拒绝 | 待验证 | `main.js:1184-1195,1176-1181`；`tray-panel.js:25,158-173` |
| SURF-17 | 引导触发与退出 | 启动最后一步 | `onboardingDone !== true` 才建窗（780×630，主屏居中，frame:false，deep color `#101114`）；两页：欢迎 → 形态与皮肤；完成/跳过/Esc 都关窗；没有第二次入口 | 待验证 | `main/onboarding.js:41-42,91-157`；`main.js:2432` |
| SURF-18 | 引导写入范围 | 完成 / 跳过 | 跳过只写 `{onboardingDone:true}`，绝不自作主张选形态或皮肤；完成时仅当值在 `DISPLAY_MODES`(island/ball/both) 与 `SKINS`(frost/solid/plain) 白名单内才写；统一走 `settings.applyPatch()`，因此立即作用于运行中的应用并广播；同一窗口只写一次 | 待验证 | `main/onboarding.js:27-28,54-70,83-89`；`main/settings.js:173-190`；`onboarding.js:71-84` |
| SURF-19 | 引导键盘可达 | 全程 | 打开时焦点在「开始」；切到第二页后焦点落在「完成」；Tab 依次可达「开始/稍后再说」与「完成/跳过」；Esc 等同「跳过」 | 待验证 | `onboarding.js:63-69,92-95,112-116,128` |
| SURF-20 | 更新卡出现条件 | 发布检查器 | 只有 GitHub latest 为正式版且版本号大于当前版本才调 `notifyAvailable({version,notes})`；payload 归一化：版本去 `v`、≤32 字符，要点取前 2 条、每条 ≤160、空白丢弃；下载地址是常量 `RELEASES_URL`，绝不从 payload 取 | 已确认 | `update-check.js:67-72,88-131`；`test/update-check.test.mjs:45-66`；`update-prompt.js:33-34,56-74` |
| SURF-21 | 更新卡去重与「稍后」 | 推送 / 点稍后 | 同一次运行只弹一次，第二次推送丢弃并打日志；「稍后」写 `updatePrompt.snoozeUntil = now + 24h` 并关窗；有效期内的推送直接丢弃 | 待验证 | `update-prompt.js:44-54,133-151,163-169` |
| SURF-22 | 更新卡三个出口 | 稍后 / 打开下载页 / Esc | 三个按钮各发一个 `invoke`（`update:snooze`、`update:open`、`update:close`），预期分别：写 24h、`shell.openExternal` 并关窗、关窗。**现状：`FRAME` 只登记了 ball/island/settings/tray（`main/ipc-frame.js:2-6`），没有 `update`，`frameMatches('update', …)` 恒为 false（`:8-11`），守卫在角色检查之后就以 frame 理由拒绝（`main/ipc-guard.js:77-81`），三个出口全部返回 null、无任何副作用。引导窗做过同样的登记（`main/onboarding.js:36`），更新卡漏了。** | 开发中 | `update-prompt.js:104-115,206-213`；`preload-update.js:10-22`；对比 `onboarding.js:36`；未在真机点按复核（未验证） |
| SURF-23 | 更新卡版式 | 卡片显示 | 窗口 320×200，主屏工作区右下角、距边 24；卡片同尺寸、深色、圆角 12、180ms 入场上移 6px + 0.985 缩放；版本号大号强调色；要点最多 2 条、第 2 条降级为次要色、每条最多两行（`line-clamp:2`）；两个按钮 32px 高，主按钮吃剩余宽度 | 待验证 | `update-prompt.js:28,76-82,84-124`；`update.css:50-70,95-129,136-168`；无测量记录（`docs/UI-AUDIT.md` 只量岛与设置窗） |
| SURF-24 | 测试注入（实验） | 环境变量 | 仅当 `EMOJITOT_UPDATE_TEST` 存在：启动 1500ms 后推 1 次，再按 900ms 间隔推第 2..n 次（n 夹在 1..5）；payload 固定 `0.6.6` + 两条中文要点；测试模式下「打开下载页」只 `console.log` 目标地址、不真开浏览器 | 实验性 | `update-prompt.js:36-41,49,171-175,195-204`；注意固定版本 0.6.6 低于当前 0.8.20（`package.json:4`） |

### 6.1 关键时序与常量

| 时序 / 常量 | 值 | 含义 | 证据 |
| --- | --- | --- | --- |
| 穿透轮询 | 60ms | 判断光标是否落在球上 | `main.js:612` |
| 悬停轮询 | 140ms | 判断贴边 sliver 是否被悬停 | `main.js:850` |
| 拖拽帧 | 16ms | 窗口跟手移动 | `main.js:888` |
| 拖拽阈值 | 4px | 未超过就判为「戳一下」 | `renderer.js:86` |
| 停靠阈值 | 8px | 释放时距边多近算停靠 | `main.js:113,898-899` |
| 半隐比例 | 0.5 | 留半个球在屏内 | `main.js:114,694` |
| 尺寸夹紧 | 48–240px | 球的边长上下限 | `renderer.js:222` |
| 气泡停留 | 3400ms | 到点自动隐藏 | `renderer.js:53` |
| 面板重开保护 | 250ms | 刚关闭后的那次图标点击算「关」 | `tray-panel.js:32` |
| 面板 blur 宽限 | 200ms | show 之后忽略激活抖动 | `tray-panel.js:34,120-125` |
| 引导窗口 | 780×630 | 主屏工作区居中 | `main/onboarding.js:41-42,128-140` |
| 更新卡 | 320×200，距边 24 | 主屏右下角 | `update-prompt.js:28,76-82` |
| 「稍后」 | 24h | 写 `snoozeUntil` | `update-prompt.js:31` |
| 发布检查 | 6h 周期 / 8s 超时 | 定时与单次请求上限 | `update-check.js:11,93` |
| 测试注入 | 1500ms 首发 + n×900ms，n∈1..5 | 卡片出现与「同 run 重复推送」 | `update-prompt.js:197-202` |

## 7. 不可随意改变

1. **球窗口是透明的、不请求系统材质**：`systemMaterial()` 恒返回 `none`（`main.js:431-433`），加 `backgroundMaterial` 会漏出一块矩形模糊（`main.js:459-466` 有原因）。
2. **窗口 = 球 + 208 的留白**（16 动画边距 + 88 气泡空间，四边）：缩到「刚好包住球」会让跳动被窗口边裁掉，贴边时的干净圆弧也会变成一条直边（`main.js:90-99,101-110`）。
3. **贴边只有半隐与全露两态，且放下后必须「离开过一次」才展开**（`main.js:160-171,722,834-845`）。这是首版「一放下立刻弹开」的修复。
4. **拖拽期间窗口对鼠标不透明**：`passThroughWhileDragging()` 先于指针与偏好作答，否则抓取点落后几像素就会把 pointerup 交给桌面（`main/window-state.js:13-26`，回归见 `test/window-state.test.mjs:34-47`）。
5. **表情只在主进程产生**：球页面只消费 `face:apply`，不得上报、不得自跑心情时钟、不得新增第二个表情通道（`renderer.js:131-152`、`preload.js:18-29`，源级红线 `test/face-sync.test.mjs:113-129`）。
6. **气泡只说颜文字**：文本只来自 `faces.js` 的 `KAOMOJI`（`renderer.js:145-148`），主进程带来的 `tips` 球页面不读；不要把它改成情绪描述文案（`faces.js:129-138` 的取舍说明）。
7. **右键球 = 同一个托盘面板**（`main.js:1638-1644`）：不要再加第二个上下文菜单，否则文案与主题会分叉。
8. **托盘面板只保留三行**：设置 / 置顶 / 退出；其他持久设置属于设置中心（`main.js:1149-1159` 的理由）。面板 200×164 = 32 头部 + 3×40 行 + 6×2 内边距（`tray-panel.js:19-22`），1px 线是 inset 阴影而非 border（`tray.css:1-9`）。
9. **引导的两种结局不等价**：跳过只写 `onboardingDone`，完成才写 `displayMode`/`skin`（`main/onboarding.js:46-60`）。
10. **更新卡不接收 URL**：`RELEASES_URL` 是常量（`update-prompt.js:33-34`），payload 只允许 `version` + ≤2 条 `notes`；卡片用 `textContent` 绘制（`update.js:16-27`），release note 里的标记只能是文本。
11. **六个窗口全部 `sandbox:true` + `contextIsolation:true` + `nodeIntegration:false`**，且每个 preload 只暴露自己页面用的几个调用（`main.js:468-484`、`tray-panel.js:109-114`、`onboarding.js:116-121`、`update-prompt.js:104-109`；`test/security.test.mjs:152-174` 覆盖了其中四份，托盘与引导未纳入该断言，见 §8）。
12. **四个尺寸是版式契约**：球窗口方形、托盘 200×164、引导 780×630、更新卡 320×200（`tray-panel.js:19-22`、`main/onboarding.js:41-42`、`update-prompt.js:28`）。改尺寸要同时改 CSS、窗口与定位。
13. **面板打开时必须把焦点放进第一行，且焦点环内描边**（`tray.js:66-67`、`tray.css:152-163`）：面板就是整个窗口，外描边会被裁掉，键盘用户会看不出 Enter 会跑哪一行。
14. **引导的「跳过」与 Esc 是同一语义**（`onboarding.js:94-95,112-116`）：两者都只写「看过了」，不要给其中一条加额外副作用。

## 8. 已知缺口与风险

1. **更新卡三个出口全部被 IPC 守卫拦截（最重）**：`FRAME` 无 `update` 键（`main/ipc-frame.js:2-6`），因此「稍后」「打开下载页」「Esc」都不生效，卡片只能等应用退出。按代码判定成立，未在真机点按复核（未验证）。修复方式已被引导窗示范：在自己的模块里补 `FRAME.update = /^file:\/\/.*renderer[\\/]update\.html$/i`（模式见 `main/onboarding.js:36`）。
2. **托盘「置顶」不广播给设置窗**：`togglePinned()` 走 `savePrefs()` 直写（`main.js:1176-1181,373-380`），而 `settings:changed` 只在 `settings.applyPatch()` 里发（`main/settings.js:173-190`）；设置页只在该事件里重绘（`renderer/settings.js:2768-2773`），重开设置窗也不会重取（`main/settings.js:102-108`）。推断：从托盘改置顶后，设置里的「始终置顶」可能显示旧值。未真机复核。
3. **文档说岛右键有托盘菜单并含「切到球形态」，代码里没有**：`docs/ISLAND.md:47,89` 如此写；实际岛渲染层没有 contextmenu 监听，面板三行也没有形态项（`main/tray-panel.js:25`）。以本文件为准。
4. **窗口与 preload 数量在文档里是旧的**：`docs/ARCHITECTURE.md:13-22` 写「桌面端四个窗口」「四个 preload」，`docs/SECURITY.md:36` 同样按四个窗口写；实际 6 个窗口（+首次引导、+托盘面板）与 6 个 preload（`src/preload*.js`）。
5. **设置「托盘」页的说明文案与本模块行为不符**：页面写「原生托盘上下文菜单」「右键打开 / 单击恢复 / 双击设置 / 单实例」（`renderer/settings.js:1401-1403`、`renderer/i18n.js:589-591`），实际是自绘窗口、左右键都开面板、无双击语义（`main.js:1487-1488`、`main/tray-panel.js`）。归属设置模块，但描述的是本模块。
6. **界面语言只覆盖设置窗**：`shared/schema.js:199-206` 明确写了岛、托盘、更新卡与引导未接 `lang`；因此托盘/引导/更新卡文案是硬编码中文（`tray.html:22,26,31`、`onboarding.html:44-45,75-76`、`update.html:13,18,19`），而设置里的托盘预览会随语言变英文（`i18n.js:1142-1144`）。
7. **键盘可达性的硬缺口**：球没有任何键盘入口；唯一退出路径是托盘面板（或任务管理器）。全局快捷键 `Alt+Shift+T` 只切岛（`main.js:1338-1341`）。托盘面板本身键盘可用（`tray.js:35-58`），但 `Tab` 未拦截（`tray.js:53`），推断：焦点移出页面会触发 blur → 面板关闭（`tray-panel.js:120-125`），未真机验证。托盘图标的键盘可达性依赖 Windows 通知区域（Win+B），属平台行为（未验证）。
8. **无障碍细节未验证**：面板是 `role="menu"` 但没有 `aria-activedescendant`，置顶行用 `role="menuitemcheckbox"` + `aria-checked`（`tray.html:13,24`）；更新卡是 `role="dialog"` 但无 `aria-modal`、无焦点陷阱，且刻意不在打开时聚焦（`update.js:40-42`）。三者都没有读屏与放大镜下的验收记录（未验证）。
9. **更新卡没有错误反馈**：`shell.openExternal` 失败时返回 `{ok:false}`、卡片不关、页面也没有错误文案（`update-prompt.js:182-185`）。
10. **测试注入的版本是旧的**：`TEST_VERSION='0.6.6'`（`update-prompt.js:37`）低于当前 0.8.20（`package.json:4`），且由于 §8 第 1 条的拦截，注入只能证明「卡片出现」，证明不了任何按钮。
11. **死代码与未用数据**：`main.js:88` 的 `BUBBLE_SPACE=46` 没有任何引用（真正留白来自 `BUBBLE_ROOM=88`）；`onboarding:get` 返回 `version`（`main/onboarding.js:167`）但页面没有对应节点；`faces.js` 的 `STATE_TEXT`/`STATE_LABEL` 球页面未使用。
12. **窗口层级不统一**：球建窗时 `'floating'`（`main.js:534`），而 `togglePinned`/`applyWindowFlags` 用 `'screen-saver'`（`main.js:1178,1413`），面板用 `'pop-up-menu'`（`tray-panel.js:116`）。同一次置顶翻转会换层，是否造成「面板被球压住」未验证（未验证）。
13. **多屏 / 高缩放下的贴边只有单屏 100% 的验收**：`ui-check.mjs` 在一台显示器上跑；负坐标副屏、140% 缩放、任务栏在侧边时的 `openPosition`/`closedPosition` 未验证（未验证）。
14. **托盘与引导模块不在安全测试的四文件清单里**：`test/security.test.mjs:158-174` 只检查 `main.js`/`main/island.js`/`main/settings.js`/`main/update-prompt.js` 的 sandbox 与 guard 用法；`main/tray-panel.js`、`main/onboarding.js` 虽然实现相同（`sandbox:true`、只用 `guard.*`），但没有对应断言。
15. **面板状态取不到时没有任何提示**：`state()` 抛错被吞成 null（`tray-panel.js:46-52`），面板会显示空版本、置顶不勾，而界面上没有任何「读取失败」的表达（未验证视觉效果）。
16. **引导没有「再看一次」的入口**：`maybeShow()` 只在启动调用一次（`main.js:2432`），模块导出也只有 `registerIpc / maybeShow / sendCast`（`main/onboarding.js:179`）。产品上是否需要「设置里重看引导」未定，当前用户只能改 `prefs.json`。
17. **引导取初值失败时，「完成」会写回默认值**：页面里 `choice` 的初值是 `island` + `frost`（`onboarding.js:31`），只有 `get()` 成功才被当前 prefs 覆盖（`:118-125`）；而「完成」提交的就是 `choice`（`:71-84`）。所以取初值失败后点完成，会把一个原本 `both`/`solid` 的 profile 改回 `island`/`frost`。触发条件很窄（IPC 失败），但语义上「完成」不再等于「保留原样」；未真机验证触发路径。
