# EmojiTot 全站基准地图

> **这是什么**：系统里有什么、在哪实现、状态如何、依赖什么、哪些不能乱动。给用户看全貌，给后续 AI 看事实起点。
> **功能合同**（每个功能必须怎么表现、验收条件、当前到哪一步）在 [../FEATURE-BASELINE.md](../FEATURE-BASELINE.md)。
> **核对基准**：HEAD `bb435d1`（tag `v0.8.20.26`），核对时间 2026-11-25 19:00（Asia/Hong_Kong）；真机闸门结果同日实测。
> **边界**：本目录记录的是本项目当前事实，不是规则来源；行为规则在仓库 `AGENTS.md` 与用户级 `~/.agents/AGENTS.md`。本目录也不取代 PRD、设计规范、测试与 Git 历史。

## 0. 怎么用、怎么维护

- 想知道某个界面/功能在哪实现 → 先看 §3 入口索引，再进对应模块文件。
- 准备改界面或行为 → 先读该模块的「不可随意改变」，再读功能基准里对应 ID 的合同；改完按 §10 的同步清单更新。
- **必须更新本目录的时机**：新增/删除窗口、页面、服务、数据文件、IPC 通道；某条状态从「开发中/待验证」变成「已确认」；闸门结果变化；发布新的正式版本。
- **机器生成、不要手改**：`docs/SETTINGS-AUDIT.md`（`pnpm settings:audit` 生成，`--check` 校验）、`docs/ARCHITECTURE.md` 与两份 README 里的 `<!--facts:...-->` 数字（`pnpm docs:sync` 生成，`--check` 校验）。
- 本目录的事实只认三个来源：**当前代码**、**可运行的测试/闸门**、**有日期的验收记录**。三者冲突时以代码 + 闸门为准，并在 §9 记下差异。

## 1. 状态图例

| 状态 | 含义 | 证据要求 |
| --- | --- | --- |
| 已确认 | 当前代码可达，且行为已被自动化测试或可查验收记录固定 | 测试文件 或 `docs/UI-AUDIT.md`、`design-qa.md`、`docs/LIVE-COVERAGE.md` 中的记录 |
| 开发中 | 代码路径存在但用户拿不到完整效果（TODO、占位、未接数据、只有半条链路） | 指出缺口位置 |
| 待验证 | 代码可达，但既无测试覆盖，也无验收记录 | 写明「未验证」 |
| 实验性 | 只在环境变量、开发参数或明确实验开关后可用 | 指出开关名 |
| 已废弃 | 用户路径不可达，或已被新实现替代但仍留在代码里 | 指出替代者 |

证据写法：`test:<文件>`、`doc:<文档>`、`code:<路径:行号>`、`实测:<命令与结果>`。

## 2. 一页看全站

```
EmojiTot（Electron 45，只发布 Windows）
├─ 主进程  apps/desktop/src/main.js
│  ├─ 窗口 ×6：球 / 灵动岛 / 设置中心 / 托盘面板 / 更新卡 / 首次引导（§3 入口索引）
│  ├─ 托盘：原生菜单（右键）+ 自绘面板（键盘可操作，200×164）
│  ├─ 服务层 apps/desktop/src/main/services/：28 个 .js + 18 个 .ps1（§6 数据表）
│  ├─ 存储：%APPDATA%/EmojiTot/（prefs / state / cache-* / secrets / mail / shelf …）
│  └─ 横向能力：更新检查、face-bus 表情广播、Agent 状态显示、全屏隐藏、自动避让、
│              开机启动、单实例、全局快捷键、窗口状态记忆
├─ 渲染层 6 个 preload 暴露面：petAPI / islandAPI / settingsAPI / trayAPI / updateAPI / onboardingAPI
├─ packages/core     确定性 SVG 渲染（4 层）+ 浏览器运动运行时（眼型拓扑 / 弹簧 / 状态机）
├─ packages/protocol 两位数情绪协议：parse（容错解析）→ arbitrate（优先级仲裁）→ channel（事件桥）
└─ apps/gallery      GitHub Pages 站点：console / gallery / scene / docs 四视图，hash 路由
```

数据从外部到屏幕只有一条路（`docs/ARCHITECTURE.md`「一条数据流」）：

```
外部输入（文件 / 事件 / 点击）
  → protocol.parse     两位数或状态名 → 一个 StateId（不认识的 id 也能落段）
  → protocol.arbitrate 按优先级与停留期决定「现在显示谁」，更紧急的可立即打断
  → core.render        { body, color, traits, state } → 确定性 <svg>
  → core/runtime       状态 + 眼型 + 弹簧姿态 → 可暂停的实时 SVG
  → 宿主              设置窗/岛/球写 DOM，或外部宿主直接嵌 SVG
```

## 3. 用户可见入口索引

| # | 入口 | 形态 / 尺寸 | 怎么打开 | 代码入口 | 详情 |
| --- | --- | --- | --- | --- | --- |
| 1 | 桌面球 | 无边框、透明、置顶；尺寸 `xs–xl` 64–220px（`main.js:70`），外框再加 `BALL_PAD 16` / `BUBBLE_ROOM 88` | 启动；或设置/托盘切到球形态 | `src/renderer/index.html` + `renderer.js`，窗口 `main.js:435` | [05](05-ball-tray-onboarding.md) |
| 2 | 灵动岛 · 收起胶囊 | 顶部居中、按内容长宽；窗口 = 内容 + 左右 32 / 上下 36（`main/island.js:28,31`） | `displayMode` 为 island/both 时启动即出现 | `src/renderer/island.html`，窗口 `main/island.js:333` | [02](02-island.md) |
| 3 | 灵动岛 · 展开面板 | 用户岛宽（默认 420，`schema.js:227`）；页面区是固定 260px 视口，面板总高 = 顶栏 + 260 + 底栏 | 左键点胶囊 | 页面注册表 `schema.js PAGE_MANIFEST`（11 页） | [02](02-island.md) |
| 4 | 设置中心 | 固定 1080×760，不可缩放（`main/settings.js:109–124`） | 托盘菜单 / 岛顶栏齿轮 / 快捷键 | `src/renderer/settings.html`，导航 `schema.js SETTINGS_NAV`（16 页） | [03](03-settings.md) |
| 5 | 托盘面板 | 自绘弹层 200×164（`main/tray-panel.js:18–22`），方向键+Enter+Esc | 左键托盘图标 | `src/renderer/tray.html`，窗口 `main/tray-panel.js:92` | [05](05-ball-tray-onboarding.md) |
| 6 | 托盘原生菜单 | 系统菜单 | 右键托盘图标 | `src/main/tray-menu.js` | [01](01-runtime.md) |
| 7 | 更新卡 | 320×200，贴工作区右下角（`main/update-prompt.js:28,79`） | 主进程检测到新版本时弹出，每次运行最多一次 | `src/renderer/update.html`，窗口 `main/update-prompt.js:86` | [05](05-ball-tray-onboarding.md) |
| 8 | 首次引导 | 780×630 居中（`main/onboarding.js:41–42`） | 首次启动且 `onboardingDone` 为 false | `src/renderer/onboarding.html`，窗口 `main/onboarding.js:97` | [05](05-ball-tray-onboarding.md) |
| 9 | Web 站点 | 四视图 + 中/英切换 | 打开站点根路径 | `apps/gallery/src/main.ts`（`routes` 表） | [06](06-web-release.md) |
| 10 | 外部协议注入 | 一个状态文件或一次进程调用 | 宿主写 `state.json` 或直接调 `@emojitot/core` | `main.js applyStateFile()`、`packages/protocol` | [01](01-runtime.md) / [04](04-engine.md) |

「悬浮气泡 / 说话」等球窗口内的小状态不单列入口，见 [05](05-ball-tray-onboarding.md)。

## 4. 模块文件索引

| 文件 | 覆盖 | 不覆盖（看这里） |
| --- | --- | --- |
| [01-runtime.md](01-runtime.md) | 主进程、窗口容器、IPC 守卫、preload 暴露面、服务层、存储路径、托盘、更新、引导、生命周期 | 各窗口内部 UI → 02/03/05 |
| [02-island.md](02-island.md) | 灵动岛：11 个功能页、5 个状态组件、媒体/歌词、通知插页、尺寸与穿透、分页 | 设置项定义 → 03 |
| [03-settings.md](03-settings.md) | 设置中心 16 页、偏好 schema、四套方案、敏感值存储、审计矩阵 | 服务实现 → 01 |
| [04-engine.md](04-engine.md) | core 渲染四层与运动运行时；protocol 解析/仲裁/事件桥；对外入口与 CJS 构建 | 桌面端如何用它 → 01/02 |
| [05-ball-tray-onboarding.md](05-ball-tray-onboarding.md) | 球窗口、托盘面板与原生菜单、首次引导、更新卡、对应 preload | 岛与设置 → 02/03 |
| [06-web-release.md](06-web-release.md) | gallery 四视图、构建脚本、`pnpm check` 闸门、发布与签名、版本号规则 | 桌面端运行时 → 01 |

### 4.1 既有文档各自负责什么

| 文档 | 负责的内容 | 与本目录的关系 |
| --- | --- | --- |
| `docs/ARCHITECTURE.md` | 架构叙事、四层渲染、数据流、取舍 | 本目录只取可验收事实，叙事留在那里 |
| `docs/ISLAND.md` | 岛的形态、位置、交互、页面注册表 | 02 引用它，不重复动画参数 |
| `docs/SETTINGS.md` | 设置信息架构与交互约定 | 03 引用；注意其「可缩放」描述已过时（§9.2） |
| `docs/SETTINGS-AUDIT.md` | **生成物**：偏好 × 默认值 × 页面 × 消费者矩阵 | 03 引用，不手改 |
| `docs/PROTOCOL.md` | 两位数协议的对外报文格式 | 04 引用 |
| `docs/LIVE-COVERAGE.md` | 直播封面在 Windows 上拿得到什么、兜底是什么（实测记录） | 02/05 的证据来源 |
| `docs/UI-AUDIT.md` | `pnpm ui:audit` 的测量契约（11 岛页 + 16 设置页） | 回归时的证据来源 |
| `design-qa.md` | R2 画板 1:1 对照结论与撤回记录 | 视觉验收的证据来源 |
| `docs/UI-DESIGN-BACKLOG.md` | 尚未做设计的界面与排期 | 与功能基准的「开发中」互为参照 |
| `docs/PRIVACY.md` / `docs/SECURITY.md` / `docs/SIGNING.md` | 存什么、存多久；加固记录；签名 | 本目录 §6/§7 的边界说明 |
| `docs/RELEASING.md` / `docs/RELEASE-NOTES.md` / `docs/CHANGELOG.md` | 版本号规则、逐版记录 | 06 引用 |
| `docs/DEVICE-BATTERY.md` / `docs/PERIPHERAL-BATTERY.md` | 设备电量的探测范围与限制 | 02 设备页的证据 |

## 5. 运行时骨架

**主进程承担什么**（`apps/desktop/src/main.js`，约 2500 行）：创建/管理 6 个窗口，托盘与菜单，24 个服务的启停，偏好与状态文件，表情广播（face-bus），Agent 联动，更新检查，全屏隐藏，自动避让，开机启动，单实例，快捷键，窗口状态记忆。

**IPC 不是裸通道**，所有调用过一层守卫（`src/main/ipc-guard.js`）：

- 每个窗口在页面加载前 `claim(role, webContents)`，之后只接受该角色、且 frame 匹配的调用（`ipc-frame.js`）；角色不符直接拒绝并记原因。
- 三种包装：`guardedHandle`（请求-响应）、`guardedSend`（主进程推送）、`guardedSync`（同步读，带 fallback）。
- 载荷上限：默认 64KB（`ipc-guard.js:51`），置物架文件 8MB、事件总线 64KB（`ipc-shape.js:69–70`）。
- 每个 channel 的允许角色与形状在 `ipc-shape.js` 集中声明，preload 只暴露本窗口需要的方法。

**preload 暴露面**（6 个，各自独立）：

| preload | 暴露对象 | 给谁 |
| --- | --- | --- |
| `preload.js` | `petAPI` | 球窗口 |
| `preload-island.js` | `islandAPI` | 灵动岛 |
| `preload-settings.js` | `settingsAPI` | 设置中心 |
| `preload-tray.js` | `trayAPI` | 托盘面板 |
| `preload-update.js` | `updateAPI` | 更新卡 |
| `preload-onboarding.js` | `onboardingAPI` | 首次引导 |

**尺寸只有一个来源**：岛页面用 `ResizeObserver` 量自己，把 `{w,h}` 发给主进程，主进程 `setBounds` 并居中；主进程不硬编码展开宽高（`docs/ARCHITECTURE.md`「岛的尺寸只有一个来源」）。球窗口同理由渲染层上报后留白补偿。

**点击穿透靠轮询**：Windows 上 `setIgnoreMouseEvents(true, { forward: true })` 不保证转发 mousemove，所以主进程轮询光标：球窗口固定 60ms（`main.js startPointerWatch`），岛按指针到画面的距离自适应 25 / 120 / 250ms（`main/island.js startCursorWatch`）。命中判定用**画出来的**内容矩形，不是带 32/36 留白的窗口矩形。

**服务只拥有自己的数据**：每个 `src/main/services/*.js` 只管自己的缓存文件，变化时向岛推快照，岛不轮询（`docs/ARCHITECTURE.md`「服务层」）。

## 6. 数据与存储

全部在 `app.getPath('userData')` 下（Windows：`%APPDATA%\EmojiTot\`，`src/main/paths.js:11`）。写入用「临时文件 + fsync + rename」，磁盘只读时不崩、旧文件保留（`paths.js writeJson`）。

| 文件 / 目录 | 内容 | 写入者 | 敏感度 |
| --- | --- | --- | --- |
| `prefs.json` | 全部偏好；未知键被 `filterPatch` 丢弃 | 设置窗、预设、岛/球写回位置 | 中（含账号开关与路径） |
| `state.json` | 外部可写的角色状态（宿主模式） | 主进程 + 外部宿主 | 低 |
| `cache-weather.json` / `cache-weather-locate.json` | 天气与定位结果 | weather 服务 | 中（含定位城市） |
| `cache-lyrics-*.json` | 歌词缓存（按曲目） | lyrics 服务 | 低 |
| `cache-calendar.json` / `cache-devices.json` / `cache-focus.json` / `cache-health.json` / `cache-todos.json` | 各自服务缓存 | 对应服务 | 低–中 |
| `secrets.bin` | API key / 授权码，Electron `safeStorage` 加密 | quota 等服务 | **高** |
| `mail.json` | 邮箱账号与连接参数 | mail 服务 | **高** |
| `clipboard.json` | 剪贴板历史（置物架开关打开时） | clipboard 服务 | **高** |
| `shelf-groups.json` + `shelf/` | 置物架分组与文件 | shelf 服务 | 中（用户文件） |
| `avoidance.json` | 自动避让/吸附配置 | avoidance 服务 | 低 |

逐文件的读写时机与失败表现见 [01-runtime.md](01-runtime.md) §4；隐私承诺（无账号、无遥测、无云同步）见 `docs/PRIVACY.md`。

## 7. 外部依赖与网络出口

网络请求几乎都走 PowerShell 子进程或 Node 原生 socket：Electron 主进程的 `fetch/https` 共享 Chromium 网络栈，系统代理未开时会超时（`docs/ARCHITECTURE.md`）。

| 用途 | 主机 | 触发 | 是否可关 |
| --- | --- | --- | --- |
| 天气 | `api.open-meteo.com` | 天气页/温度组件刷新 | 关掉页面即停 |
| 自动定位 | `geocoding-api.open-meteo.com`，IP 兜底 `ipinfo.io` / `ipapi.co` / `myip.ipip.net` / `api.bigdatacloud.net` | `weatherAutoLocate` 打开时 | 是 |
| 歌词 | `lrclib.net` | 播放媒体时 | 关歌词页即停 |
| 网易云补充 | `music.163.com` | 检测到网易云时 | 随媒体页 |
| 直播封面 | `douyu.com` / `rpic.douyucdn.cn` / `bilibili.com` | 媒体来源为直播时 | 随媒体页 |
| 更新检查 | `api.github.com` / `github.com` | 启动后与定时 | 是（设置） |
| AI 额度 | `api.deepseek.com` / `openrouter.ai` / `api.siliconflow.cn` / `api.moonshot.cn` | 用户配置 key 后按刷新间隔 | 是 |
| 邮箱 | 用户自己的 IMAP 主机 | 邮箱页启用时 | 是 |
| 日历 | 用户自己的订阅 URL | 日程页启用时 | 是 |

## 8. 质量闸门现状（2026-11-25 实测）

| 闸门 | 命令 | 结果 |
| --- | --- | --- |
| 桌面端单测 | `cd apps/desktop && node --test` | ✅ 565 passed / 149 suites / 0 failed（3.2s） |
| protocol 单测 | `cd packages/protocol && npx vitest run` | ✅ 34 passed（3 files） |
| core 单测 | `cd packages/core && npx vitest run` | ✅ 27 passed（3 files） |
| 偏好矩阵 | `node scripts/settings-audit.mjs --check` | ✅ 81 个偏好路径与文档一致 |
| 文档数字同步 | `node scripts/sync-docs.mjs --check` | ❌ 5 处过期（见 §9.1） |
| 文档事实一致性 | `node scripts/docs-consistency.mjs` | ❌ 4 处（README 下载链接指向 v0.8.20.18） |
| UI 测量审计 | `node apps/desktop/scripts/ui-audit.mjs --exe release/win-unpacked/EmojiTot.exe --json` | ✅ 11 岛页 + 16 设置页，0 违规（岛 88 / 设置 326 个文本节点） |
| 真窗口冒烟 | `pnpm smoke:desktop` | ✅ 36/36（真 Electron + CDP：二次启动、固定 1080×760、示意控件 aria-hidden、11 页管理） |
| 站点浏览器验收 | `pnpm check:gallery` | ✅ 32/32（真 Chrome：四路由、15 角色/61 表情、焦点、375px、interval 清理） |
| 静态渲染 | `pnpm preview` | ✅ 51/51 id、61/61 face，0 失败 |
| 依赖审计 | `pnpm audit:ci` | ✅ No known vulnerabilities |
| 敏感扫描 | `pnpm scan` | ✅ 文本规则 0 FAIL；23 张大图 WARN 未逐张人工复核 |

结论：**代码测试全绿，文档闸门红**。`pnpm check` 因此当前不能通过，卡在 `docs:check`。

## 9. 已知缺口与风险

### 9.1 发布文档漂移（P1，闸门红）

- 事实：HEAD 已打 tag `v0.8.20.26` 且 `apps/desktop/build-info.json` 是 `0.8.20.26`；但 `docs/RELEASE-NOTES.md` 最新条目是 `0.8.20.18`，README 下载链接仍指向 `v0.8.20.18`。
- 事实：`sync-docs --check` 报告 `README.md`、`README.en.md`、`docs/ARCHITECTURE.md` 的 `settingsPages` 仍是 15，实际 16（`SETTINGS_NAV` 三组 6+4+6）。
- 影响：`pnpm check` 红；README 的下载按钮指向旧版。
- 修法：补 `0.8.20.26` 的 RELEASE-NOTES 条目 → `pnpm docs:sync` → 复跑 `pnpm docs:check`。是否已在 GitHub 发布该 Release 本机未验证，发布前需确认，否则链接会死。
- 真机复核（2026-11-25）：点击「稍后」「打开下载页」、按 Esc 均无反应，卡片保持打开；主进程 stderr 输出 `[ipc] refused update:open from update — frame`。

### 9.2 文档与实现对不上的旧描述

- `docs/SETTINGS.md` 写设置窗口「1080×760，可缩放」；实现是固定尺寸、`resizable:false`、`maximizable:false`（`main/settings.js:109–118`）。以 [03-settings.md](03-settings.md) 为准。

### 9.3 平台单点

- 只发布 Windows。除电量/时钟外，平台能力都依赖 PowerShell + WinRT + CIM（`docs/PRIVACY.md`）；非 Windows 未验证，也没有打包目标。

### 9.4 视觉证据不在仓库

- 真机截图与布局度量在 `apps/desktop/.ui-capture/`（被忽略）、临时截图在 `.agents/`（被忽略）。仓库里只有 `docs/screenshots/` 的少量成品图；要复核全量 UI 只能跑 `pnpm ui:audit` 并需要可启动的安装版。

### 9.5 未验证区域（不要当成已完成）

- 跨语言长文本：`design-qa.md` 明确只覆盖中文 + 暗/浅色；其他语言未验证。
- 窄屏：产品定位固定尺寸，无 320px 级布局，未验证也不需要。
- 站点线上：本地 `pnpm preview` 不等于 gh-pages 线上状态；本轮未访问线上。
- 以上 8 项闸门本轮均已跑；仍未验证：跨语言长文本、混合 DPI、线上 gh-pages、23 张 WARN 截图。

## 10. 改动时同步清单

| 你改了什么 | 必须同时更新 | 跑什么 |
| --- | --- | --- |
| 新增/删除岛页 | `schema.js PAGE_MANIFEST` + 岛渲染 + `docs/ISLAND.md` + [02](02-island.md) + 功能基准 | `pnpm test` + `pnpm ui:audit` |
| 新增/删除状态组件 | `STATUS_MANIFEST` + `renderPillStatus` + 02 | `pnpm test`（有遍历注册表的测试） |
| 新增设置项/页面 | `schema.js DEFAULTS + CONSUMERS + SETTINGS_NAV` + 设置页 + [03](03-settings.md) | `pnpm settings:audit` + `pnpm settings:check` |
| 新增服务/数据文件 | `services/` + `enabledServices` + `docs/PRIVACY.md` + [01](01-runtime.md) §4 | `pnpm test` |
| 新增 IPC 通道 | `ipc-shape.js` 角色与形状 + 对应 preload + [01](01-runtime.md) §5 | `pnpm test`（security/ipc 测试） |
| 新增窗口 | `ipc-guard.claim(role)` + preload + 本文件 §3 + 对应模块文件 | `pnpm smoke:desktop` |
| 任何计数/版本变化 | 跑同步，不要手改数字 | `pnpm docs:sync` + `pnpm docs:check` |
| 准备发布 | `docs/RELEASE-NOTES.md`、README 链接、`docs/CHANGELOG.md` | `pnpm check` + `pnpm scan` + 真机装验（`docs/RELEASING.md`） |
