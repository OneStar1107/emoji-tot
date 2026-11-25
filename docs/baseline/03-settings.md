# 设置中心与偏好模型

> 一句话：**全应用只有一份偏好 schema**（`apps/desktop/src/shared/schema.js`，896 行）——默认值、设置页归属、消费者、页面/状态/方案三张 manifest 都在这一份文件里；设置窗口是它唯一的图形写入口，岛、托盘、首次引导与全部后台服务都是只读消费者。实现根目录：`apps/desktop/src/`。

## 1. 范围与边界

本文件覆盖：

- 偏好模型本体：`DEFAULTS` / `CONSUMERS` / `PAGE_MANIFEST` / `SETTINGS_NAV` / `STATUS_MANIFEST` / `PRESET_MANIFEST` / `knownPaths` / `filterPatch` / `enabledServices` / `serviceChanges`。
- 设置窗口本身：主进程窗口、渲染页、预加载桥、三份样式表。
- 「每开关即时写盘」全链路：渲染层 → preload → guarded IPC → `writePrefs` → 跨窗口广播 → 服务重算。
- 敏感值落盘（safeStorage，三份文件）。
- 审计脚本 `scripts/settings-audit.mjs` 与它的产物 `docs/SETTINGS-AUDIT.md`。

本文件**不覆盖**（按需去对应文件，不在本文件重复）：

| 内容 | 去哪看 |
| --- | --- |
| 岛的渲染、页面绘制、动效、胶囊状态组件画法 | `docs/ISLAND.md`；基线「岛与窗口」模块 |
| 托盘菜单与托盘面板 | `apps/desktop/src/main/tray-menu.js`、`main/tray-panel.js`、`docs/ARCHITECTURE.md` |
| 首次引导 | `apps/desktop/src/main/onboarding.js` |
| 更新卡与更新检查 | `apps/desktop/src/main/update-prompt.js`、`main/update-check.js` |
| 各后台服务的内部行为（天气/额度/邮件/日程/设备探测） | `apps/desktop/src/main/services/*.js`、`docs/ARCHITECTURE.md` |
| 隐私与数据保留全量清单 | `docs/PRIVACY.md`（本文件只在 §4 修正与设置直接相关的两行） |
| 界面测量命令、阈值与 JSON 形态 | `docs/UI-AUDIT.md` |
| 生成物：`node_modules`、`dist`、`out`、`release`、`.ui-capture`、`src/renderer/vendor`、`src/vendor` | 只记录「构建产物存在」，不逐行分析 |

## 2. 模块与文件清单

| 模块 | 职责 | 实现位置 | 触发/生命周期 |
| --- | --- | --- | --- |
| 偏好 schema | 默认值 + 每个键的消费者 + 三张 manifest + 纯函数（合并、过滤、启停服务） | `apps/desktop/src/shared/schema.js` | 主进程 `app.whenReady()` 里动态 `import` 后注入 `paths.js`（`main.js:2335`、`paths.js:77-79`）；设置窗作为 ES module 直接 import |
| 设置窗口（主进程） | 建窗、单例复用、`settings:*` IPC、动作转发、向窗口推送 devices / face / cast / update 快照 | `apps/desktop/src/main/settings.js`（363 行） | `settings.registerIpc()` 在 boot 调用（`main.js:2360`）；窗口按需创建 |
| 文件与路径 | `userDir/prefsPath/statePath/cachePath`、原子写、带默认值的读、过滤写过 | `apps/desktop/src/main/paths.js`（111 行） | 所有偏好读写的唯一入口 |
| 敏感值 | safeStorage 包装，`v1:` / `plain:` 前缀 | `apps/desktop/src/main/secrets.js`（33 行） | 由 quota / mail / calendar 三个服务调用 |
| IPC 门禁 | 角色、frame、字节数、形状四道检查；拒绝返回 `null` 而不抛 | `apps/desktop/src/main/ipc-guard.js`（192 行） | 每个 `guardedHandle` |
| 设置页外壳 | 标题栏、左栏、内容列、右预览列的 DOM 骨架 | `apps/desktop/src/renderer/settings.html`（64 行） | `win.loadFile` 载入（`main/settings.js:143`） |
| 设置页渲染 | 左栏导航、16 个页渲染函数、控件工厂、事件委托、下拉 popover、拖拽排序 | `apps/desktop/src/renderer/settings.js`（2789 行） | `load()` 末尾启动（`settings.js:2789`） |
| 设置窗样式 | 基础排布与控件几何 | `apps/desktop/src/renderer/settings.css`（1535 行） | HTML 链接 |
| 主画板主题 | Polar Graphite token 与 `#settings` 覆盖（含 50px 标题栏 + 710px 栅格） | `polar-graphite.css`、`polar-graphite-parity.css` | HTML 链接（`settings.html:9-10`） |
| 词典 | `LANGS`、`MESSAGES`、`translate()` | `apps/desktop/src/renderer/i18n.js`（1214 行） | 每次重绘时 `T()` 现读 `prefs.lang` |
| 预加载桥 | `window.settingsAPI`，24 个方法 | `apps/desktop/src/preload-settings.js`（66 行） | contextIsolation 下注入 |
| 共享读数 | 电量/时间/温度/余额文案，供胶囊与设置预览共用 | `apps/desktop/src/shared/status-view.js` | 设置页与岛同时 import |
| 审计脚本 | 从 schema 生成 `docs/SETTINGS-AUDIT.md`；`--check` 过期即失败 | `scripts/settings-audit.mjs`（169 行） | `pnpm settings:audit` / `pnpm settings:check`（`package.json:30-31`，`check` 链路里：`package.json:32`） |

### 2.1 IPC 通道（渲染进程能对主进程做的全部事情）

设置窗与岛共用这些通道；角色不符、frame 不符、超字节、形状不符都在 `ipc-guard` 被拒并返回 `null`（`ipc-guard.js:69-96`）。

| 通道 | 允许角色 | 行为 | 校验 / 上限 | 位置 |
| --- | --- | --- | --- | --- |
| `settings:get` | settings | 返回补过默认值的 `readPrefs()` | 无参 | `main/settings.js:229` |
| `settings:patch` | settings, island | `writePrefs` + 登录项副作用 + 两个广播 | 必须是普通对象；32KB；再经 `filterPatch` | `main/settings.js:231-239`、`:173-190` |
| `settings:version` | settings | `loadBuildVersion(repo, app.getVersion())` | 无参 | `main/settings.js:241-243` |
| `settings:avoid-apps` | settings | 列出有可见窗口的进程（避让选择器用） | 无参 | `main/settings.js:244` |
| `settings:avoid-icons` | settings | exe 路径 → PNG data URL 映射 | 数组、每项 <400 字符、最多 120、8KB | `main/settings.js:245-248` |
| `settings:displays` | settings | 显示器 id/label/primary/尺寸 | 无参 | `main/settings.js:249-258` |
| `settings:refresh-weather` | settings | 调注入的 `refreshWeather` | `{ok,error}` 结果化，不抛 | `main/settings.js:260-267` |
| `settings:action` | settings | 转发给 `handleSettingsAction`（meta/dock/demo/cast/agent/settings） | kind 白名单；value ≤8KB；dock 值白名单；settings 值 ≤32 字符；agent 必须带合法 id | `main/settings.js:269-280`、`:195-221` |
| `settings:meta` | settings | 同 `action kind=meta`（角色表、演示表、平台能力、更新快照） | 失败返回 `null` | `main/settings.js:282-288`、`main.js:1204-1250` |
| `settings:open-state` | settings | `shell.openPath(statePath())` | 固定路径 | `main/settings.js:290` |
| `settings:open-data` | settings | `shell.openPath(userDir())` | 固定路径 | `main/settings.js:291` |
| `settings:open-repo` | settings | 打开项目 GitHub 主页 | 固定 URL | `main/settings.js:292-293` |
| `settings:openSystem` | island, settings | 只放行 `ms-settings:bluetooth` | 目标白名单 `SYSTEM_SETTINGS` | `main/settings.js:301-311` |
| `app:quit` | settings, island | `app.quit()` | 无参 | `main/settings.js:313` |
| `settings:open` | settings, island | `create(page)` | 页名 `/^[a-z-]{1,32}$/` | `main/settings.js:315-318` |
| `settings:close` / `:minimize` / `:maximize` | settings | 三个窗口动作 | 无参（`:maximize` 不检查 `maximizable`，见 §8-11） | `main/settings.js:320-336` |
| `settings:devices` | settings | 设备快照 | 无参 | `main.js:2146` |
| `settings:devices-refresh` | settings | 触发一次探测并立刻返回当前快照 | 无参 | `main.js:2148-2151` |
| `settings:devices-watch` | settings | 设备页是否在屏（探针需求计数） | 布尔；32B | `main.js:2153-2161` |
| `settings:devices-order` | settings | 只写 `devices.order` | 数组；名字 0–120 字符；去重；最多 200；8KB | `main.js:2172-2185` |
| `settings:devices-pin` | settings | 写 `devices.pinned`（上限 3） | 名字 0–120 字符；512B | `main.js:2187-2190` |
| `settings:devices-hidden` | settings | 写 `devices.hidden` | `{name, hidden:boolean}`；512B | `main.js:2192-2200` |

## 3. 页面 / 窗口 / 条目清单

### 3.1 窗口

| 条目 | 用途 | 入口 / 触发 | 实现位置 | 状态 |
| --- | --- | --- | --- | --- |
| 设置窗本体 | 1080×760、固定、无边框、不透明 | `settings.create(page)` | `main/settings.js:102-158`；尺寸与 `resizable:false` / `maximizable:false` 见 `:109-118` | 已确认（`docs/UI-AUDIT.md:1106` 记录 `1080×760 window`；`security.test.mjs:158-166` 断言 sandbox/contextIsolation） |
| 标题栏（品牌 + 三个窗口按钮） | 拖拽区、最小化、最大化（禁用）、关闭 | HTML 静态 | `renderer/settings.html:15-32` | 待验证 |
| 左栏 | 角色位 + 16 页导航（编号 01–16） | `paintRail()` | `renderer/settings.js:1643-1664` | 已确认（`devices-settings.test.mjs:47-63` 断言 nav 表；`ui-audit.mjs:909-924` 逐页点 `#rail .pgm-rail-item`） |
| 内容列 | 当前页的分组卡片 | `paintContent()` | `renderer/settings.js:1832-1856` | 已确认（页面数由 `ui-audit.mjs:890-964` 对账） |
| 右预览列 | 420×310 逻辑岛的迷你复刻 + 当前页名 + 三个读数 + 前 5 个页面标签 | `paintPreview()` | `renderer/settings.js:1721-1750` | 待验证（无测试；是否显示由 `innerWidth >= 1080` 决定，`settings.js:1801`） |

### 3.2 十六个设置页（逐页控件、写入的键、校验与失败表现）

页表来自 `SETTINGS_NAV`（`schema.js:62-102`，三组共 16 页）；`SETTINGS_PAGE_KEYS`（`schema.js:105`）是唯一平铺清单。**注意：任务简述写作「15 个设置页」，代码与 UI-AUDIT 正文都是 16；`docs/UI-AUDIT.md:69` 的 JSON 样例仍写 15，是旧样例。**

所有真实控件的共同校验与失败表现，写在这里一次，下表的「状态」列只写差异：

- 输入路径：`content` 上的 `change` 委托 → `patch(setPath(key, value))`（`settings.js:2387-2403`）；`range`/`number` 转 `Number`；`displayId` 的字符串 `'null'` 转 `null`（`:2392-2395`）。
- **没有本地校验**：数值范围只由 `<input min max>` 的 HTML 属性限制（`radius` 12–30、`uiScale` 80–140），越界值不经二次钳制就进 `prefs`。
- **失败表现 = 无提示**：`patch()` 没有 `try/catch`（`settings.js:1880-1893`）；IPC 层拒绝时返回 `null`（`ipc-guard.js:73-91`），`merge(null)` 得到全默认对象，界面会按默认值重绘（推断，见 §8-6）。
- **写盘失败静默**：`writeJson` 吞掉异常（`paths.js:42-64`），返回值仍是合并后的对象，所以界面显示成功、磁盘可能未变。

| 页（key） | 渲染函数 | 真实控件 → 写入的键 | 仅示意（`aria-hidden` 占位，不写盘） | 状态 |
| --- | --- | --- | --- | --- |
| 常规 `general` | `pageGeneral` `:395-440` | 开机自启开关 → `launchAtLogin`；「恢复界面」按钮 → 一次性写 25 个键（见 SET-12） | 记住窗口位置、关闭后保持运行、自动检查更新、更新通道（4） | 开发中 |
| 外观 `appearance` | `pageAppearance` `:442-494` | 主题段 → `theme`（dark/light/system）；岛体材质下拉 → `skin`（仅 frost/solid/plain）；圆角滑块 → `radius` | 增强文字对比度、细边缘高光、内容图真实色彩（3） | 开发中 |
| 尺寸与位置 `layout` | `pageLayout` `:510-561` | 目标显示器下拉 → `displayId`（`'null'`→`null`）；避免遮挡 → `avoidTopBar`；整体缩放滑块 → `uiScale` | 屏幕锚点、水平偏移、垂直偏移（3） | 开发中 |
| 隐藏与交互 `behavior` | `pageBehavior` `:790-832` | 悬停展开 → `hoverAutoHide`；点击穿透 → `clickThrough`；双击折叠 → `blurCollapse`；全屏隐藏 → `hideFullscreen`；通知临时替换 → `notify.system` | 显示/隐藏快捷键（1） | 开发中 |
| 角色与表情 `cast` | `pageCast` `:1519-1585` | 15 个角色卡 → `settings:action kind=cast`（不写 prefs，由 `main.js setCast()` 写 `cast`）；待机呼吸 → `idleMoods` | 表情强度、角色尺寸、角色透明度（3） | 开发中 |
| 页面管理 `pages` | `pagePages` `:918-946` | 11 个 `pages.<key>` 开关；拖拽 + ↑↓ 按钮 → `pageOrder` | 无 | 已确认（`status-order.test.mjs:227-241`、`schema.test.mjs:409-419`） |
| 媒体与歌词 `music` | `pageMusic` `:948-990` | **无** | 首选媒体应用、封面来源、暂停后保持显示、歌词对齐、最大可见行数、字号（6） | 开发中 |
| 专注与饮水 `focus` | `pageFocus` `:992-1034` | **无** | 工作时长、休息时长、自动开始下一轮、喝水间隔、久坐提醒、完成通知（6） | 开发中 |
| 待办与置物 `todo` | `pageTodo` `:1036-1080` | 收纳位置输入框 → `shelf.dir` | 默认列表、默认排序、完成后移入历史、保留缩略图、离开时自动清理（5） | 开发中 |
| 通知、邮箱与日程 `comm` | `pageComm` `:1082-1140` | 允许岛体通知 → `notify.system`（与行为页同一键、第二个控件） | 显示方式、停留时长、邮箱摘要（读 `notify.body`）、日程提醒（读 `calendar.fromMail`）、提前提醒（读 `calendar.leadMin`）（5） | 开发中 |
| AI 额度 `quota` | `pageQuota` `:1147-1187` | **无** | 主账号、阈值、自动刷新（读 `quota.alert`）、Claude/DeepSeek/Kimi 三行（6） | 开发中 |
| 天气 `weather` | `pageWeather` `:1193-1239` | 城市输入 → `weather.city` 且强制 `autoLocate:false`；自动定位 → `weather.autoLocate`；单位段 → `weather.unit` | 天气来源、预报天数、日出日落（3） | 开发中（城市与自动定位有测试，见 SET-13；单位只走共享 `temperatureText()`） |
| 设备 `devices` | `pageDevices` `:1270-1340` | 行尾显示开关 → `settings:devices-hidden`（写 `devices.hidden`）；行拖拽 → `settings:devices-order`（写 `devices.order`） | 蓝牙发现、自动重连、低电量阈值（3） | 开发中（两条通道有测试；无置顶星标） |
| 系统托盘图标 `tray` | `pageTray` `:1370-1440` | 显示托盘图标 → `trayIcon` | 单击/双击/右键行为、关闭设置窗口二选一（4）；另有一整块托盘菜单示意图（`:1377-1404`） | 开发中 |
| 插件 `plugins` | `pagePlugins` `:1342-1368` | **无**（4 个「已安装」+ 2 个安全开关全是示意） | 6 | 开发中 |
| 关于 `about` | `pageAbout` `:1442-1517` | 「开源许可」「检查更新」两个按钮 → 都走 `settings:open-repo`（打开 GitHub 仓库，`main/settings.js:292-293`） | 版本、Electron、通道、更新状态（读 `meta.update`）、平台、画板（6） | 开发中（没有真正的「检查更新」动作） |

汇总：**真实可交互控件 26 处（按控件种类去重；23 处会写偏好——20 处走 `settings:patch`、2 处走设备窄通道、1 处（角色卡）走 `settings:action`，另 2 个按钮只执行动作）对 60 处示意控件调用**（`visualToggle` 28、`visualSelect` 10、`visualField` 15、`visualSlider` 4、`visualSegment` 3）。示意控件在源码里被显式标记为 `aria-hidden="true" data-decorative="true" title="示意控件"`（`settings.js:285-302`），这是「占位」而不是「伪装成可用开关」——所以对应页判为**开发中**，下文没有渲染入口的整块功能才判**已废弃**。

### 3.3 弹层、内嵌组件与结构性死代码

| 条目 | 用途 | 入口 / 触发 | 实现位置 | 状态 |
| --- | --- | --- | --- | --- |
| 自定义下拉 listbox | 替代原生 `<select>` 的外观；`popover="manual"` 顶层弹层 | 点 `[data-select-key]` 外壳 | `settings.js:237-259`（结构）、`:2299-2481`（开/关/定位/键盘） | 待验证 |
| 自动避让应用选择器（模态） | 搜索运行中的 exe、取真实图标、单选/全选、二次确认 | `data-act="avoid-add"` | `settings.js:600-788`、`:1934-2014` | 已废弃（当前没有任何渲染点输出 `avoid-add`，见 §8-3） |
| 「常驻排列」胶囊预览条 | 状态组件的拖动排序 + 点按开关 + Alt+←/→ 键盘换位 | `residencyCard()` | `settings.js:879-916`、`:2587-2734` | 已废弃（`residencyCard()` 定义后从未被调用，见 §8-3） |
| `orderList()` 通用排序列表 | 早期「页面管理/状态组件」共用行 | 无 | `settings.js:834-854` | 已废弃（从未被调用；页面管理已自己渲染行） |
| 表单错误行 / 空态卡 / 折叠行 | 邮箱、额度、日历表单的错误位与空态 | 无 | `settings.js:371-391`（`emptyCard`、`formError`、`showFormError`） | 已废弃（无渲染点，见 §8-3） |
| 角色位（左栏 34px 头像 + 昵称 +「角色昵称 · TOT」） | 用主进程下发的 face 画当前角色 | `railCast()`，订阅 `face:apply` | `settings.js:1628-1641`、`:1672-1679` | 已确认（`schema.test.mjs:390-407` 断言无搜索框、订阅 face、无自己的定时器） |

### 3.4 键盘与焦点路径（真实存在的）

| 行为 | 触发 | 结果 | 位置 |
| --- | --- | --- | --- |
| 重绘后的焦点找回 | 任一 patch 重绘 | 只对两类控件生效：`[data-act="set"]` 输入框与 `.pgm-select-shell` 下拉外壳；其它按钮（开关、段控件、芯片按钮）重绘后焦点落回 body | `settings.js:1883-1892` |
| 皮肤卡焦点回位 | 键盘 Enter/Space 选中皮肤卡 | 重绘后焦点回到同一张卡 | `settings.js:2100-2109` |
| 页面排序 | 行聚焦后 ↑/↓ | 上/下移一位并写 `pageOrder`，焦点落到新位置的同向按钮 | `settings.js:2495-2502`、`:1916-1928` |
| 自定义下拉 | ↑↓ / Home / End / Enter / Space / Esc / Tab | 见 SET-14 | `settings.js:2417-2455` |
| 左栏切页 | 鼠标点击 `[data-nav]` | 只监听 `click`，**没有方向键/roving tabindex** | `settings.js:2738-2743` |
| 避让弹窗 Esc | Esc | 关闭弹窗（弹窗本身不可达，见 §3.3） | `settings.js:1941-1943` |

## 4. 数据与存储

| 数据 | 位置 / 文件 | 写入者 | 读写时机 | 备注 |
| --- | --- | --- | --- | --- |
| 用户偏好 | `app.getPath('userData')/prefs.json`（Windows：`%APPDATA%\\EmojiTot\\prefs.json`，`paths.js:12-13`） | 设置窗（`settings:patch`）、岛（同通道 `settings:patch` + `devices-pin`）、托盘（`pinned`）、更新卡（`updatePrompt.snoozeUntil`）、引导（`onboardingDone`）、球窗口（`position`）、设备写通道（`devices.*`） | 每次控件变更即写；启动读一次并补默认值 | 原子写：临时文件 → `fsync` → `rename`（`paths.js:42-64`）；读失败回退 `{}`；写失败静默 |
| 偏好形状 | 同上文件的 81 个可写路径 | — | — | `knownPaths()`（`schema.js:429-441`）逐 key 展开一层：57 个顶层键 + `pages` 作为整组 + 24 个嵌套叶子 = 81 |
| AI 账号密钥 | `userData/secrets.bin` | `services/quota.js` 的 `save()`（`:40-42`） | 增删账号、切换主账号 | 文件里只有 `{accounts, current}`；`account.secret` 已是 `v1:`/`plain:` 串；余额请求把密钥放进子进程环境变量传（`quota.js:68-72`），不进 argv |
| 邮箱授权码 | `userData/mail.json` | `services/mail.js`（`:25` 文件、`:47` 写、`:378` 加密） | 添加账号 / 每次同步 | **修正文档**：`docs/PRIVACY.md:17` 与 `docs/SETTINGS.md:53` 说邮箱授权码在 `secrets.bin`，实际加密后落在 `mail.json` |
| 日历订阅 URL | `userData/cache-calendar.json` | `services/calendar.js:51-53` | 订阅变更 | 只有 `url` 字段加密（同 `v1:`/`plain:` 规则，`calendar.js:36` 读时解码）；`security.test.mjs:243-249` 有断言 |
| 加密格式 | 三份文件共用 `secrets.js` | 主进程 | 读写时 | `v1:` = safeStorage 密文 base64；`plain:` = 明文回退，可见地承认没有钥匙串（`secrets.js:11-31`、`docs/PRIVACY.md:32`） |
| 设置窗内存态 | 模块内 `prefs` / `meta` / `displays` / `version` / `quotaState` / `mailState` / `calendarState` / `devicesState` | `load()` 与每次 `patch()` 的整体替换 | 打开窗、每次写盘回包、主进程推送 | 只存渲染用的缓存，**不是第二份真值**；`patch()` 用主进程回包覆盖本地（`settings.js:1880-1882`） |
| 设备滚动位置 | `devicesScrollTop`（内存） | `paintContent()` | 每次重绘 | 防止探针落地重绘把列表弹回顶部（`settings.js:1836-1850`） |
| `agent_*` 动态键 | `prefs.json`（与 schema 键同文件） | `main.js:1295-1296`（设置页 agent 动作） | 勾选 Agent 来源时 | 直接 `writeJson`，**绕过 filterPatch**；不在 `DEFAULTS`/`knownPaths` 内，因此审计矩阵看不到它 |
| 审计产物 | `docs/SETTINGS-AUDIT.md` | `scripts/settings-audit.mjs` | `pnpm settings:audit`；CI 用 `--check` | 生成物，禁止手改（文件头 `:3-4`）；矩阵 81 行 |

### 4.1 可达偏好键 → 消费者

只列**当前窗口有直接控件**的 23 条（22 个键 + 角色通道）；其余键的消费者见 `schema.js:797-896` 的 `CONSUMERS` 与 `docs/SETTINGS-AUDIT.md` 的矩阵。

| 键 | 写入处 | 消费者（谁读它） | 生效 |
| --- | --- | --- | --- |
| `launchAtLogin` | 常规页开关 | `main/settings.js applyPatch()` → `app.setLoginItemSettings(loginItemOptions(...))` | 即时 |
| `theme` | 外观页主题段 | `island.js resolveTheme()`、`settings.js applyChrome()` | 即时 |
| `skin` | 外观页材质下拉 | `island.js applyPrefs()` → `body[data-skin]`、设置页材质卡与右预览 | 即时 |
| `radius` | 外观页圆角滑块 | `island.js --radius`、`paintPreview()` 的弧值 | 即时 |
| `displayId` | 尺寸页显示器下拉 | `main/island.js place()` | 即时 |
| `avoidTopBar` | 尺寸页「避免遮挡」 | `main/island.js place()`、`topEdge()` | 即时 |
| `uiScale` | 尺寸页整体缩放 | `island.js --ui-scale`、设置页 `html.style.zoom` | 即时 |
| `hoverAutoHide` | 行为页「悬停展开」 | `island.js` hover watcher | 即时 |
| `clickThrough` | 行为页「点击穿透」 | `main/island.js`、`main.js setIgnoreMouseEvents` | 即时 |
| `blurCollapse` | 行为页「双击折叠」 | `island.js` blur handler | 即时 |
| `hideFullscreen` | 行为页「全屏隐藏」 | `main.js applyMainPrefs()` → `services/fullscreen` 启停 | 即时 |
| `notify.system` | 行为页 + 通知页（同一键两处） | `services/notify.js` | 即时 |
| `idleMoods` | 角色页「待机呼吸」 | `main.js createIdleMoods()` → `main/idle-mood.js`（最低表情优先级，只能静音时钟） | 即时 |
| `trayIcon` | 托盘页开关 | `main.js createTray()` | 即时 |
| `shelf.dir` | 待办页收纳位置 | `services/shelf.js dir()`（留空用默认目录） | 即时 |
| `weather.city` | 天气页城市输入 | `main.js refreshWeather()` | 即时 |
| `weather.autoLocate` | 天气页自动定位 | `main.js refreshWeather()`（定位失败回落到手动城市） | 即时 |
| `weather.unit` | 天气页单位段 | `island.js renderPillStatus()` /`temperatureText()` | 即时 |
| `pages` | 页面管理 11 个开关 | `main.js applyServicePlan()`（后台服务）+ `island.js enabledPages()`（前台页轨） | 即时 |
| `pageOrder` | 页面管理拖拽/键盘 | `island.js enabledPages()` | 即时 |
| `devices.hidden` | 设备页行开关 | `island.js devicesPage()` → `visibleDevices()`；设置页仍列出 | 即时 |
| `devices.order` | 设备页拖拽 | `island.js devicesPage()` → `orderDevices()`；置顶行仍排最前 | 即时 |
| `cast` | 角色页 15 张卡（经 `settings:action`） | `main.js setCast()` → `island:cast` / `cast:changed`，并影响托盘、预览、表情 | 即时 |

## 5. 状态与异常矩阵

| 场景 | 当前表现 | 实现位置 | 备注 |
| --- | --- | --- | --- |
| 加载 | `load()` 串行 await 7 次 IPC（get/meta/version/displays/quota/mail/calendar），全部回来才第一次 `paint()` | `settings.js:1867-1878`、`:2789` | 期间窗口是空壳（`#content` 空，`settings.html:53`）；无骨架屏 |
| 加载失败 | 任一 IPC reject → `load()` 的 promise 未捕获，窗口停在空壳 | 同上（调用点无 `catch`） | 推断：实际表现取决于哪个通道先失败 |
| 空（设备页） | 探针无结果且未扫描时，渲染 4 台**虚构设备**（WH-1000XM5 / MX Mechanical / MX Master 3S / iPhone 17 Pro） | `settings.js:1275-1283` | 用户会以为真实设备叫这些名字；有真实列表时走真实数据 |
| 空（角色网格） | `meta.casts` 为空 → 一张空态卡「角色缺失」 | `settings.js:1533-1534` | — |
| 空（额度） | 无账号时主账号名回退为「Codex · 默认」 | `settings.js:1152` | 纯占位文案，无账号表单可点 |
| 部分成功 | comm 页顶部一条 `role="status"` 提示，列出邮箱错误与每个失败订阅 | `settings.js:1083-1097`、`:183-192` | 只在有错误时出现 |
| 失败（额度） | quota 页同款提示条，正文取 `state.last.error` | `settings.js:1153-1156` | 文案如「密钥无法读取」「查询失败」（`quota.js:92`、`:98`） |
| 失败（写盘） | 无提示；界面按回包重绘成新值 | `paths.js:42-64`、`settings.js:1880-1882` | 只读 profile 下「看起来保存了」 |
| 失败（IPC 拒绝） | `api.patch()` 解析为 `null` → `merge(null)` = 全默认 → 界面像被重置 | `ipc-guard.js:73-91`、`settings.js:135`、`:1880` | 推断（代码路径可读，未真机复现） |
| 离线 | 设置窗自身不发网络请求；只有「立即刷新天气」会调主进程 | `settings.js:2153-2158` | 该按钮当前未渲染，路径不可达 |
| 禁用 | 最大化按钮 `disabled`，且窗口 `maximizable:false`；点击处理器自己再判一次 `!maxBtn.disabled` | `settings.html:25`、`settings.js:2746-2747`、`main/settings.js:117` | 三重禁用 |
| 禁用（设备扫描中） | 整行替换为「扫描中」`role="status"` 行 | `settings.js:1284-1288` | 条件：`scanning && list.length === 0` |
| 重试 | 无自动重试；设备页「重新探测」按钮（`devices-refresh`）与天气刷新按钮都不在渲染树上 | `settings.js:2142-2159` | 死分支 |

## 6. 功能合同

| ID | 功能 | 入口 | 行为合同（判定条件 / 时序 / 文案 / 数据副作用） | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- |
| SET-01 | 打开设置窗并定位到指定页 | 岛齿轮 `island.js:3710`；托盘「设置」`main.js:1187`；`settings:action kind=settings` `main.js:1301` | 已存在则 `show()+focus()` 并 `send('settings:goto', page)`，不新建窗口；首次创建后 `ready-to-show` 才显示并发送 goto；页名经 `checkPage` 白名单 `/^[a-z-]{1,32}$/` | 待验证 | `main/settings.js:102-158`、`:223-226`、`:315-318` |
| SET-02 | 关闭设置窗不退出应用 | 标题栏关闭按钮 → `settings:close` | `win.close()`，进程继续；`window-all-closed` 无操作；真正退出只走托盘「退出」/`app:quit` | 待验证 | `main/settings.js:320-323`、`main.js:2435-2437` |
| SET-03 | 每个开关即时写盘，无「保存」按钮 | 任意真实控件 | 控件 → `patch()` → `settings:patch` → `writePrefs` → 返回完整合并对象 → 本窗重绘 + `settings:changed` 广播 + `onPrefs` 让主进程重算服务/窗口标志 | 已确认 | `settings.js:1880-1893`、`main/settings.js:173-190`、`main.js:2414-2429`、`docs/SETTINGS.md:48`、`schema.test.mjs:470-473` |
| SET-04 | 未知键与非法值被丢弃 | 任意 patch | `filterPatch` 只接受 `DEFAULTS` 拥有的键；`skin` 必须是 `SKINS` 三值之一，否则进 `rejected`；非对象 patch 返回空接受集 | 已确认 | `schema.js:450-464`、`paths.js:100-108`、`schema.test.mjs:175-190`、`:234-240` |
| SET-05 | 改动跨窗口同步 | 任一窗口写盘 | 设置窗：`settings:changed` 直推 + `onChanged` 比较后重绘；岛：`settings:changed`；球：`settings:changed` | 待验证 | `main.js:2414-2429`、`settings.js:2768-2773` |
| SET-06 | 主题 / 皮肤 / 缩放即时生效 | 外观页 | `applyChrome()` 每次重绘都跑：`data-theme`（system 时读 `prefers-color-scheme`）、`--ui-font`、`--ui-weight`、`html.style.zoom = clamp(uiScale/100, 0.8, 1.4)` | 已确认（theme/skin）；radius/uiScale 待验证 | `settings.js:1782-1804`、`polar-graphite.test.mjs:16-26` |
| SET-07 | 页面开关决定后台服务启停 | 页面管理 / 落盘后 | 服务集 = 已开页面的 `service`+`alsoServices` ∪ 已启状态组件需要的服务；再被五个功能开关扣减（`focus/health/todo/shelf.enabled`、`shelf.clipboard`）；`applyServicePlan()` 与运行集做差集启停 | 已确认 | `schema.js:573-600`、`main.js:1782-1819`、`schema.test.mjs:243-297`、`:452-468` |
| SET-08 | 页面排序（拖拽 + 键盘）持久化 | 页面管理 11 行 | HTML5 drag：`dragend` 时读 DOM 顺序写 `pageOrder`；↑/↓ 按钮与 `ArrowUp`/`ArrowDown` 走 `moveOrder()`，写完把焦点放回同一个移动按钮；`pageOrder` 只保留 manifest 认识的 key | 已确认 | `settings.js:1906-1928`、`:2495-2526`、`schema.js:558-563`、`schema.test.mjs:409-419`、`status-order.test.mjs:227-241` |
| SET-09 | 设备页数据是活的，探针随页面开关 | 进入/离开设备页 | 进入：`devicesWatch(true)` → 主进程 `devicesWatch=1` → `applyServicePlan()` + `devices.refresh()`，并取一次快照；离开或关窗：`closedHook` 归零并重算；探针落地推 `settings:devices`，只在设备页且非拖拽中才重绘 | 已确认 | `settings.js:1815-1830`、`:2753-2760`、`main.js:1889`、`:2153-2161`、`:2403-2407`、`devices-settings.test.mjs:164-169` |
| SET-10 | 设备显隐与顺序只走两条窄通道 | 设备页行开关 / 行拖拽 | 渲染层只发名字：`hideDevice(name, hidden)`（`hidden := 当前 aria-checked`）、`orderDevices(names)`；主进程用 `readPrefs()` 重建 `devices` 组再写，因此不会覆盖岛刚写的置顶；名字校验 `0 < len <= 120`，顺序去重且最多 200 个 | 已确认 | `settings.js:2083-2099`、`:2543-2585`、`main.js:1831-1851`、`:2172-2200`、`devices-settings.test.mjs:153-162` |
| SET-11 | 切换角色 | 角色与表情页 15 张角色卡 | `settings:action {kind:'cast', value:id}` → `main.js setCast()` → 回推 `settings:cast` → 本窗只重绘受影响区域（标题栏/左栏/角色页/托盘页/预览）；未知 id 归一到 `tot` | 已确认 | `settings.js:1688-1697`、`:140-153`、`main.js:1287-1291`、`status-order.test.mjs:243-255` |
| SET-12 | 「恢复界面」 | 常规页按钮 | 一次性写回 25 个键：`theme/skin/blur/radius/font/weight/fontSize/motion/reduceMotion/islandWidth/pillHeight/islandTopGap/sizeKey/pinned/clickThrough/displayId/avoidTopBar/oledShift/hideFullscreen/trayIcon/wheelPaging/blurCollapse/hoverOpenDelay/hoverCloseDelay/hoverAutoHide`；**不动** `pages`/`statusItems`/`pageOrder`/`defaultPage`/`avoidEnabled`/`avoidBrowsers`/`avoidApps`/`hotkey`/`timeFormat`/`uiScale` 与所有分组 | 待验证 | `settings.js:2112-2141` |
| SET-13 | 手动选城市压过自动定位 | 天气页城市输入 | change 时同时写 `{weather:{city, autoLocate:false}}`（整组覆盖，保留其余成员）；岛侧 `selectCity` 同规则 | 已确认 | `settings.js:2396-2401`、`schema.test.mjs:165-172`、`startup-polish.test.mjs:13-17` |
| SET-14 | 下拉框可键盘操作，弹层不被裁 | 任意 `rowSelect` | `↑/↓` 循环移动 `aria-activedescendant`、`Home/End` 首尾、`Enter/Space` 选中、`Escape` 关闭并归还焦点、`Tab` 关闭；菜单用 `popover="manual"` 挂在顶层，按视口上下空间决定开向，滚动/改窗时重新定位 | 待验证 | `settings.js:2299-2481` |
| SET-15 | 敏感值只在主进程加解密 | 额度账号 / 邮箱账号 | 渲染进程没有任何 secrets 通道（`preload-settings.js` 无相关方法）；`encrypt` 优先 `safeStorage.isEncryptionAvailable()`，不可用才写 `plain:` 并在文档里明说 | 已确认 | `secrets.js:11-31`、`preload-settings.js:15-66`、`security.test.mjs:243-249`、`docs/PRIVACY.md:32` |
| SET-16 | 审计矩阵与代码同源 | `pnpm settings:audit` / `settings:check` | 矩阵 81 行由 `CONSUMERS`+`DEFAULTS`+manifest 生成；`--check` 在有差异时退出码 1；`pnpm check` 链路包含 `settings:check` | 已确认（机制）；当前是否最新未验证 | `scripts/settings-audit.mjs:93-167`、`package.json:30-32` |
| SET-17 | 窗口几何固定 | 创建窗口 | 1080×760；`resizable:false`、`maximizable:false`、`frame:false`、不透明 `#101114`；DOM 侧 50px 标题栏 + 710px 栅格，列宽 `212px / minmax(0,1fr) / 276px` | 已确认 | `main/settings.js:109-138`、`polar-graphite-parity.css:134-139`、`:1802-1806`、`docs/UI-AUDIT.md:1106` |
| SET-18 | 界面语言切换 | 无 | `prefs.lang` 是唯一开关：`currentLang()` → `T()` → `documentElement.lang`/`document.title`/`data-i18n*` 静态外壳；`LANGS` 已 import 但**当前没有任何控件写 `lang`** | 已废弃 | `settings.js:35`、`:118`、`:126`、`:1768-1780`；`i18n.js:179-181` 有 `general.language.*` 词条但无渲染 |
| SET-19 | 四套快速方案（极简/工作/生活/全部） | 无 | `PRESET_MANIFEST` 定义 pages/statusItems/defaultPage/features；`presetPatch(key, current)` 产出完整补丁并保留 `current` 里的分组自定义值；点击分支 `data-act="preset"` 存在但**当前没有任何渲染点** | 已废弃 | `schema.js:121-156`、`:404-420`、`settings.js:13`（import 后未使用）、`:2028-2032`；`settings.css:477-498` 与 `i18n.js:160-168` 是残留样式与词条 |
| SET-20 | 胶囊状态组件开关与排序 | 无 | 组件应在预览条里点按开关（`setStatusItemEnabled`）、拖动或 Alt+←/→ 换位（`moveStatusKey`）、「恢复默认」写 `defaultStatusItems()`；`residencyCard()` 定义后从未被调用 | 已废弃 | `settings.js:879-916`、`:2604-2734`、`:2078-2082`、`status-order.test.mjs:131-146`（只断言源码字符串存在） |
| SET-21 | 自动避让的自定义应用清单 | 无 | 应能列出运行中的可见窗口、取 exe 真实图标、单选或全选、全选需二次确认；写入 `avoidApps`（按 exe 完整路径匹配，大小写与斜杠不敏感） | 已废弃 | `settings.js:590-788`、`:2016-2041`、`main/settings.js:244-248`、`schema.js:830` |

## 7. 不可随意改变（红线）

1. **`DEFAULTS` 就是文件格式。** 新键必须同时进 `DEFAULTS` 与 `CONSUMERS`，否则 `schema.test.mjs:60-65` 直接失败；`filterPatch` 会拒掉 schema 之外的写请求（`schema.js:450-464`）。
2. **页面/状态表必须每次渲染时重建。** 它们是函数而不是模块常量（`settings.js:76-84`），否则切到英文后标签仍停在中文。
3. **点号路径只能走 `setPath`。** `patch({ [key]: … })` 曾把 `focus.enabled` 写成字面量键，18 个分组开关全部「点了没反应」，现在由 `schema.test.mjs:377-381` 守着。
4. **无保存按钮、无本地第二份真值。** 控件的权威状态永远是主进程回包的合并对象（`settings.js:1880-1882`、`preload-settings.js:1-6`）。
5. **窗口几何不可改：1080×760、不可缩放、不可最大化、`212/1fr/276` 三列、50px 标题栏。** 改任何一项都会把已验收的画板推开（`main/settings.js:112-118`、`polar-graphite-parity.css:1802-1806`）。
6. **`settings:patch` 只允许 `settings` 与 `island` 两个角色**，且载荷必须是对象、≤32KB；IPC 层再过滤一次 schema（`main/settings.js:231-239`、`ipc-guard.js:69-96`）。
7. **敏感值只在主进程进出。** 渲染进程永远拿不到明文，也永远不直接调用 `safeStorage`；`v1:`/`plain:` 前缀语义不能改（`secrets.js:11-31`、`docs/PRIVACY.md:32`）。
8. **face 是单向的。** 设置窗订阅 `face:apply` 并原样画出来，不自己算表情、不自己起定时器（`settings.js:1666-1679`、`schema.test.mjs:403-407`）。
9. **设备的名字是唯一身份。** 显示名可以本地化，但 `data-device`/`data-pin`/`data-name` 必须传 PnP 原始名（`devices-settings.test.mjs:182-194`）。
10. **示意控件必须保持「明确示意」。** `aria-hidden="true" data-decorative="true" title="示意控件"`（`settings.js:285`）——把占位控件改成可交互之前，先把对应链路接上，否则会重演「65 个假开关进无障碍树」。
11. **设备探针是「需求计数」不是常驻。** 页面关掉就不该有人在跑 PowerShell（`main.js:1889`、`:2153-2161`、`:2403-2407`）。
12. **关窗不退出进程。** 退出只有一个显式入口（`main.js:2435-2437`、`main/settings.js:313`）。

## 8. 已知缺口与风险

1. **60 处示意控件调用覆盖 10 个页面**（`visual*` 家族，`settings.js:287-302`；源码注释自己说「约 65 个假开关」进过无障碍树）。它们让「外观/布局/媒体/专注/待办/通知/额度/设备/托盘/插件/关于」看起来可配，实际不写任何偏好。
2. **81 条已知偏好路径里只有 22 条有直接控件**；另有 15 条只能被「恢复界面」重置（`blur/font/weight/fontSize/motion/reduceMotion/islandWidth/pillHeight/islandTopGap/sizeKey/pinned/oledShift/wheelPaging/hoverOpenDelay/hoverCloseDelay`），1 条由角色网格写（`cast`），**43 条没有任何入口**。其中 `onboardingDone`/`position`/`updatePrompt.snoozeUntil` 是设计上的非控件（`schema.js:186-197`、`:342-347`），剩下 40 条是真正缺控件的：`displayMode`、`lang`、`timeFormat`、`statusItems`、`defaultPage`、`avoidEnabled`、`avoidBrowsers`、`avoidApps`、`mediaEmotion`、`hotkey`、`devices.showBattery`、`devices.pinned`、`weather.intervalMin`、`music.*`(4)、`focus.*`(3)、`health.*`(3)、`todo.*`(2)、`shelf.enabled`、`shelf.clipboard`、`calendar.*`(2)、`quota.*`(4)、`mailProvider`、`notify.body`、`messenger.*`(5)。
3. **结构性死代码**（定义齐全、无人调用）：`residencyCard`、`orderList`、`emptyCard`、`rowStack`、`rowAction`、`rowActionToggle`、`rowActionSeg`、`skinPreviewCards`、`formError`、`avoidAppsRow`。另有 24 个 `data-act` 分支只出现在事件处理器里、没有任何渲染点输出它们（`preset`、`quota-add`、`mail-add`、`cal-add`、`cal-subscribe`、`devices-refresh`、`clipboard-clear`、`status-reset`、`devices-unpin`、`devices-order-reset`、`refresh-weather`、`device-pin`、`add-mail`、`add-quota`、`open-data`、`open-state` 等）。
4. **测试盲区（重要）**：`status-order.test.mjs:131-146` 与 `devices-settings.test.mjs:153-162` 断言的是**源码里出现某个字符串**（`'statusPreviewRows(prefs)'`、`'api.pinDevice?.'`），无法区分「函数被定义」与「函数被渲染」。所以状态组件的开关/排序、设备置顶星标都已不可达，测试仍然全绿。同类：「离线重试」「表单错误提示」「置顶设备」三块。
5. **文档漂移（逐条可核对）**：
   - `docs/SETTINGS.md:3`「窗口 1080×760，**可缩放**」→ 代码 `resizable:false`（`main/settings.js:116`）；`:9` 的「四套快速方案」→ 不可达（SET-19）；`:53`「邮箱授权码存 `secrets.bin`」→ 实际 `mail.json`（`mail.js:25/378`）。
   - `docs/PRIVACY.md:17`（`secrets.bin` 含邮箱授权码）、`:24`（`mail.json` 只有发件人/主题/时间）与代码不符：`mail.json` 存的是加密后的授权码 + 最近 10 封摘要。
   - `docs/SETTINGS-AUDIT.md` 的「设置页」列对 `devices`/`tray`/`plugins`/`about` 直接打印英文 key：生成脚本的 nav 表只到 12 页（`scripts/settings-audit.mjs:75-91`）。
   - `CONSUMERS` 里三处指向已不存在的 UI：`statusItems` 写「settings.js residencyCard()」、`devices.pinned` 写「设置·设备页星标切换」、`quota.provider`/`mailProvider` 写「settings.js 加账号表单默认值」（`schema.js:841`、`:874`、`:881`、`:885`）。三条都不影响测试，但会让审计矩阵读起来像功能存在。
   - `docs/UI-AUDIT.md:69` 的 JSON 样例 `settings.expectedPages: 15`，同文件 `:36` 与 `:3` 写 16。
6. **推断风险：被拒的 patch 会把界面刷成全默认。** `api.patch()` 被 `ipc-guard` 拒绝时返回 `null`（`ipc-guard.js:73-91`），`patch()` 里 `merge(null)` = `withDefaults({})`（`settings.js:135`、`:1881`），于是界面显示「设置全丢了」，而磁盘没变。未真机复现。
7. **推断风险：`uiScale > 100` 会关掉右预览列。** `applyChrome()` 先设 `html.style.zoom`，再用 `window.innerWidth >= 1080` 决定 `data-preview`（`settings.js:1792-1801`）；CSS zoom 下 `innerWidth` 通常按缩放后的 CSS 像素折算，140% 时约 771。未在真机核对。
8. **设备页的假数据会出现在真实窗口**：探针空结果且未扫描时渲染 4 台虚构设备（`settings.js:1275-1283`），既不是空态也不是加载态。
9. **未验证**（本次只读分析，没有运行任何命令）：`pnpm settings:check` 与 `pnpm ui:audit` 在当前 commit 的通过状态；`docs/SETTINGS-AUDIT.md` 是否与当前 schema 完全一致（只逐行核对了行数与 manifests，未执行生成器）。
10. **未验证**：`main.js:2440` 的注释说「岛和设置窗拒绝 close 事件」，但 `main/settings.js` 里没有 `win.on('close')` 拦截——注释与实现至少有一处过时。
11. **未验证**：`settings:maximize` IPC 仍然存在且不检查 `maximizable`（`main/settings.js:330-336`），与 UI 的三重禁用不同步；只要有任何窗口能调到它，就能把固定画板最大化。
12. **左栏无法用键盘遍历。** 16 页导航只挂了 `click`（`settings.js:2738-2743`），没有 roving tabindex、没有方向键、没有 `aria-activedescendant`；可用 Tab 逐个走完，但每页都是一个 tab 站，键盘用户代价高。
13. **关于页没有真正的更新动作。** 「开源许可」和「检查更新」都调 `settings:open-repo`（`settings.js:1496-1510`、`main/settings.js:292-293`），只打开 GitHub；页面上的更新状态文字来自 `meta.update.snapshot()`（`main.js:1218`），不是点出来的。
