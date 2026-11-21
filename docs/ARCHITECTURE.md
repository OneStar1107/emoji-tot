# 架构

四个包，一条从「两个数字」到「一个 SVG」的路。

```
apps/desktop      Electron 桌面端：球窗口、灵动岛、设置中心、托盘
apps/gallery      四页站点：控制台 / 表情馆 / 场景 / 文档
        ↓ 都依赖
packages/core     组合式角色引擎：身体、特征、表情、渲染（纯函数，输出 SVG）
packages/protocol 两位数协议：解析、仲裁、事件桥
```

## 桌面端四个窗口

| 窗口 | 页面 | 主进程 | 职责 |
| --- | --- | --- | --- |
| 球 | `src/renderer/index.html` | `src/main.js` | 贴边、穿透、拖拽、Agent 联动 |
| 灵动岛 | `src/renderer/island.html` | `src/main/island.js` | 顶部居中的胶囊，点开成功能面板 |
| 设置中心 | `src/renderer/settings.html` | `src/main/settings.js` | <!--facts:settingsPages-->14<!--/facts--> 页，改动即写 `prefs.json` |
| 更新卡 | `src/renderer/update.html` | `src/main/update-prompt.js` | 320×200 的「发现新版本」小卡：稍后 / 打开下载页 |

球在启动时创建，岛、设置中心与更新卡按需创建：重建窗口会重载页面，岛会丢掉当前页，球会丢掉位置。四个 preload（`preload.js`、`preload-island.js`、`preload-settings.js`、`preload-update.js`）各自只暴露自己的几个调用。

**更新卡只有一个入口**：主进程拿到新版本时调 `updatePrompt.notifyAvailable({ version, notes })`，卡只负责展示，不含检查逻辑。同一次运行只弹一次；「稍后」把 `updatePrompt.snoozeUntil` 写进 `prefs.json`，24 小时内不再弹。`EMOJITOT_UPDATE_TEST=<n>` 用同一个入口注入 n 次事件（默认 1 次），供真机 CDP 验证，不引入网络请求。

**岛的尺寸只有一个来源**：页面用 `ResizeObserver` 量自己，把 `{w,h}` 发给主进程，主进程 `setBounds` 并居中。主进程里没有任何一处硬编码展开宽高 —— 页面长高，窗口就长高。

**点击穿透靠轮询**：`setIgnoreMouseEvents(true, { forward: true })` 在 Windows 上不保证转发 mousemove，所以主进程每 60ms 读一次光标，落在岛矩形内才收回输入。球窗口用的是同一套。

**服务层**（`src/main/services/`）：每个服务只拥有自己的一份数据文件，变化时向岛推送快照，岛从不轮询。

| 服务 | 数据 | 外部依赖 |
| --- | --- | --- |
| battery | 无 | PowerShell CIM |
| weather | `cache-weather.json` | Open-Meteo，PowerShell 子进程 |
| media | 无 | PowerShell + WinRT SMTC 长驻子进程 |
| lyrics | `cache-lyrics-*.json` | LRCLIB，PowerShell 子进程 |
| quota | `secrets.bin` | DeepSeek，密钥经 safeStorage、走环境变量传子进程 |
| mail | `mail.json` | imapflow（MIT） |
| calendar | `cache-calendar.json` | 无 |
| focus / health / todo | 各自 `cache-*.json` | 无（通知用 Electron Notification） |
| shelf | `shelf/` 目录 | 无 |

网络为什么都走子进程：Electron 主进程的 `fetch`/`https` 共享 Chromium 网络栈，系统代理没开时每个请求都会超时 —— 本机实测如此，PowerShell 与 imapflow（Node 原生 socket）能通。

## 一条数据流

```
外部（文件 / 事件 / 用户点击）
  → protocol.parse     两位 id 或状态名 → 一个 StateId（不认识也能落段）
  → protocol.arbitrate 按优先级与停留期决定「现在显示谁」
  → core.render        { body, color, traits, state } → <svg>
  → 宿主               写进 DOM（站点）或窗口（桌面）
```

协议的每一位都有含义（见 [PROTOCOL.md](PROTOCOL.md)）：十位是分组，个位是组内序号，组间空号留给扩展。

## 角色是基因组

一个角色不是一个文件，是四项：

| 项 | 来源 | 数量 |
| --- | --- | --- |
| `body` | `core/src/body.ts` 里手写的闭合轮廓（梨有腰和梗叶，星星有五真角） | <!--facts:bodies-->15<!--/facts--> |
| `color` | `core/src/palette.ts` 的实色 | <!--facts:colors-->12<!--/facts--> |
| `traits` | `core/src/traits.ts`，**每个角色最多一个** | <!--facts:traits-->26<!--/facts--> |
| `state` | `core/src/face.ts` 的眼型 × 嘴型词汇 | <!--facts:faceStates-->61<!--/facts--> |

`core/src/cast.ts` 把 <!--facts:cast-->15<!--/facts--> 个组合钉成有名有姓的成员（每种身体一个代表），每个还带一个招牌表情（`face`）和一个招牌动作（`motion`）。`breed(a, b, seed)` 能交叉两个基因组，用于演示「阵容不是枚举出来的」。

**为什么一个角色只给一个特征**：特征都抢同一块空间（耳朵、光环、尾巴都在身体外沿）。堆四个不如放一个 —— 72px 下能看清的是一个想法，不是四个零件。

## 渲染四层

`renderCharacter` 按固定顺序拼：

1. **身体** —— 一条闭合路径，填充或描边
2. **表面** —— 斑点、条纹、腮红这类贴身纹理（必须在脸下面，否则糊住眼睛）
3. **脸** —— 两只眼、一张嘴，按状态取词，带 lean 偏移
4. **轮廓外** —— 耳朵、光环、尾巴（在身体外面，必须压在最上层）

墨色不单独选：`inkFor()` 按身体亮度取反（亮度 < 0.55 用白墨，否则用深墨）。所以「白底黑字」和「黑底白字」是同一个规则的两端，`tot` 就是后者的默认演示。

## 站点

四个视图共用一个 hash 路由与一个基因状态（`store.ts`）。视图是函数，返回 DOM，切换即 `replaceChildren`；没有框架，包体只有引擎本身。

控制台里的每一个选项都是它自己的渲染：角色是缩略图，身体是轮廓，特征是「当前角色戴上该特征」，表情是「当前角色做出该表情」。没有需要用户猜的文字按钮。

## 构建与发布

```bash
pnpm --filter @emojitot/protocol build
pnpm --filter @emojitot/core build
node apps/desktop/scripts/copy-vendor.mjs
pnpm --filter @emojitot/gallery build
```

- 站点：`apps/gallery/dist` 推到 `gh-pages`，`vite base` 必须是 `/emoji-tot/`
- 桌宠：`apps/desktop` 下跑 electron-builder，产物在 `release/`
- 注入方式：宿主持有 `emotionId` 写进状态文件，或直接调用 `core` 的渲染函数
