<div align="center">

# EmojiBot

**面向桌面与 Web 的角色引擎 —— 15 个手绘轮廓的角色、44 个带分组与中文名的表情、模切白边画风；网页里看得见，桌面上养得起。**

[控制台](https://onestar1107.github.io/emoji-bot/#/console) · [表情馆](https://onestar1107.github.io/emoji-bot/#/gallery) · [场景](https://onestar1107.github.io/emoji-bot/#/scene) · [文档](https://onestar1107.github.io/emoji-bot/#/docs) · [English](README.en.md)

![全家福](docs/screenshots/hero.png)

> **关于 / About**
> 一个用 SVG 画出来的角色引擎：15 个角色各有自己手写的闭合轮廓，44 个表情分生命周期 / 情绪 / 代理工作三组，默认模切白边画风。桌宠、控制台、站点共用同一套引擎，零图片资源。
>
> A character engine drawn in SVG: 15 characters, each with its own hand-written closed outline; 44 expressions grouped into lifecycle, emotions and agent states, in a die-cut sticker finish by default. The desktop pet, the console and the site share one engine, with zero image assets.

</div>

---

## 下载

| 文件 | 适合 |
| --- | --- |
| [EmojiBot Setup 0.2.0.exe](https://github.com/OneStar1107/emoji-bot/releases/download/v0.2.0/EmojiBot-Setup-0.2.0.exe) | 安装版，装完从开始菜单启动 |
| [EmojiBot Portable 0.2.0.exe](https://github.com/OneStar1107/emoji-bot/releases/download/v0.2.0/EmojiBot-Portable-0.2.0.exe) | 便携版，双击即用，不写注册表 |

Windows x64 · 未签名（首次运行 SmartScreen 可能提示「仍要运行」）· [全部版本](https://github.com/OneStar1107/emoji-bot/releases)

## 这是什么

**角色不是图片，是一段基因。** 没有雪碧图，没有 Lottie 文件，也没有一张手绘的角色图：一个角色是 `{ body, color, face }` 三项——身体是一条手写的闭合贝塞尔路径，颜色决定五官墨色（按亮度自动取反），表情是眼型与嘴型的一小套词汇。加一行就有新角色。

| 维度 | 数量 | 说明 |
| --- | --- | --- |
| 身体 | 15 | 圆、蛋、方圆、水滴、星、宝石、花瓣、云、心、幽灵、机器人…都由 `r(t)` 或参数曲线采样生成 |
| 身体 | 15 | 每个形态按它本来的样子手写：梨有腰和梗叶、面包有拱顶平底、星星有五个真角、樱花是五片心形瓣 |
| 表情 | 44 | 9 种眼型 × 10 种嘴型 + 偏移；带分组元数据（中文名、英文 id、一句话行为描述） |
| 画风 | 2 | 模切白边（默认，深色身体自动换深边）与纯平涂，同一份轮廓切换 |
| 角色 | 15 | 每种身体一个代表，各有招牌表情与招牌动作 |
| 后代 | 无限 | `breed(a, b, seed)` 交叉两个角色的基因，不落库 |

它由三件东西组成，全部在这个仓库里从零写成：

| 部件 | 位置 | 它做什么 |
| --- | --- | --- |
| 角色引擎 | `packages/core` | 手写轮廓、部件层、表情词汇、画风与合成，输出 SVG |
| 两位数协议 | `packages/protocol` | 把两位数字变成状态，带仲裁、事件桥与容错解析 |
| 桌面与站点 | `apps/desktop` · `apps/gallery` | 贴边常驻的桌宠；控制台、表情馆、场景、文档四页 |

## 一个两位数

AI 侧只发一个 id，宿主把它变成表情。id 按十年分段，接不认识的也不会白屏——它知道大概是哪一类，退回这个段里合理的表情。

| 段 | id | 含义 |
| --- | --- | --- |
| 生命周期 | `00`–`09` | 睡眠、唤醒、待机、发呆、拖拽 |
| 情绪 | `10`–`29` | 开心、疑惑、失落、惊讶、害羞、生气… |
| 代理工作 | `30`–`49` | 思考中、处理中、任务完成、出错、检索、写入… |
| 提示 | `50`–`59` | 通知、扫描、消息 |

```js
feed('34');                    // 出错：红色感叹号 + 抖动
feed('{"emotionId":"33"}');    // 任务完成：撒花
feed('thinking');              // 也可以直接给状态名
```

## 站点

![控制台](docs/screenshots/console.png)

| 页面 | 内容 |
| --- | --- |
| **控制台** | 15 个角色任选，15 身体 · 12 色 · 44 表情逐项可调；组件片段与 JSON 基因组随选择实时生成 |
| **表情馆** | 两个墙：15 个角色的阵容墙（按族筛选），和 44 个表情的表情墙；点角色跳去控制台，点表情带着状态过去 |
| **场景** | 十四个角色同台，各自按自己的节奏换表情；点它会回应你，还有"全体开心 / 全体入睡 / 换一批" |
| **文档** | 引擎怎么画、基因组怎么组、协议每一位什么意思、怎么调用，全部由代码生成，不会过时 |

![场景](docs/screenshots/scene.png)

## 桌面宠物

![表情馆](docs/screenshots/faces.png)

同一个球可以贴在任何桌面上（Windows / macOS）：

- **贴边收起**：拖到屏幕左右边缘松手，球缩进去只留 30%，悬停滑出来。松手时光标就在边缘，所以必须移开过一次才会响应悬停——否则刚放下就被自己弹开。
- **点击穿透**：窗口默认不拦点击，底下的桌面图标照样能点；指针落到球上才收回输入。
- **15 个角色**：托盘菜单按族分组挑角色，选中即换外观、招牌表情和招牌动作；默认是黑底白字的 `bot`。
- **Agent 联动**：菜单可开 DeepSeek Harness / Claude Code / Codex，读各自的状态文件并映射成表情。
- **一个文件就是接口**：`%APPDATA%/EmojiBot/state.json`（macOS 在 `~/Library/Application Support/EmojiBot/`）。裸 id、JSON 串、JSON 对象都收，坏数据保留当前表情。

```bash
echo '{"emotionId":"34","tips":"构建失败了"}' > "$APPDATA/EmojiBot/state.json"
```

## 快速开始

```bash
pnpm install     # 装完会自动构建协议包（postinstall）
pnpm dev         # 站点 http://localhost:5173
pnpm desktop     # 桌面宠物
pnpm test        # 23 个协议测试
```

出安装包：

```bash
pnpm --filter @emojibot/desktop dist   # release/ 下出 Windows 安装包
```

## 项目结构

```
packages/protocol    零运行时依赖：51 个 id、解析、多会话仲裁、事件桥（ESM + CJS）
apps/gallery         站点五视图：控制台 / 表情馆 / 场景 / 主题 / 文档
apps/desktop         Electron 桌宠：贴边、穿透、Agent 联动、托盘
```

## 验证

不是"应该能跑"，是跑过：

| 检查 | 证据 |
| --- | --- |
| 协议表 | 23 个测试，覆盖 id 合法性、状态映射、事件标记与段边界 |
| 51 个状态渲染 | `node apps/gallery/scripts/preview.mjs` — 51/51，0 failures（Node 里跑，无浏览器） |
| 桌面端窗口行为 | `node apps/desktop/scripts/ui-check.mjs <端口>` — 用原生光标驱动真实拖拽，7/7（贴边、展开、收起、穿透） |
| 桌面端协议驱动 | 写 `34` → `alerting`，写 `33` → `celebrate`，写坏 JSON → 保持当前表情 |

## 几处有意的取舍

- **紧急事件立即打断**：仲裁默认让事件排队等停留期；这里改成"比当前显示更紧急的事件立即打断"——出错必须马上看见，不紧急的仍然排队，避免闪烁。
- **静态图的配色靠改字符串**：静态渲染把 ink 写成 `prefers-color-scheme` 媒体查询，页面钉死配色时只能重写这段查询；用 CSS invert 会把腮红和感叹号一起反掉。
- **穿透靠轮询光标**：`setIgnoreMouseEvents(forward)` 在本机没有转发 mousemove，页面永远不知道指针在球上，球既点不动也拖不动。改成主进程每 60ms 查一次光标位置，两个平台一致。

## 许可

**MIT。** 代码、形状、表情全部由本仓库自行实现：可以商用、可以闭源、可以再分发，保留版权声明即可。

引擎、协议、页面、角色全部由本仓库自己实现：没有引用任何第三方角色引擎的代码或美术。

---

Made by [OneStar1107](https://github.com/OneStar1107) · [MIT](LICENSE)