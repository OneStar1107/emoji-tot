# EmojiTot Polar Graphite R2 · Design QA

**Findings**

- `[已撤回] 原「主画板媒体页为纵向结构」是一条误读`
  Location: 灵动岛媒体页（island-01）。
  Evidence: 主画板原始 CSS 为 `#pgm-master .pgm-media { display:grid; grid-template-columns: 134px minmax(0,1fr); gap:16px }`，`.pgm-cover` 固定 134×134、`.pgm-media-copy` 在右列。即：主画板本身就是「封面 134px 在左 + 标题/歌词/控制在右」的左右双栏，不是纵向堆叠。
  Impact: 实机双栏与画板一致，原 P1 以「画板纵向、实机双栏」判定未达 1:1 的前提不成立，予以撤回。
  Fix: 无需改动；实机按 `134px + 1fr` 复现即为正确。
- 其余页面结构经画板 CSS 逐页核对后确认一致：天气 `128px + 1fr` + 五日预报（`repeat(5)`，无逐小时条带）、AI `1fr + 190px`、专注 `148px + 1fr`、待办 `112px + 1fr`、设备 `150px + 1fr`（4 台设备，无独立刷新按钮）、日程 `220px + 1fr`、消息 `126px + 1fr`。设备页实机 iPhone 电量与画板示例值不同属动态数据，允许差异。
- 旧版四栏截图只作为“文字被裁切”的缺陷参照，不作为新布局的像素目标；当前 R2 主画板和已打包实机截图才是当前视觉真值。

**Open Questions**

- 主画板使用示例数据，实机使用用户真实数据；后续对照必须区分“允许变化的动态值”和“必须一致的结构、字体、间距、组件几何与状态呈现”。
- 当前固定尺寸桌面产品不提供 320 px 窄屏布局；窄网页断点不属于这组 420 × 310 灵动岛和 1080 × 760 设置窗口的验收范围。
- 当前证据覆盖中文界面、暗色与浅色主题。其他语言的超长文本仍应在后续本地化版本中沿用同一自动文字边界检查。

**Implementation Checklist**

- 保持灵动岛 `420 × 310` CSS px、设置窗口 `1080 × 760` CSS px，不再恢复旧版四栏负偏移模板。
- 新增或修改页面时运行文字边界、卡片越界、控件最小高度和几何稳定性检查。
- 静态产品文案必须换行完整显示；只有动态值可以通过 `title` 或 `aria-label` 暴露完整内容后截断。
- 每次改页轨、页数或页脚后，同时验证上一页/下一页命中区、装饰进度点和 `data-pages` 数量一致。

**Follow-up Polish**

- 无阻塞型 P3。后续如增加新的语言或用户自定义超长角色名，只需扩展同一审计夹具，不改当前布局。

## 对照对象

- 用户缺陷参照：
  - `C:\Users\hyx11\AppData\Local\Temp\codex-clipboard-457025cd-2ba4-4b7b-b089-78eaf8a54551.png`
  - 2560 × 1598 px，旧版四栏画板，用于定位红框中的裁切缺陷。
- 当前视觉真值：
  - `C:\Users\hyx11\.codex\visualizations\2026\11\24\01a20af5-3034-71d3-b9f2-f2324ff75e5d\polar-graphite-master.html`
  - `E:\项目\EmojiTot\apps\desktop\.ui-capture\master-r2-1440.png`
  - 主画板 1440 × 7200 px；有效深色画板区域约 1024 px 宽，1440 px 页面其余区域为查看器留白。
- 当前实现（1:1 最终基线）：
  - `E:\项目\EmojiTot\apps\desktop\.ui-capture\final-dark\`
  - `E:\项目\EmojiTot\apps\desktop\.ui-capture\final-light\`
  - `E:\项目\EmojiTot\apps\desktop\.ui-capture\current-source-dark\`
  - `E:\项目\EmojiTot\apps\desktop\.ui-capture\current-source-light\`
- 已作废（1.5×、布局过期，仅作历史存档，不得用于对照）：
  - `E:\项目\EmojiTot\apps\desktop\.ui-capture\after-clipping-final\`
  - `E:\项目\EmojiTot\apps\desktop\.ui-capture\after-clipping-final-light\`

## 尺寸、密度与归一化

**当前基线（1:1）**：`final-dark` / `final-light` 与 `current-source-dark` / `current-source-light` 均为 1:1 CSS 像素抓取，直接与主画板同一逻辑尺寸对照，无需缩放换算。

| 表面 | CSS 尺寸 | 当前基线截图 | 密度 | 对照方式 |
| --- | ---: | ---: | ---: | --- |
| 灵动岛展开态 | 420 × 310 | 420 × 310 | 1× | 与主画板同逻辑尺寸逐页比较 |
| 灵动岛折叠态 | 约 345 × 51 | 同逻辑尺寸 | 1× | 检查角色、媒体、暂停/恢复和通知替换 |
| 设置窗口 | 1080 × 760 | 1080 × 760 | 1× | 逐页比较左栏、主内容和右侧岛预览 |
| 引导窗口 | 780 × 630 | 780 × 630 | 1× | 暗色、浅色各两页完整检查 |
| R2 主画板 | 1440 × 7200 | 1440 × 7200 | 1× | 与实机相同页面结构、字体层级、颜色 token 和组件状态对照 |

> 历史说明：早期 `after-clipping-final\` 与 `after-clipping-final-light\` 是 **1.5×** 抓取且布局已过期，**已作废**，不得与当前 1:1 基线混用或换算。当前有效证据目录为 `final-dark\`、`final-light\`、`current-source-dark\`、`current-source-light\`。

验收判断依据逻辑布局、文字边界、控件命中和状态完整性，而不是跨密度逐像素差异。

## 全览对照

![EmojiTot Polar Graphite R2 clipping evidence](E:/项目/EmojiTot/apps/desktop/.ui-capture/final-clipping-evidence.png)

合成图从同一输入中依次对照：

1. 用户旧版四栏红框缺陷。
2. R2 主画板完整纵向四段。
3. 11 个灵动岛展开页的暗色与浅色实机截图。
4. 16 个设置页面的暗色与浅色实机截图。
5. 两张引导页的暗色与浅色实机截图。

## 局部对照

用户红框主要集中在旧版的标题下方说明、状态短句、右侧操作按钮、日程输入/保存和设备电池行。R2 实机逐项重绘后对应的证据为（1:1 基线）：

- 设备：`apps\desktop\.ui-capture\final-light\island-09-devices.png`
- 日程：`apps\desktop\.ui-capture\final-light\island-10-calendar.png`
- 角色与表情：`apps\desktop\.ui-capture\final-light\settings-05-cast.png`
- 设备设置：`apps\desktop\.ui-capture\final-light\settings-13-devices.png`
- 系统托盘图标：`apps\desktop\.ui-capture\final-light\settings-14-tray.png`

这些局部图在 1:1 分辨率下检查过标题、副标题、状态说明、按钮文字、电池百分比、输入框、保存按钮、角色索引、昵称和托盘说明。没有发现文字字形越过自身盒、被兄弟元素覆盖、被固定高度切掉或出现未提供完整值的省略号。

## 覆盖矩阵

| 表面 | 暗色 | 浅色 | 已检查内容 | 结果 |
| --- | --- | --- | --- | --- |
| 灵动岛折叠态 | 通过 | 通过 | 角色、媒体标题、暂停/恢复、通知替换 | 通过 |
| 灵动岛展开页 01 | 通过 | 通过 | 媒体封面、歌词、时间、播放控制、页轨、齿轮 | 通过 |
| 灵动岛展开页 02 | 通过 | 通过 | 天气数值、体感/湿度/风速/日出日落文案、五日预报 | 通过 |
| 灵动岛展开页 03 | 通过 | 通过 | AI 状态、连接说明、额度、添加账号 | 通过 |
| 灵动岛展开页 04 | 通过 | 通过 | 邮箱状态、说明、添加邮箱 | 通过 |
| 灵动岛展开页 05 | 通过 | 通过 | 专注状态、说明、打开按钮 | 通过 |
| 灵动岛展开页 06 | 通过 | 通过 | 待办状态、输入、分类、到期、重复、添加 | 通过 |
| 灵动岛展开页 07 | 通过 | 通过 | 健康状态、说明、打开按钮 | 通过 |
| 灵动岛展开页 08 | 通过 | 通过 | 置物架空状态、说明、拖入区域 | 通过 |
| 灵动岛展开页 09 | 通过 | 通过 | 电量主值、蓝牙/电源切换、4 台设备与电池百分比 | 通过 |
| 灵动岛展开页 10 | 通过 | 通过 | 月历标题、星期/日期、今天状态、标题、时间、保存 | 通过 |
| 灵动岛展开页 11 | 通过 | 通过 | 消息空状态、说明、去设置 | 通过 |
| 设置 01 常规 | 通过 | 通过 | 开关、选择、分类、长说明 | 通过 |
| 设置 02 外观 | 通过 | 通过 | 主题、皮肤、圆角、透明度和强调色 | 通过 |
| 设置 03 尺寸与位置 | 通过 | 通过 | 滑块、数值、窗口位置、操作 | 通过 |
| 设置 04 隐藏与交互 | 通过 | 通过 | 多组开关、说明和按钮 | 通过 |
| 设置 05 角色与表情 | 通过 | 通过 | 角色预览、昵称、角色选择网格、表情网格 | 通过 |
| 设置 06 页面管理 | 通过 | 通过 | 页宽、页高、拖动排序、显隐开关 | 通过 |
| 设置 07 媒体与歌词 | 通过 | 通过 | 歌词开关、长说明、媒体信息 | 通过 |
| 设置 08 专注与饮水 | 通过 | 通过 | 专注、休息、饮水设置 | 通过 |
| 设置 09 待办与置物 | 通过 | 通过 | 待办、同步、置物架设置 | 通过 |
| 设置 10 通知、邮箱与日程 | 通过 | 通过 | 通知开关、邮箱、日程 | 通过 |
| 设置 11 AI 额度 | 通过 | 通过 | 连接、额度、阈值、更新 | 通过 |
| 设置 12 天气 | 通过 | 通过 | 城市、单位、更新、权限说明 | 通过 |
| 设置 13 设备 | 通过 | 通过 | 探测、电量、设备列表、顺序说明、脚注 | 通过 |
| 设置 14 系统托盘图标 | 通过 | 通过 | 托盘预览、菜单预览、入口选项、角色同步说明 | 通过 |
| 设置 15 插件 | 通过 | 通过 | 空状态、说明、插件入口 | 通过 |
| 设置 16 关于 | 通过 | 通过 | 版本、作者、更新、许可证、隐私说明 | 通过 |
| 引导 01 欢迎 | 通过 | 通过 | 标题、说明、下一步、系统安全区 | 通过 |
| 引导 02 设置 | 通过 | 通过 | 角色预览、输入框、选项、主按钮 | 通过 |

## 比较历史

| 迭代 | 发现 | 修复 | 修复后证据 |
| --- | --- | --- | --- |
| 1 | 旧模板的负偏移让标题说明、状态短句和右操作落进相邻布局轨道 | 灵动岛内容改为正向、正常流布局，页体使用内容感知高度 | 暗/浅 11 岛页 contact sheet |
| 2 | 状态说明使用 `nowrap` 和省略号，静态文案无法完整显示 | 说明改为多行换行；未提供完整可访问值的省略号列为失败 | `island-03` 至 `island-11` |
| 3 | 日程标题、错误提示和操作区相互覆盖 | 重排月历与今天面板，恢复输入/时间/保存的独立轨道 | `island-10.png` |
| 4 | 设备设置行和岛内电池行被固定高度或相邻元素切掉 | 动作行和设备列表改为正常流，预留脚注与按钮空间 | `island-09.png`、`settings-13-devices.png` |
| 5 | 天气温度行高过紧 | 修正温度标题的行高和纵向基线 | `island-02.png` |
| 6 | 媒体页没有填满可用高度 | 媒体内容改为填满岛体，同时保留页脚命中区 | `island-01.png` |
| 7 | 页轨命中区口径混乱（曾出现 44×44 / ≥32px 等互相冲突的写法） | 最终定稿：视觉高度严格 22px（画板真值），真实命中区 ≥44×32 由 `.pgm-page-btn::after { inset: 0 0 -10px 0 }` 提供；44×44 因 `overflow:hidden` 与底部 12px padding 下不可达而撤回；进度点为纯装饰 | 31/31 桌面冒烟 |
| 8 | 变形帧的双重阴影导致稳定性检查噪声 | 仅复合敏感变形帧禁用阴影，静止帧保留层级 | 31/31 桌面冒烟 |

## 自动与运行证据

- `pnpm --filter @emojitot/desktop test`：**565 passed，0 failed**（最终源码复跑）。
- `pnpm smoke:desktop`：**36/36 检查通过，exit 0**，包含岛屿开合、折叠回位、页轨 22px 视觉 + ≥44×32 命中区、两层 gradient、媒体页双状态、键盘守卫、天气空 placeholder、统一焦点环、假控件语义、15 官方角色联动、11 页管理、固定 1080×760 设置窗与窗口稳定性。
- `pnpm typecheck`：通过。
- `pnpm settings:check`：`docs/SETTINGS-AUDIT.md is up to date (81 preference paths)`。
- `pnpm --filter @emojitot/desktop run pack`：**通过**（`release/win-unpacked/EmojiTot.exe`，`app.asar` 于当次构建重新生成）。注意必须用 `run pack`；`pnpm --filter … pack` 触发的是 pnpm 自带的 tgz 打包，不是 electron-builder。
- `pnpm ui:audit -- --exe …/release/win-unpacked/EmojiTot.exe`：默认暗色轮 **PASS 27 pages, 0 violation(s)**。
- `pnpm ui:audit -- --theme light --exe …/release/win-unpacked/EmojiTot.exe`：浅色轮 **PASS 27 pages, 0 violation(s)**（新增 `--theme`，启动前写入临时 profile 的 prefs）。
- `pnpm ui:audit -- --skins all --stress --exe …/release/win-unpacked/EmojiTot.exe`：**PASS 3 skins @ stress · 33 island pages · 16 settings pages, 0 violation(s)**。
- `pnpm ui:audit -- --dump-tokens --exe …/release/win-unpacked/EmojiTot.exe`：6 组（3 皮肤 × 2 主题）computed token + WCAG 对比度，写入 `apps/desktop/.ui-capture/theme-tokens.json`；暗色 `fg 17.10 / faint 4.93`，浅色 `fg 13.38 / faint 4.58`，正文与次要文字全部 ≥ 4.5 AA，`good/info` 全部 ≥ 3。
- UI audit 覆盖 11 个灵动岛页和 16 个设置页，并正向断言检查到的文字节点数量大于 0，避免空审计误报为通过。
- 已检查控制台错误、页面异常、水平溢出、卡片越界、滚动区零高度、低于最小点击高度的持久控件和未完整暴露的省略号。
- 深/浅色：`final-dark` 与 `final-light` 两套 1:1 基线各 33 文件（31 PNG + 2 JSON）；13 张岛页（11 展开 + 折叠 + 通知）暗/浅 sha256 **全部不同**，`island-layout-metrics.json` 两套哈希不同、root color 各自正确——浅色岛体不再沿用深色。

### 真机安装版实测（`D:\EmojiTot\EmojiTot.exe`）

最终构建已安装到用户日常双击使用的安装目录，版本 `0.8.20.26`。只替换 `EmojiTot.exe`、`EmojiTotRuntime.exe`、`resources/app.asar` 三个程序文件；卸载器、`resources/elevate.exe` 与 `%APPDATA%\Roaming\EmojiTot` 下的用户数据全部保留，原件备份在 `.workbuddy/install-backup-2026-11-24/` 可回滚。

- `pnpm ui:audit -- --exe D:/EmojiTot/EmojiTot.exe`：暗色 **PASS 27 pages, 0 violation(s)**。
- `pnpm ui:audit -- --theme light --exe D:/EmojiTot/EmojiTot.exe`：浅色 **PASS 27 pages, 0 violation(s)**。
- `EMOJITOT_APP_EXE="D:/EmojiTot/EmojiTot.exe" node apps/desktop/scripts/window-smoke.mjs`：**36/36 检查通过**；真实安装版启动、独立临时 profile、真实点击 / 角色联动 / 翻页 / 设置窗 / 焦点验证 / 截图全部运行，截图 `.workbuddy/truetest/island-real.png`。
- 源码构建跑同一脚本同样 **36/36**，两轮逐项结果一致。
- 收尾修正的两处探针均属**测试代码缺陷，不是 UI 缺陷**：
  - A7-2 焦点环探针原来在岛窗口会话里对普通按钮程序化 `.focus()`（CDP 无法可靠进入 `:focus-visible`），并把 `--pgm-info` 探针挂在 `<body>`——该变量定义在 `:is(#island,#settings)` 上，`<body>` 是祖先，读到的是继承文字色。改为设置窗口会话 + 文本输入框（规范保证 `:focus-visible` 必匹配）+ 在 `#settings` 内解析变量；实测 `focusVisible:true`、`outlineColor === rgb(143,169,195)`、与 host 文字色不同。
  - A7-1 媒体五键探针原来假设本机有媒体正在播放；但 `musicPage()` 在 `!media.active` 时按设计渲染「没有在播放的媒体」空状态、根本不生成 transport 键。改为验证两种合法状态：有媒体→5 键静止态 `opacity:1`；无媒体→空状态文案完整且「去设置」按钮为可点的 `BUTTON`（实测高 28px）。真机与源码两轮均落在 `idle` 状态并通过。

## 剩余限制

- 未对每一种未来语言做逐字像素快照；当前使用中文真实内容、长短说明、技术名称和最长设备名称作为布局压力样本。
- 固定尺寸桌面窗口不使用移动端 320 px 断点；本报告中“响应式”验收指固定窗口内换行、滚动和内容高度变化，不指移动网页重排。
- `settings.js` 中的 `residencyCard()`（常驻排列胶囊）与相关 `status-reset` 处理器为**未接线的遗留实现**：主画板页面管理页只渲染 11 行页面、不含该胶囊，故运行时不会挂载。对应冒烟断言已移除；该组件不参与当前视觉验收（如需恢复，属新功能接线，不在本次范围）。
- 音乐页的「有媒体」分支依赖系统媒体会话；干净 profile 下走空状态分支，两者的 DOM 结构与文案均已验收，但五键 `opacity:1` 的运行时 DOM 证据只在本机有媒体播放时可得（CSS 契约由静态断言 + 真机样式表共同保证）。

final result: 结构与布局 1:1 复现；565 单测 + 36/36 冒烟（源码与真机安装版两轮）通过；打包、ui:audit 暗/浅/压力、6 组 token 对比度与真机安装版暗/浅审计全部通过。
