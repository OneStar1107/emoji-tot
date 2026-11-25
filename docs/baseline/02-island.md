# 灵动岛（Island）

> 一句话：屏幕顶部居中的一条胶囊（收起）＋ 一张 11 页功能卡（展开）。窗口尺寸完全由页面实测反推，默认点击穿透，由主进程轮询光标决定是否接收鼠标。
> 实现根目录：`apps/desktop/src/main/island.js`（窗口）＋ `apps/desktop/src/renderer/island.*`（页面）＋ `apps/desktop/src/preload-island.js`（桥）。
> 核对基准：HEAD `bb435d1`（tag `v0.8.20.26`）；只读分析，未启动应用、未跑构建与 `pnpm ui:audit`。

## 1. 范围与边界

**覆盖**：岛窗口的创建/定位/显隐/点击穿透/尺寸上报（主进程）、11 个功能页与 5 个状态组件的渲染、收起胶囊（含暂停恢复按钮）、展开动画（morph）、翻页（按钮/滚轮/键盘）、通知插页、自动避让横条、页内浮层（音量/城市菜单/日程编辑）、皮肤与主题在岛上的落地。

**不覆盖（见对应文件）**：

| 主题 | 去哪里看 |
| --- | --- |
| 数据来源实现细节（SMTC/PowerShell/IMAP/Open-Meteo 抓取、缓存 TTL、封面兜底） | `docs/ISLAND.md` §4、`docs/LIVE-COVERAGE.md` |
| 设置窗口的控件、左栏 16 页、每种偏好的写入口 | `docs/SETTINGS.md`、`docs/SETTINGS-AUDIT.md`、`apps/desktop/src/shared/schema.js` CONSUMERS |
| 桌面球、托盘面板、更新卡、首次引导 | 同目录其它模块文件；`docs/ARCHITECTURE.md` |
| 情绪协议与角色渲染（`emojitot-ball`、`face:apply`） | `docs/PROTOCOL.md`、`packages/core` |
| 隐私与安全边界（剪贴板、密钥、CSP、沙箱） | `docs/PRIVACY.md`、`docs/SECURITY.md` |
| 打包与发版 | `docs/RELEASING.md`、`docs/SIGNING.md` |

**判定口径（怎么读本文的状态词）**：

- **已确认** = 代码可达，且有自动化测试断言该行为，或 `docs/UI-AUDIT.md` 有可查的验收记录（该文档记录了 11 个岛页 × 3 套皮肤共 33 页的量测结果与 PASS 门槛 `.pages` scrollHeight ≤ 260）。
- **开发中** = 链路只通了半截（有 UI 没数据源，或有模型没渲染），用户拿不到完整效果。
- **待验证** = 代码可达但既无测试断言、也无验收记录；不是"坏"，是"没人证明它现在是对的"。
- **实验性** = 只在开发脚本、throwaway profile 或明确标注实验的开关后才可用。
- **已废弃** = 代码还在，但用户路径已不可达，或已被新实现取代。

约定：本文只写**当前代码事实**；每条判断给出仓库相对路径与行号/常量名。`src/renderer/vendor`、`dist`、`.ui-capture` 属生成物，只作为产物存在记录，不逐行分析。

## 2. 模块与文件清单

| 模块 | 职责 | 实现位置 | 触发/生命周期 |
| --- | --- | --- | --- |
| 窗口控制器 | 建窗、居中贴顶、按页面 box `setBounds`、穿透轮询、OLED 漂移、IPC 注册 | `apps/desktop/src/main/island.js:1-544` | 懒创建（`island.show()` / `main.js:1139` 首次调用）；进程内单例 |
| 岛桥 | 唯一 IPC 出口：上报 box/hit、订阅 `island:*`、`face:apply`、`settings:changed` | `apps/desktop/src/preload-island.js:1-108` | 随窗口加载；`sandbox: true` |
| 页面骨架 | 三个可绘制表面（pill / panel / avoid-strip）、顶栏、底栏、页码 | `apps/desktop/src/renderer/island.html:13-71` | 窗口加载即存在 |
| 渲染主程序 | 状态机（收起/展开/避让）、11 页渲染、翻页、歌词、媒体页、动效驱动 | `apps/desktop/src/renderer/island.js:1-4741` | 页面模块；顶层 `await api.bootstrap()` |
| 折叠胶囊模型 | 收起胶囊的内容计划（nowPlaying/status/face）、截断算术、暂停恢复可见性 | `apps/desktop/src/renderer/island-pill.mjs:1-313` | 纯函数，随 `renderPillStatus()` |
| 顶栏/分页可见性 | `islandHeaderState()`、`pagingVisibility()` | `apps/desktop/src/renderer/island-header.mjs:11-18` | 纯函数；**实际只用 `pagingVisibility`**（§8-3） |
| 弹簧几何 | 解析阻尼弹簧、Apple 参数换算、`geometryAt`、`stageNeedsRecovery` | `apps/desktop/src/renderer/island-motion.mjs:1-148` | 纯函数；morph 每帧采样 |
| 媒体算术 | 速率/重复/随机枚举、seek rail 百分比与键盘步进、`advancedSections` | `apps/desktop/src/renderer/media-controls.mjs:1-141` | 纯函数；seek 已接线，速率面板未接（§8-10） |
| 歌词时钟 | 播放秒数推算、当前歌词二分查找、下一句延时 | `apps/desktop/src/renderer/lyric-clock.mjs:1-45` | 纯函数；`scheduleLyricClock()` 驱动 |
| 调试夹具 | 与画板一致的确定性数据（时钟/电量/天气/媒体/歌词…） | `apps/desktop/src/renderer/island-fixtures.mjs:14-208` | 仅 `scripts/capture-ui.mjs:21` 使用 |
| 视觉令牌 | `--island-w` / `--pill-h` / `--fold-*` / `--pages-h`；Polar Graphite 皮肤层 | `apps/desktop/src/renderer/island.css:55-135`、`polar-graphite.css`、`polar-graphite-parity.css` | `island.html:8-10` 按序加载，parity 层最后落地；由 `applyPrefs()` 运行时覆盖 |
| 读数规则 | 电量图标/文本、`clockText`、`temperatureText`、`quotaText` | `apps/desktop/src/shared/status-view.js:18-68` | 纯函数；岛与设置预览共用 |
| 注册表 | `PAGE_MANIFEST`（11 页）、`STATUS_MANIFEST`（5 件）、岛相关默认值 | `apps/desktop/src/shared/schema.js:27-43`、`:107-113`、`:183-349` | 主进程/设置/岛共读 |
| 穿透策略 | `passThroughFor(enabled, pointerInside)` | `apps/desktop/src/main/window-state.js:9-11` | 每次光标轮询 |
| 主进程装配 | `island.registerIpc()`、数据推送、避让、全屏隐藏、快捷键 | `apps/desktop/src/main.js:24`、`:1139`、`:1356-1399`、`:2361`、`:2377-2412` | app ready 之后 |
| 授权审计/截图 | 11 页布局量测；画板截图（含 avoid/notification） | `apps/desktop/scripts/ui-audit.mjs`、`apps/desktop/scripts/capture-ui.mjs:354-471` | 手动 `pnpm ui:audit` / 手动捕获 |

**岛依赖、但不归岛维护的模块**（改它们会改岛的行为）：

| 依赖模块 | 与岛的关系 | 位置 |
| --- | --- | --- |
| IPC 守卫 | 通道白名单、`maxBytes`、形状校验；岛窗口的 `claim('island')` | `apps/desktop/src/main/ipc-guard.js`（`main/island.js:17`、`:369`） |
| 服务层 | 每个服务拥有自己的数据文件，变化时向岛推快照 | `apps/desktop/src/main/services/*.js`（`main.js:1967-1990`） |
| 自动避让 | 常驻 PowerShell 判定前台窗口是否覆盖岛；窗口矩形由 `setBoundsHook` 持续喂入 | `apps/desktop/src/main/services/avoidance.js`（`main.js:2409-2412`） |
| 全屏守卫 | 全屏应用出现时隐藏岛 | `main.js:1381-1399` |
| 角色元素 | `emojitot-ball` 由 `packages/core` 提供；`state`/`cast` 由主进程广播 | `island.html:73`、`island.js:4534-4557` |
| 设置窗 | 岛上一半偏好的唯一写入口；岛的入口按钮都指向它 | `apps/desktop/src/renderer/settings.js`（`island.js:4015-4021`） |

## 3. 页面 / 窗口 / 条目清单

窗口只有一个：`BrowserWindow`（透明、无边框、`alwaysOnTop('screen-saver')`、`skipTaskbar`、`focusable: true`、`showInactive()`）——`apps/desktop/src/main/island.js:333-374`。窗口内可绘制表面：`#pill`、`#panel`、`#avoid-strip`、`#paused-resume`（`island.html:16-69`）。

| 条目 | 用途 | 入口 / 触发 | 实现位置 | 状态 |
| --- | --- | --- | --- | --- |
| 收起胶囊 pill | 常驻：角色脸 ＋ 状态行／正在播放 | 默认形态（`#island[data-open="false"]`） | `island.html:16-20`、`island.js renderPillStatus() 677-750` | 已确认（`test/island-pill.test.mjs`） |
| 暂停恢复按钮 | 音乐暂停后保留的小封面/播放键 | `pausedResumeIsVisible()` 为真 | `island.html:21-26`、`island.js:628-675`、`:3694-3708` | 已确认（`island-pill.test.mjs:334-404`） |
| 展开面板 | 顶栏 ＋ 260px 页面区 ＋ 底栏（页码/箭头） | 点按 pill、悬停到点、`setOpen(true)` | `island.html:29-67`、`island.js:3470-3617` | 已确认（`island-motion.test.mjs`、`island-ui.test.mjs`） |
| 顶栏 header | 角色脸、页名、页副题、时间、电量、设置齿轮 | 展开即画；每次 `renderPage()` | `island.html:34-50`、`island.js:388-392`、`:740-747` | 待验证：`island-ui.test.mjs:14-49` 断言的 `islandHeaderState()` 生产未接（§8-3），顶栏渲染本身无断言 |
| 底栏 footer | 上一页 / 页码+圆点 / 下一页 | 展开即画，页数 >1 才显示 | `island.html:52-65`、`island.js:2955-2975` | 已确认（`island-ui.test.mjs:51-83`、`:305-331`） |
| 通用空态块 | 圆点 ＋ 一句"发生了什么" ＋ 一句"下一步" ＋ 可选按钮 | 11 页共用；`stateBlock()` | `island.js:782-790` | 已确认（`island-ui.test.mjs:107-113` 断言 `.state` 模板与 96px 上限） |
| 音量浮层 | 主音量滑杆 ＋ 静音 | 点媒体页音量键；点浮层外关闭 | `island.js:969-1053`、`:3781-3788` | 待验证：无该浮层断言 |
| 城市菜单 | 天气页切城市（写 `weather.city` 并关掉自动定位） | 点天气页城市名 | `island.js:1385-1414`、`:3763-3780` | 待验证；写路径与 `schema.test.mjs:165-174` 的"选城市即关定位"规则一致 |
| 歌词/封面模式切换 | 媒体页在封面态与歌词态之间切换 | 点媒体页歌词窗 | `island.js:3790-3797`（`musicLyricsMode`） | 待验证 |
| 日程编辑卡 | 在月历内联新增/保存/删除事件 | 点空白日或事件行 | `island.js:3817-3873`、`:2051-2138` | 待验证（写入通道 `calendar:do` 有服务测试，编辑 UI 无断言） |
| 置物架剪贴板折叠 | 展开/收起剪贴板条目列表 | 点剪贴板标题 | `island.js:3880-3886`、`:2442-2451` | 待验证 |
| 通知插页 | 临时把页面换成通知，3.5s 后回原页 | `receiveNotification()` | `island.js:2853-2905`、`:2947-2950` | 开发中：无生产通道（§8-1） |
| 自动避让横条 | 浏览器覆盖时收成 6px slit，鼠标可穿过 | 主进程 `island:avoid` 推送 | `island.html:69`、`island.js:4326-4375`、`island.css:2918-2987` | 已确认（检测规则：`test/avoidance-detect.test.mjs`） |
| 页 1 媒体 | 封面/三行歌词/进度轨/传输键/音量 | `musicPage()`；`pages.music` | `island.js:862-1316`；数据 `island:media`、`island:lyrics` | 已确认（`island-pill`＋`media-controls`＋`lyrics-clock` 三份测试） |
| 页 2 天气 | 当前温度 ＋ 五日预报（`.slice(0,5)`） | `weatherPage()` | `island.js:1416-1511` | 已确认（`test/weather.test.mjs`＋`security.test.mjs:251-263` 转义断言） |
| 页 3 AI 工作台 | 余额、账号切换、Agent 三行、刷新 | `quotaPage()` | `island.js:1615-1709` | 已确认（`island-ui.test.mjs:167-229`） |
| 页 4 邮箱 | 账号/未读 tab、4 行邮件、批量已读、验证码摘要 | `mailPage()` | `island.js:1835-1914` | 待验证：布局与滚轮边界有断言（`island-ui.test.mjs:107-123`），4 行上限/未读计数/批量已读无断言；MIME 有服务测试（`services.test.mjs:420-456`） |
| 页 5 专注 | 96px 环 ＋ 计时 ＋ 三键 ＋ 本轮/本日两行 | `focusPage()` | `island.js:2155-2204` | 已确认（`island-ui.test.mjs:237-256`；服务 `services.test.mjs:68-140`） |
| 页 6 待办 | 清单、添加行、优先级/重复、完成态 | `todoPage()` | `island.js:2261-2338` | 待验证：无该页渲染/交互断言 |
| 页 7 健康 | 喝水/久坐两行 ＋ 9 天柱图 | `healthPage()` | `island.js:2205-2242` | 待验证：服务有测试（`services.test.mjs:143-238`），页面渲染无断言 |
| 页 8 置物架 | 拖入文件、搜索、分组折叠、剪贴板块 | `shelfPage()` | `island.js:2434-2466` | 待验证：页面无断言 |
| 页 9 设备 | 5 行设备、电量条、置顶★、刷新、系统蓝牙 | `devicesPage()` | `island.js:2597-2700` | 已确认（`devices-settings.test.mjs:176`、`island-ui.test.mjs:132-165`） |
| 页 10 日程 | 7×5 月历 ＋ 当日行 ＋ 内联编辑（保存/删除） | `calendarPage()` | `island.js:1942-2138` | 待验证：服务/ICS 有测试（`ics.test.mjs`、`services.test.mjs:357-419`），月历与编辑器渲染无断言 |
| 页 11 消息 | 4 行会话切换（微信/QQ/企微/飞书/钉钉） | `messengerPage()` | `island.js:1732-1785` | 已确认（`island-ui.test.mjs:95-105`） |
| 状态·电量 | 13px 格位电池图标 ＋ `82%`；≤12% `--bad`、≤30% `--warn`；充电叠闪电 | `statusItems` 含 `battery` 且有值 | `status-view.js:18-31`、`island.js:695-696` | 已确认（`status-order.test.mjs:189-220`） |
| 状态·时间 | `15:41` / `3:41 PM`（12 小时制小时不补零） | 恒可用 | `status-view.js:39-45` | 已确认（`status-order.test.mjs:192-198`） |
| 状态·温度 | `17°`，按 `weather.unit` 换算 | 有天气读数时 | `status-view.js:53-57` | 已确认（`status-order.test.mjs:200-206`） |
| 状态·余额 | `¥20.8`；无读数返回空串表示不画 | `quotaText(quotaState.last)` | `status-view.js:65-68`、`island.js:701-707` | 已确认（`status-order.test.mjs:208-219`） |
| 状态·颜文字 | `(｡･ω･｡)`；至少一个真实读数存在才出现 | `statusItems` 显式勾选 | `island-pill.mjs:21`、`:243-248`、`island.js:708-710` | 已确认（`island-pill.test.mjs:589-623`） |
| 页码 / 圆点 / 箭头 | `01 / 11`、活跃点、上一页下一页 | `renderPage()` | `island.js:2955-2975`、`island-header.mjs:15-18` | 已确认（`island-ui.test.mjs:51-83`）；**圆点是装饰、不可点**（§8-2） |
| 页切换朗读 | `role="status"` 的 `#page-announcer` | 每次成功切页 | `island.html:46`、`island.js:2844-2848`、`:2966-2970` | 已确认（静态断言同上） |

## 4. 数据与存储

岛自己不拥有任何数据文件：它只上报尺寸/命中，其余全部是主进程推送的快照（`preload-island.js:53-90`；`main.js:1967-1990`）。

| 数据 | 位置 / 文件 | 写入者 | 读写时机 | 备注 |
| --- | --- | --- | --- | --- |
| 全部偏好 | `%APPDATA%/EmojiTot/prefs.json`（`main/paths.js:13`） | 设置窗、托盘、岛（仅天气城市与设备★） | 启动 `island:bootstrap`（`main.js:2070`）；之后 `settings:changed` 全量推 | 岛相关键：`islandWidth`/`pillHeight`/`islandTopGap`/`clickThrough`/`displayId`/`avoidTopBar`/`oledShift`/`timeFormat`/`wheelPaging`/`blurCollapse`/`hover*`/`skin`/`theme`/`reduceMotion`/`music.*`/`devices.*`（`schema.js:183-349`、CONSUMERS 797-890） |
| 页面开关与顺序 | `prefs.pages` / `prefs.pageOrder` / `prefs.defaultPage` | 设置·页面管理 | 渲染前读；改后 `settings:changed` | 岛侧 `enabledPages()` 有"清单新增页自动追加"回退（`island.js:195-216`） |
| 状态组件与顺序 | `prefs.statusItems` | 设置·页面管理（常驻排列） | 每次 `renderPillStatus()` | 只认 `STATUS_MANIFEST` 的 5 个 key |
| 设备显示规则 | `prefs.devices.{showBattery,pinned,hidden,order}` | 设置·设备页 ＋ 岛上★（`island:devices-pin`） | 设备页渲染与状态轮换 | 置顶上限 3（`DEVICE_PIN_LIMIT`，`schema.js:637`） |
| 服务快照 | 主进程内存 ＋ 各服务缓存文件（如 `cache-*.json`，`main/paths.js:15`） | 各服务 | 变化即推 `island:*` | 岛从不轮询（`docs/ARCHITECTURE.md:30`） |
| 天气城市 | `prefs.weather.{city,autoLocate}` | 岛城市菜单 → `api.patchPrefs()` | 选择即写 | `island.js:1406-1414` |
| 主进程瞬态 | 进程内存，不落盘 | 光标轮询 / 避让 / 全屏守卫 | 每帧或每次事件 | `clickThrough`/`hitRect`/`windowRect`/`avoiding`/`hiddenByFullscreen`（`main/island.js:45-58`、`:238-239`；`main.js:1320`、`:1355`） |
| 岛内瞬态 | 页面内存，不持久化 | 用户交互 | 每次渲染重建 | `pageIndex`/`pageDir`/`open`/`musicLyricsMode`/`volumePanelOpen`/`calendarView`/`mailFilter`/`shelfQuery`（`island.js:184-193`、`:969-973`、`:1055-1056`、`:1786-1791`） |
| 调试夹具 | `src/renderer/island-fixtures.mjs` 常量 | 无（只读） | 仅捕获脚本注入 | 依赖 `prefs.rendererDebug`（schema 无此键，§8-9） |
| 截图产物 | `apps/desktop/.ui-capture/`（产物，不逐行分析） | `capture-ui.mjs` | 手动运行 | 含 `island-collapsed`/`island-01..11-<key>`/`island-avoid`/`island-notification`（`capture-ui.mjs:354-471`） |

**主进程 → 岛（单向推送，岛侧只订阅）**：

| 通道 | 发送方 | 岛侧消费 | 载荷要点 |
| --- | --- | --- | --- |
| `island:battery` | `main.js:1744` | `onBattery` → `renderPillStatus` | `{level, charging}` |
| `island:weather` | `main.js:1754` / `:1764` | `onWeather` | 成功为天气对象；失败为 `{error}`（岛保留旧读数） |
| `island:media` | `main.js:1923` | `onMedia` | 标题/歌手/封面/进度/`live`/`controls` |
| `island:lyrics` | `main.js:1930`、`:1946`、`:1951`、`:1963` | `onLyrics` | `{synced, lines[], duration, loading, unavailable}` |
| `island:focus` / `island:health` / `island:todos` | `main.js:1967-1969` | 各自 `on*` | 本地服务快照 |
| `island:shelf` / `island:clipboard` | `main.js:1970-1971` | `onShelf` / `onClipboard` | 文件列表 / 剪贴板条目 |
| `island:messenger` / `island:devices` | `main.js:1973-1975` | `onMessenger` / `onDevices` | 会话行 / 外设与电量 |
| `island:mail` / `island:calendar` | `main.js:1979-1988` | `onMail` / `onCalendar` | 邮件摘要 / 事件与订阅 |
| `island:quota-agent` | `main.js:1025` | `onQuotaAgent` | 余额与 Agent 一次同帧 |
| `island:cast` / `face:apply` | `main.js:359`、`:1666` | `onCast` / `onFace` | 只改 `cast`/`state` 属性，岛不算表情 |
| `island:hover` | `main/island.js:221`、`:315` | `onHover` | `true` 进入即展开（`false` 走收起计时） |
| `island:avoid` | `main.js:1357` | `onAvoid` | 布尔；与 `open` 一起决定是否收成 slit |
| `island:moved` | `main/island.js:143` | `onMoved` | 接到 `scheduleGlassRefresh`，但玻璃四函数已清空为空实现（`island.js:3455-3469`，见 §8-16） |
| `settings:changed` | `main.js:2380`、`:2426` | `onPrefs` | 全量 prefs |

**岛 → 主进程（全部经 `guard` 白名单）**：

| 通道 | 类型 | 用途 | 上限/校验 |
| --- | --- | --- | --- |
| `island:box` | send | 内容尺寸 → `setBounds` | 512B；`w/h` 必须 1–10000 |
| `island:prepare-size` | invoke | 展开前预扩容 | 同上 |
| `island:hit` | send | 命中矩形 ＋ `collapsed` | 256B |
| `island:bootstrap` | invoke | 首帧全量快照 | `main.js:2070-2100` |
| `media:control` | invoke | 播放/暂停/切歌/seek/速率/重复/随机 | `kind` 白名单见 `services/media.js:619` |
| `media:hold-paused` | invoke | 暂停恢复按钮重新计时 | `main.js:2212-2214` |
| `volume:get` / `volume:set` / `volume:mute` | invoke | 主音量 | `main.js:2218-2220` |
| `local:get` / `local:do` | invoke | focus/health/todo/shelf/clipboard/messenger/devices | 动作白名单（`security.test.mjs:50-92`） |
| `mail:do` / `calendar:do` / `quota:do` | invoke | 三个远程/账号服务 | `main.js:1990-2008` |
| `settings:open` / `settings:patch` / `settings:openSystem` | invoke | 打开设置页 / 写偏好 / 打开系统蓝牙 | `preload-island.js:42-50` |
| `island:devices-pin` / `island:devices-focus` / `island:devices-refresh` | invoke/send | 置顶 / 唤醒探测 / 刷新 | `main.js:2112-2139` |

## 5. 状态与异常矩阵（只列真实存在的分支）

| 场景 | 当前表现 | 实现位置 | 备注 |
| --- | --- | --- | --- |
| 首帧加载 | 先画 pill；`bootstrap()` 回来后再补数据 | `island.js:4607-4633` | 早于监听的推送由 `island.onLoaded()` 重放（`main.js:2377-2384`） |
| 天气首次读取 | `正在获取天气 / 第一次需要几秒钟` | `island.js:1423-1425` | warn 调 `stateBlock()` |
| 天气失败且无旧读数 | `天气没连上 / 检查网络，五分钟后自动重试` ＋「去设置」 | `island.js:1424` | 文案与真实节奏不符（§8-6） |
| 天气失败但有旧读数 | 保留上次读数，不画失败块 | `island.js:4410-4426` | `onWeather` 遇 `{error}` 只记 `weatherError` |
| 歌词加载中 | 媒体页歌词窗显示 `正在同步歌词…` | `island.js:792-796` | 与"媒体为空"是两个不同状态 |
| 歌词服务失败 | `歌词服务连接失败` | `island.js:794` | `lyrics.unavailable` |
| 该曲无同步歌词 | `这首歌没有同步歌词` | `island.js:795` | 胶囊回退到歌名（`pillContentPlan`） |
| 邮箱首次同步 | `正在同步邮箱 / 第一次同步要等一会儿` | `island.js:1887` | |
| 邮箱失败 | `邮箱没连上` ＋ `mailErrorLine(error)` ＋「去设置」 | `island.js:1885` | |
| 邮箱部分失败 | 页头统计行显示 `部分失败` | `island.js:1852` | 与"整体失败"分开 |
| 日程订阅部分失败 | 顶部一行 `N 个订阅拉取失败：…` | `island.js:1943-1946` | |
| 设备扫描中 | `正在检测外设 / 蓝牙与 HID 列表通常一秒内出现` | `island.js:2642` | |
| 设备全隐藏 | `设备都隐藏了` ＋「去设置」 | `island.js:2640` | 与"无设备"分开 |
| 媒体空 | `没有在播放的媒体 / 打开播放器后这里会显示` ＋「去设置」 | `island.js:863-865` | |
| 额度无账号 / 查不到 / 不可用 | `还没有连接额度账号`；`额度暂时查不到` ＋ provider 与服务给的原因；`额度不可用` ＋「充值后点刷新看看」；后两者都带「刷新」（`data-local="quota:refresh"`） | `island.js:1617-1625`、`:1651-1657`、`:1665` | 三种失败分开画，不把"查不到"画成 0 |
| 专注/健康/待办/置物架未开 | 各自一句 ＋「去打开」指向对应设置页 | `island.js:2164`、`:2208`、`:2265`、`:2436` | 开关先于计时逻辑判定 |
| 页面全关 | 标题 `还没有页面`、副题 `去设置里打开`、页码 `00 / 00`、箭头隐藏 | `island.js:2913-2932` | 有静态断言（`island-ui.test.mjs:52-63`） |
| 单页 | 箭头与圆点都隐藏 | `island-header.mjs:15-18`、`island.js:2971-2975` | `pagingVisibility(1)` |
| 通知插页 | 3.5s 后回原页并恢复滚动位置 | `island.js:2880-2905` | 无生产通道（§8-1） |
| 自动避让 | 收成 6px slit；`visibility:hidden` 保留 pill 布局盒以保证可测 | `island.css:2971-2987`、`island.js:4349-4357` | 收起期不上报 box（`island.js:251`、`:268-269`） |
| 音量设置失败 | `failVolume()` 记录失败态，面板不回滚成假值 | `island.js:1005-1024` | 无文案断言 |
| 系统蓝牙打不开 | 行内 `无法打开系统蓝牙设置` 并禁用该行 | `island.js:3989-4002` | |
| 想重试 | 额度「刷新」、设备「刷新」（请求期间禁用并显示 pending）、天气按 `max(5, intervalMin)` 定时重排 | `island.js:1651-1657`、`:2579-2596`、`main.js:1769-1772` | 没有统一的失败重试按钮 |

## 6. 功能合同（本模块最重要的一节）

合同分两张表：**A. 窗口与交互**（ISLAND-01～14）是"岛这个窗口怎么表现"；**B. 内容与数据**（ISLAND-15～27）是"页面上画什么、点下去发生什么"。每条都能单独验收。

### A. 窗口与交互

| ID | 功能 | 入口 | 行为合同（判定条件 / 时序 / 文案 / 数据副作用） | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- |
| ISLAND-01 | 窗口几何 | 任意 `setBox` | 窗口 = 页面实测 `box.w/h` ＋ 左右各 32px、上下各 36px；`box` 夹到 120–720 × 28–640；水平居中于目标屏工作区，纵坐标取 `topEdge()` | 已确认 | `main/island.js:28-31`、`:110-126`、`:418-435`；`island-motion.test.mjs:89-94` |
| ISLAND-02 | 尺寸上报链路 | `ResizeObserver(#frame)` | `measure()` → microtask → `api.reportBox({w,h})`；morph / preparing / 避让收起 三种情况直接 return；展开前 `prepareBox()` 先把原生窗口扩到面板尺寸 | 已确认 | `island.js:252-291`、`:3286-3308`；`island-motion.test.mjs:89-94`、`:121-126` |
| ISLAND-03 | 窗口与内容漂移自愈 | 每次 `place()` / 渲染后 | `place()` 与真实 `getBounds()` 比对，不等才 `setBounds` 并 `webContents.invalidate()`；`stageNeedsRecovery` 在落定后检测"面板大于窗口"并补报 | 已确认 | `main/island.js:128-137`、`island-motion.mjs:133-147`、`island.js:3286-3308` |
| ISLAND-04 | 点击穿透轮询 | 常驻 `startCursorWatch()` | 光标到"画面矩形"的间隙决定周期：在内或 ≤180px → 25ms；≤700px → 120ms；更远 → 250ms；命中判定用 `contentRect()`（画出来的 pill/panel/slit），不是带留白的窗口 | 已确认（仅间隔值无单测） | `main/island.js:275-321`、`:247-257`；`window-state.test.mjs`（`passThroughFor`） |
| ISLAND-05 | 穿透偏好与收起例外 | `prefs.clickThrough` | 默认 `true`：光标不在画面内时窗口不接收鼠标；`false`：整个窗口接收鼠标；**例外**：`collapsed && !inside` 时一律穿透，避免 slit 的死区吞点击 | 已确认 | `main/island.js:217-222`、`:312`、`:514-522`；`window-state.js:9-11`；`schema.js:236` |
| ISLAND-06 | 悬停展开 | 主进程 `island:hover(true)` 或页面 `mousemove` | 进入后 `hoverOpenDelay`（默认 100，上限 800）毫秒展开；延迟 ≤0 视为不展开；**当前设置窗没有该值的写入控件**（§8-7） | 待验证（无测试） | `island.js:4246-4259`、`:4378-4397`；`schema.js:276` |
| ISLAND-07 | 悬停自动收起 | 离开画面 | `hoverAutoHide !== false` 时，`hoverCloseDelay`（默认 120，夹 120–2000ms）后收起；关掉后悬停仍会展开、只是不再自动收 | 待验证 | `island.js:4261-4270`；`schema.js:277-278` |
| ISLAND-08 | 点按展开 | `pointerdown`（`button === 0`） | 只有落在"当前画面"（pill/panel/slit）上才展开；已展开不重入；折叠动画中按下会改写意图（morph retarget），从屏幕上的盒子继续 | 已确认 | `island.js:3676-3692`、`:3494-3502`；`island-motion.test.mjs:74-80` |
| ISLAND-09 | 收起路径 | Escape / 窗口失焦 / 离开画面 / 主进程 hover=false | Escape 与失焦受 `blurCollapse` 控制（默认 true）；没有"点外部收起"处理器（窗口只有岛那么大，外部点击到不了页面） | 已确认（Escape 有断言） | `island.js:4186-4187`、`:4214-4217`；`island-ui.test.mjs:268-282` |
| ISLAND-10 | 按钮翻页 | 底栏「上一页/下一页」 | `pointerdown` 立即翻页（窗口变大后 click 时常丢失）；键盘/辅助技术走 `click` 且 `detail === 0`；首尾页禁用，**不循环** | 已确认 | `island.js:3721-3757`、`:2972-2975`；`island-ui.test.mjs:73-82` |
| ISLAND-11 | 页码与分页可见性 | `renderPage()` | 页码 `NN / 总页数`（两位补零）；页数 >1 才出箭头与圆点；圆点 `aria-hidden` 且无点击处理器 | 已确认（圆点见 §8-2） | `island.js:2955-2975`、`island.html:58`、`island-header.mjs:15-18` |
| ISLAND-12 | 滚轮翻页 | 在 `#panel` 上滚 | `deltaY` 绝对值 ≥ 8px 才翻一页（方向取符号）；`wheelPaging === false` 时完全禁用；**没有节流/锁**，一次手势的多个事件会连翻；内部滚动区（`.clip-list`/`.shelf-list`/`.todo-list`/`.dev-list`/`.msg-list`/`.mail-page`/`.mail`/`.quota-scroll` 或任何 `overflow-y` 且可滚的块）在捕获阶段吞掉滚轮；`.quota-scroll` 即使无内容可滚也吞；城市菜单打开时全吞 | 已确认（边界有断言；无锁属风险，§8-5） | `island.js:3011-3069`、`:4198-4203`、`:3028-3045`；`island-ui.test.mjs:115-165`、`:202-208` |
| ISLAND-13 | 键盘翻页 | `#panel` 内按键 | ←/→ 翻页；Escape 收起；焦点在 `input/textarea/select/[contenteditable]` 时不翻页；切页朗读 `页名，第 N 页，共 M 页` | 已确认 | `island.js:4186-4196`、`:2844-2848`；`island-ui.test.mjs:264-296` |
| ISLAND-14 | 页面切换动画 | 任一翻页入口 | 方向由 `pageDir` 决定，用 `page-in-left`/`page-in-right` 类；重启动画前先 `void offsetWidth` 强制回流，连续同向翻页也会重放 | 待验证（静态实现，无动画观感断言） | `island.js:2976-2982`、`:2830-2851` |

### B. 内容与数据

| ID | 功能 | 入口 | 行为合同（判定条件 / 时序 / 文案 / 数据副作用） | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- |
| ISLAND-15 | 状态组件绘制 | 每次 `renderPillStatus()` | 按 `statusItems` 顺序绘制；**无读数不画占位**；颜文字只有在至少一个真实读数存在时才出现；整行超过 `--pill-max-w` 时从尾部整组件裁剪并补 `…`，绝不出现半个数字 | 已确认 | `island-pill.mjs:243-248`、`:297-312`；`island.js:407-443`；`island-pill.test.mjs:55-74`、`:624-660` |
| ISLAND-16 | 电量/时间读数规则 | 同上 | 电量 ≤12% 用 `--bad`、≤30% 用 `--warn`，0% 仍留 2px 格位；充电叠闪电；时间 24h 全补零，12h 小时不补零、分钟补零 | 已确认 | `status-view.js:18-57`；`status-order.test.mjs:189-220` |
| ISLAND-17 | 胶囊内容三态 | `pillContentPlan()` | ① 正在播放 → 歌词一行 ＋ 歌名作次要行（无歌词回退歌名）；② 无播放但至少一个读数 → 状态行；③ 都没有 → 只留角色脸。文字槽固定（`min(240px×uiScale, 剩余空间)`），切歌词只换文字、不重测宽度 | 已确认 | `island-pill.mjs:257-284`；`island.css:106-123`；`island-pill.test.mjs:180-236`、`:313-333` |
| ISLAND-18 | 暂停音乐交还状态行 | `shouldCollapseForPausedMusic()` | 仅"正在播放的音乐 → 暂停"这条边触发；直播或视频暂停不触发；若面板停在媒体页则回 `defaultPage`；恢复按钮可见性由 `pausedResumeVisible()` 决定，空闲 `music.pausedHideMin`（0 = 永不）后消失；悬停/聚焦重新计时 | 已确认 | `island-pill.mjs:146-191`；`island.js:628-675`、`:4428-4482`；`island-pill.test.mjs:334-404` |
| ISLAND-19 | 恢复按钮行为 | 点按 `#paused-resume` | 调 `api.control('toggle')`；请求期间禁用；`aria-label`/`title` = `继续播放：歌名 - 歌手`；封面仅在 `data:image/*` 时显示 | 已确认 | `island.js:653-668`、`:3694-3708`；`island-pill.test.mjs:397-404` |
| ISLAND-20 | 歌词同步时钟 | `scheduleLyricClock()` | 播放位置 = 采样位置 ＋ 已过时间×`rate`（rate 夹 0.25–4），夹到 `duration`；高亮行用二分查找，容差 0.0005s；偏移 `music.offset`（默认 0.35s）提前；下一句按剩余时间排一次 `setTimeout`，暂停则不排 | 已确认 | `lyric-clock.mjs:1-45`；`island.js:1214-1267`、`:232-239`；`lyrics-clock.test.mjs` |
| ISLAND-21 | 直播识别与计时 | 媒体帧 / 媒体页 | `isLiveMedia()` 以 provider 元数据、B 站标题、斗鱼来源为正向证据，**不把"没有时长"当直播**；直播无 `startedAt` 时显示 `直播中`，有则显示 `HH:MM:SS`；暂停时冻结 `liveFrozenAt`，恢复后从真实起点继续；直播页每秒刷新一次（仅当媒体页可见） | 已确认 | `island-pill.mjs:128-138`、`:219-234`；`island.js:848-861`、`:1268-1317`、`:4735-4738`；`island-pill.test.mjs:425-498` |
| ISLAND-22 | 媒体来源命名 | 媒体页来源行 | 平台/文件名 → 可读中文（网易云音乐、QQ音乐、哔哩哔哩、Spotify…）；未匹配时清洗 exe 名与后缀；空 → `未知来源`；直播无来源 → `直播来源` | 已确认 | `island-pill.mjs:33-49`、`:92-118`；`island-pill.test.mjs:406-424` |
| ISLAND-23 | 媒体页 seek | 进度轨拖动/键盘 | 有 `duration` 才可 seek（`canSeek`）；指针按下即开始擦洗；←/→ 每次 ±5s，Home/End 到两端；提交精度 0.1s；提交后 900ms 内抑制回写 | 已确认 | `media-controls.mjs:45-86`；`island.js:1055-1163`；`media-controls.test.mjs:477-533` |
| ISLAND-24 | 通知插页 | `receiveNotification()` | 标题非空才显示；`notify.system === false` 直接忽略；`notify.body === false` 不显示正文；正文缺省 `当前页面将在 3.5 秒后恢复`；页面标题临时变 `临时通知`；`NOTIFICATION_MS = 3500` 后回原页并恢复 `pagesEl.scrollTop`；收起态则 pill 显示 `3.5 秒后恢复` | 开发中 | `island.js:2853-2905`、`:2947-2950`；缺通道见 §8-1 |
| ISLAND-25 | 自动避让 | 主进程 `island:avoid` | `avoiding && !open` 时收成 6px 高、宽 `max(48, island-w/3)` 的 slit；展开优先于避让；收起期间不报 box（否则窗口跟缩、命中矩形两帧翻转） | 已确认（视觉规则来自 CSS，岛侧无单测） | `island.js:4344-4375`、`:251`、`:268-269`；`island.css:2971-2987`；`main.js:1359-1379` |
| ISLAND-26 | 邮件页 | 邮件页 / tab / 行操作 | 4 行上限（`MAIL_ROWS`）；未读数取账号自己的答复而非可见切片；未读 tab 只列未见过的；「全部已读」按当前账号范围批量写；写入失败写 `mailActionError` 后重绘，不做乐观更新 | 待验证（布局与滚轮有断言；行操作与计数无断言） | `island.js:1786-1914`、`:3893-3930`；`island-ui.test.mjs:95-124` |
| ISLAND-27 | 写入路径 | 页内所有写操作 | `local:do`/`mail:do`/`calendar:do`/`quota:do` 返回**完整快照**，渲染层用它整体重绘；渲染层不预测结果、不局部打补丁（例外：纯 UI 折叠态如剪贴板、歌词模式在本页内切换） | 待验证（源码一致，无专门断言） | `island.js:3940-3971`、`:2812-2825`、`:4015-4021`；local:do 返回见 `main.js:2019-2060` |

## 7. 不可随意改变（红线）

1. **尺寸只有一个来源**：页面实测 `#frame` → `reportBox` → 主进程 `setBounds`。不要在主进程硬编码展开宽高，也不要用 `setZoomFactor`（`main/island.js:110-137`、`island.js:252-291`；`docs/ISLAND.md:52` 有更早的理由记录）。
2. **32/36px 透明留白**：16px 时代 22px 圆角与 50px 阴影会被 Windows 裁成直边，留白由此而来（`main/island.js:21-31`）。不要为"看起来更贴边"改小。
3. **morph 期间不得上报中间盒**：否则窗口被 168×36 类中间值压一下，露出裁切与首帧跳动（`island.js:270-277`；断言 `island-motion.test.mjs:121-126`）。展开前必须先 `prepare-size` 扩容。
4. **命中判定用画出来的矩形**：窗口带留白，用窗口当命中区会让指针路过空白就展开（`main/island.js:146-179`、`:265-312`）。收成 slit 时留白还必须穿透。
5. **收起态不上报 box**：否则窗口跟着缩 → 判定矩形移动 → 避让状态两帧内来回翻（`island.js:244-251`）。
6. **panel 与 pill 不同时参与 flex**（两者 `flex: none`）：否则量到 252px 的假面板宽度，原生窗口按错误尺寸扩容（`island.js:3511-3519`；`island.css` `.pill/.panel` 规则）。
7. **文字槽固定 240px×uiScale**，切歌词只换文字：重测宽度会让胶囊随歌词呼吸（`island.css:106-123`；`island-pill.mjs:268-280`）。
8. **状态行不画占位、截断只切整组件**：半个 `¥20.` 比缺一格更糟（`island-pill.mjs:288-312`）。
9. **通知固定 3.5s 并恢复滚动位置**（`island.js:2853`、`:2880-2905`）。
10. **不使用系统材质/窗口 shape**：岛窗口 `material()` 恒为 `none`，卡片全部由 CSS 画；`applyIslandShape()` 在非 acrylic 下直接返回（`preload-island.js:20`、`main.js:501-505`）。
11. **11 页 ＋ 5 状态组件的清单只有一份**：`PAGE_MANIFEST`/`STATUS_MANIFEST`。新增页 = manifest 加一项 ＋ `RENDERERS` 加一条（`island.js:2702-2714`；`docs/UI-AUDIT.md:161` 加页说明）。
12. **所有页面共用 260px 视口**，不按页面变高；内容溢出必须由页内滚动区消化（`island.css:66-69`；`docs/UI-AUDIT.md:25` 的合同）。
13. **内层滚动区必须自带 `overscroll-behavior: contain` 并被 `WHEEL_OWNERS` 或通用 `overflow-y` 规则覆盖**：滚轮不许从列表链到分页（`island.css` `.dev-list`/`.quota-scroll`；`island-ui.test.mjs:139-154`）。
14. **三张 CSS 的加载顺序**：`island.css` → `polar-graphite.css` → `polar-graphite-parity.css`；焦点环与 22px 页轨的 44×32 命中层靠 parity 层最后落地（`island.html:8-10`；`island-ui.test.mjs:305-331`）。
15. **安全三件套不能退**：`sandbox`/`contextIsolation`/CSP/`guard` 白名单，任何一条被放松都会被 `security.test.mjs:152-175` 直接判失败。

## 8. 已知缺口与风险

1. **通知插页没有生产通道（开发中）**：`island.js:4592` 调 `api.onNotification?.()`，但 `preload-island.js` 没有该方法，全仓也没有任何 `island:notify` 发送方；今天只有 `capture-ui.mjs:457` 通过调试钩子 `window.__emojitotNotification` 能触发。用户拿不到这个效果。
2. **圆点不可点**：`#dots` 在 `island.html:58` 是 `aria-hidden="true"` 的容器，`renderPage()` 往里写 `<i class="dot">`（`island.js:2955-2957`），全文件没有 `[data-page]` 的点击处理器。`docs/ISLAND.md:48` 写"底部圆点换页"、`docs/UI-AUDIT.md:144` 写"逐页点 `#dots button`"，均与代码不符。
3. **顶栏播放标题未接线（已废弃）**：`island-header.mjs:11-13` 的 `islandHeaderState()` 只有测试在用（`island.js:27` 只导入 `pagingVisibility`），顶栏实际由 `renderHeader()` 写页名（`island.js:388-392`）。`docs/ISLAND.md:29` 的"顶栏只放正在播放的标题"已不成立。
4. **外设电量轮换是死代码（已废弃）**：`ensureBatteryRotation()` 每 2s 推进 `batteryIndex` 并调 `renderSub()`，但 `renderSub()` 只写 `page.sub` 固定文案（`island.js:355-361`、`:372-386`），`batteryEntries()` 的结果没有出口；文件上方"状态行不是页描述"的注释（`:317-324`）与实现相反。
5. **滚轮无锁**：`deltaY` 绝对值 ≥ 8px 即翻一页且无冷却（`island.js:4198-4203`）。推断：一次触控板惯性可能连翻多页；全局规范要求"一次手势最多一页"，当前不满足。**未验证**（需真机触控板实测）。
6. **天气空态文案与节奏不符**：页面写"五分钟后自动重试"（`island.js:1424`），实际定时器是 `max(5, weather.intervalMin)`，默认 15 分钟（`main.js:1769-1772`、`schema.js:332`）。
7. **三个尺寸偏好没有写入口（开发中）**：`islandWidth`/`pillHeight`/`islandTopGap` 在 `DEFAULTS` 有定义、岛也读，但设置窗只有装饰字段 `visualField`（`settings.js:294-295`、`:546-550`），`rowRange` 只用于 `uiScale` 与 `radius`（`settings.js:474`、`:551`）。`main/island.js:82-85` 注释称"设置滑块是唯一写入者"，当前无滑块 ⇒ 用户改不动岛宽、胶囊高、顶部间距；`settings.js:549` 的兜底值还是 12（`DEFAULTS` 是 8）。
8. **悬停/折叠/快捷键三项文案与键不符**：`悬停展开预览` 实际写 `hoverAutoHide`（`settings.js:799-803`）—— 关掉后悬停仍展开、只是不再自动收（`island.js:4246-4270`）；`双击折叠` 实际写 `blurCollapse`（窗口失焦，不是双击，`island.js:4214-4217`）；`显示/隐藏快捷键` 是装饰字段 `Ctrl + Shift + I`（`settings.js:824`），真实快捷键是 `Alt+Shift+T`（`main.js:1338`）。设置窗属另一模块，此处只记"岛的入口与岛上行为不一致"。
9. **调试夹具依赖 schema 之外的键（实验性）**：`island.js:4657-4707` 的四个 `__emojitot*` 钩子都以 `prefs.rendererDebug` 为门，但 `rendererDebug` 不在 `DEFAULTS`（`schema.js:183-349`），`filterPatch` 会拒写它（`schema.js:450-464`）。只有 `capture-ui.mjs:63-64` 直接写 `prefs.json` 才成立 ⇒ 夹具体系只在 throwaway profile 里可用，不是用户可开的开关。
10. **速率/重复/随机面板未接线（开发中）**：`media-controls.mjs:97-140` 提供 `controlSupport()`/`advancedSections()`，`main/services/media.js:619-654` 也支持 `rate/repeat/shuffle` 命令，测试齐（`media-controls.test.mjs:534-582`），但 `island.js` 没有导入这些函数、页面也没有对应 DOM（全文件搜不到 `data-rate`/`data-repeat`/`data-shuffle`）。能力链断在渲染层。
11. **`pausedResumeEnabled()` 读的是 `music.islandLyrics`**（`island.js:628-630`）：关掉"岛上显示同步歌词"会连带让暂停恢复按钮永不出现。设计上可解释（同属"岛上媒体视图"），但设置页把它描述成两件事，推断：用户会当成 bug（`CONSUMERS` 的 `music.islandLyrics` 一项）。
12. **文档漂移（不改代码也会误导人）**：`docs/ARCHITECTURE.md:28` 的"每 60ms 读一次光标"已被 25/120/250ms 替代（`main/island.js:275-285`）；`docs/ISLAND.md:93`、`:103` 的"5px 横条"与"42%"现在是 6px、`island-w/3`（`island.css:2921-2973`、`island.js:4344-4346`）；`docs/ISLAND.md:49` 的"悬停 300ms 轻微放大 1.04、不展开"现在是 100ms 展开 ＋ `scale(1.02)`（`schema.js:276`、`island.js:4246-4258`、`island.css:507`）；`docs/ISLAND.md:48` 的"横向滚轮"实际只读 `deltaY`（纵向），`deltaX` 全文件没有分支（`island.js:4198-4203`）；`docs/ISLAND.md` 的页面表只有 10 页（缺 `messenger`）。
13. **首帧页码是硬编码的 `01 / 11`**（`island.html:59`）：`renderPage()` 会立刻改写它（`island.js:2960-2963`），推断：冷启动最多闪一帧错误页码；若页面清单不再是 11 页，这一帧会读到错的数字。
14. **推送触发的重绘会丢页面滚动位置**：`renderPage()` 整体替换 `pagesEl.innerHTML`（`island.js:2952`），只有通知插页显式保存/恢复 `scrollTop`（`:2885`）；邮件、设备、日程长列表在服务推送到达后会回到顶部。推断：真实体验如此，无测试覆盖。
15. **岛没有多语言**：`lang` 只影响设置窗（`schema.js:200-206` 注释明说岛、托盘、更新卡与引导窗未接），岛上文案全部硬编码中文（如 `island.js:864`、`:1424`、`:2921`）。切英文会出现中英混排；**未验证** UI 表现。
16. **玻璃材质四函数是空实现（已废弃）**：`clearGlass()`/`requestGlass()`/`scheduleGlassRefresh()`/`syncGlassMaterial()` 在 §"no glass" 段里全部为空（`island.js:3455-3469`），但调用点仍在：`setOpen()` 收放时 `clearGlass()`/`requestGlass()`（`:3479`、`:3616`）、`window resize` 与 `island:moved` 订阅 `scheduleGlassRefresh`（`:4224`、`:4595`）。推断：这是"桌面截图作为背景"方案的残留，现在只是每帧多一次空调用，不影响画面。
17. **未验证项**（本次只读分析，未启动应用、未跑 `pnpm ui:audit`）：悬停与滚轮的真机手感、多显示器/混合 DPI 下 `setBounds` 的稳定值、OLED 漂移在真实面板上的可感知度、`avoidance.ps1` 的实际轮询周期、`emojitot-ball` 在 `state` 变化时的重绘开销。以上只有源码与注释证据，没有运行期观测。
