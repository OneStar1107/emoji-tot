<div align="center">

# EmojiBot

**面向桌面与 Web 的表情角色 —— 一个两位数驱动 71 个角色、3 种画法、16 个变体、7 套主题；网页里看得见，桌面上养得起。**

[控制台](https://onestar1107.github.io/emojibot-studio/#/console) · [表情馆](https://onestar1107.github.io/emojibot-studio/#/gallery) · [场景](https://onestar1107.github.io/emojibot-studio/#/scene) · [主题](https://onestar1107.github.io/emojibot-studio/#/themes) · [文档](https://onestar1107.github.io/emojibot-studio/#/docs) · [English](README.en.md)

![全家福](docs/screenshots/hero.png)

</div>

---

## 这是什么

**角色不是图片，是代码画的。** 没有雪碧图，没有 Lottie 文件：每个身体是一条轮廓（带耳朵、叶子、天线这类独立部件），每个表情是几个数字描述的一段曲线，弹簧插值，每一帧由一个 `requestAnimationFrame` 循环直接写进 SVG 属性。

本项目把三个上游合成一个能跑的东西，各自出力：

| 上游 | 贡献 | 位置 |
| --- | --- | --- |
| [Emotion Ball](https://github.com/Aithena/emotion-ball) | 两位数 emotionId 协议、分十年段的语义、容错接入的体感 | `packages/protocol` |
| [Aora Bot](https://github.com/sam70361/aora-bot) | 程序化渲染引擎：71 角色、3 画法、16 变体、7 套主题、HUD、粒子 | npm 依赖 `@aora-bot/*` |
| [球球桌宠](https://github.com/dreamcall520/emotion-ball-desktop-pet) | 桌面常驻的产品经验：贴边、穿透、Agent 联动 | `apps/desktop` |

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
| **控制台** | 71 角色 · 71 形状 · 11 色 · 3 画法 16 变体 · 51 状态 · 5 种舞台背景。参数面板只显示当前变体**真正读取**的参数，代码片段随选择实时生成 |
| **表情馆** | 51 个 id 一屏看完，按十年段筛选，点开拿代码 |
| **场景** | 九个 agent 各自上报，一张脸显示仲裁结果。这是协议里"紧急事件打断停留期"那条规则的可视化 |
| **主题** | 7 套季节主题，点击才加载（代码分割），加载后画的是该主题自己的形状 |
| **文档** | 接入、协议、命令式动作、桌面端，中英切换 |

![场景](docs/screenshots/scene.png)

## 桌面宠物

![表情馆](docs/screenshots/faces.png)

同一个球可以贴在任何桌面上（Windows / macOS）：

- **贴边收起**：拖到屏幕左右边缘松手，球缩进去只留 30%，悬停滑出来。松手时光标就在边缘，所以必须移开过一次才会响应悬停——否则刚放下就被自己弹开。
- **点击穿透**：窗口默认不拦点击，底下的桌面图标照样能点；指针落到球上才收回输入。
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
pnpm test        # 27 个协议测试，含与上游逐行比对
```

出安装包：

```bash
pnpm --filter @emojibot-studio/desktop dist   # release/ 下出 Windows 安装包
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
| 协议表 | 27 个测试，其中 4 个与 `@aora-bot/engine` 逐行比对 id / state / 事件标记 / 段边界，上游改表就红 |
| 51 个状态渲染 | `node apps/gallery/scripts/preview.mjs` — 51/51，0 failures（Node 里跑，无浏览器） |
| 桌面端窗口行为 | `node apps/desktop/scripts/ui-check.mjs <端口>` — 用原生光标驱动真实拖拽，7/7（贴边、展开、收起、穿透） |
| 桌面端协议驱动 | 写 `34` → `alerting`，写 `33` → `celebrate`，写坏 JSON → 保持当前表情 |

## 几处有意的取舍

- **紧急事件立即打断**：上游的仲裁一律让事件排队等停留期；这里改成"比当前显示更紧急的事件立即打断"——出错必须马上看见，不紧急的仍然排队，避免闪烁。
- **静态图的配色靠改字符串**：静态渲染把 ink 写成 `prefers-color-scheme` 媒体查询，页面钉死配色时只能重写这段查询；用 CSS invert 会把腮红和感叹号一起反掉。
- **穿透靠轮询光标**：`setIgnoreMouseEvents(forward)` 在本机没有转发 mousemove，页面永远不知道指针在球上，球既点不动也拖不动。改成主进程每 60ms 查一次光标位置，两个平台一致。

## 许可

非商业共享。三个上游各自许可继续有效，商用需要分别联系原作者：

- Aora Bot：Aora Bot License 1.1，商用授权 1251579308@qq.com
- Emotion Ball：双许可，商用同样联系 1251579308@qq.com
- 球球桌宠：仅供学习研究，**永不提供**商业授权

细节见 [LICENSE](LICENSE)、[NOTICE.md](NOTICE.md)、[CREDITS.md](CREDITS.md)。

---

Powered by [Aora Bot](https://github.com/sam70361/aora-bot) · 表情语义来自 [Emotion Ball](https://github.com/Aithena/emotion-ball) · 桌面设计参考 [球球桌宠](https://github.com/dreamcall520/emotion-ball-desktop-pet)
