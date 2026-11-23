<div align="center">

# EmojiTot

**一个用 SVG 画出来的角色引擎：<!--facts:cast-->15<!--/facts--> 个手写轮廓的角色、<!--facts:faceStates-->61<!--/facts--> 个表情、一门两位数协议。网页里看得见，桌面上养得起 —— 既是屏幕顶部的一条岛，也是桌上的一个球。**

[控制台](https://onestar1107.github.io/emoji-tot/#/console) · [表情馆](https://onestar1107.github.io/emoji-tot/#/gallery) · [场景](https://onestar1107.github.io/emoji-tot/#/scene) · [文档](https://onestar1107.github.io/emoji-tot/#/docs) · [English](README.en.md)

![最新版本](https://img.shields.io/github/v/release/OneStar1107/emoji-tot?label=%E6%9C%80%E6%96%B0%E7%89%88%E6%9C%AC&color=8b5cf6)
![平台](https://img.shields.io/badge/Windows-10%20%2F%2011-2563eb)
![许可](https://img.shields.io/badge/License-Noncommercial-10b981)
![技术栈](https://img.shields.io/badge/Electron-45-a855f7)

![全家福](docs/screenshots/hero.png)

</div>

---

## 这是什么

**角色不是图片，是一段基因。** 没有雪碧图，没有 Lottie 文件，也没有一张手绘的角色图：一个角色是 `{ body, color, face }` —— 身体是一条手写的闭合贝塞尔路径，颜色决定五官墨色（按亮度自动取反），表情是眼型与嘴型的一小套词汇。加一行就有新角色。

<!--facts:bodies-->15<!--/facts--> 具身体、<!--facts:colors-->12<!--/facts--> 色、<!--facts:faceStates-->61<!--/facts--> 个表情（<!--facts:eyeStyles-->10<!--/facts--> 眼型 × <!--facts:mouthStyles-->12<!--/facts--> 嘴型 + 偏移）、两种画风（模切白边 / 纯平涂）；`breed(a, b, seed)` 能交叉两个基因组，不落库。

三件东西全部在这个仓库里从零写成：`packages/core` 角色引擎（手写轮廓、表情词汇、画风与合成，输出 SVG）、`packages/protocol` 两位数协议（解析、多会话仲裁、事件桥）、`apps/desktop` 与 `apps/gallery`（Windows 桌面端；控制台 / 表情馆 / 场景 / 文档四页站点）。

**静态 SVG 之上还有一层会动的骨架。** `renderCharacter()` 仍是确定性的纯函数，供导出、缩略图和测试使用；浏览器里的 `createCharacterRuntime()`（`@emojitot/core/runtime`）负责同一个角色的状态迁移、16 点多边形眼型形变、视线、眨眼和弹簧姿态。运动配置、弹簧积分器与状态历史分别在 `packages/core/src/motion/` 中，页面只负责选择要显示的状态，不复制角色实现。

## 演示

![收起](docs/screenshots/island-folded-frost.png)
![展开](docs/screenshots/island-open-frost.png)

收起时只剩一张脸，点开原地长成 420 宽的面板；桌面球可以停在任何位置，拖到屏幕左右边缘就收进去一半。

## 怎么装

<!--downloads:start-->
| 文件 | 适合 |
| --- | --- |
| [EmojiTot.Setup.exe](https://github.com/OneStar1107/emoji-tot/releases/download/v0.8.19.3/EmojiTot.Setup.exe) | 安装版，装完从开始菜单启动 |
| [EmojiTot.Portable.exe](https://github.com/OneStar1107/emoji-tot/releases/download/v0.8.19.3/EmojiTot.Portable.exe) | 便携版，双击即用，不写注册表 |
<!--downloads:end-->

Windows x64 · 未签名（首次运行 SmartScreen 可能提示「仍要运行」）· [全部版本](https://github.com/OneStar1107/emoji-tot/releases) · 当前 <!--facts:version-->0.8.19<!--/facts-->

下载区的版本号与 `package.json` 同步，由 `pnpm docs:sync` 维护；它指向的版本还没打标签时链接会 404，从「全部版本」里取当前已发布的那一版。

从源码跑（Windows，Node ≥ 22.12，pnpm ≥ 12）：

```bash
pnpm approve-builds --all   # pnpm 12 默认不跑依赖的安装脚本，Electron 需要
pnpm install
pnpm build                  # 构建 core 与 protocol
pnpm dev                    # 站点 http://localhost:5173
pnpm desktop                # 桌面端（默认灵动岛）
pnpm test                   # 协议与引擎测试
pnpm scan                   # 发布前敏感信息扫描
pnpm smoke:desktop          # 启动真实 Electron 窗口做烟测
```

Electron 45 的运行时本身不能从中文路径启动。开发脚本、安装版和便携版都带原生 ASCII 启动引导：开发缓存位于 `%LOCALAPPDATA%\EmojiTot\electron-runtime`，打包版位于 `%LOCALAPPDATA%\EmojiTot\app-runtime`，便携载荷位于 `%LOCALAPPDATA%\EmojiTot\portable`。缓存按构建版本切换并自动清理旧版本，不需要用户把 EmojiTot 安装到英文目录。

## 五个能力

1. **双形态**：屏幕顶部一条灵动岛，或桌上一个能贴边的球，托盘与设置里随时切，不重启、不丢当前页。
2. **<!--facts:islandPages-->11<!--/facts--> 个功能页**：媒体、天气、专注、待办、健康、置物架、AI 工作台、邮箱、日程、设备、消息，左右翻页，空态给一句话加一个动作。
3. **一个引擎**：<!--facts:cast-->15<!--/facts--> 个角色、<!--facts:faceStates-->61<!--/facts--> 个表情全部由 SVG 手写轮廓算出来，零图片资源，桌面端与站点共用同一套。
4. **两位数协议**：AI 侧（DeepSeek Harness / Claude Code / Codex）只发一个 id，宿主把它变成表情；接不认识的也退回本段，不白屏 —— `%APPDATA%/EmojiTot/state.json` 一个文件就是全部接口。
5. **设置中心**：<!--facts:settingsPages-->15<!--/facts--> 页、四种快速方案，改动即写进 `prefs.json`，没有保存按钮。

## 数据与隐私

- **接口只有一个文件**：`%APPDATA%/EmojiTot/state.json`。裸 id、JSON 串、JSON 对象都收，坏数据保留当前表情。
- **数据都在本机**：偏好、待办、日程、邮件缓存、置物架文件、剪贴板历史都写在本机数据目录，不上传。
- **不抓屏**：Windows 11 22H2 及以上由系统 Acrylic 实时处理窗口背后的桌面；旧系统回退到半透明分层材质。应用不截取、不保存屏幕内容。
- **定位只管天气**：用来决定天气城市，不上传位置、不记录轨迹。
- **消息只读条数**：微信、企业微信、飞书、钉钉的未读数从窗口标题读，不读聊天内容。
- **剪贴板历史默认关闭**：开启后存本机 `clipboard.json`，关掉即清未固定项；只做长度与空值过滤，不做敏感内容识别。

存什么、存多久、怎么删见 [docs/PRIVACY.md](docs/PRIVACY.md)，加固范围见 [docs/SECURITY.md](docs/SECURITY.md)。

## 文档与链接

- **变更记录**：[docs/CHANGELOG.md](docs/CHANGELOG.md) —— 每个版本 2–4 条。
- **站点**：[控制台](https://onestar1107.github.io/emoji-tot/#/console) · [表情馆](https://onestar1107.github.io/emoji-tot/#/gallery) · [场景](https://onestar1107.github.io/emoji-tot/#/scene) · [文档](https://onestar1107.github.io/emoji-tot/#/docs)（由代码生成，不会过时）
- **技术**：[架构](docs/ARCHITECTURE.md) · [协议](docs/PROTOCOL.md) · [灵动岛](docs/ISLAND.md) · [设置](docs/SETTINGS.md) · [发版](docs/RELEASING.md) · [签名](docs/SIGNING.md) · [调研与许可核对](docs/RESEARCH.md)
- **验收**：`pnpm check` —— 类型、构建、测试、文档一致性、站点、窗口烟测、依赖审计与敏感信息扫描。
- **反馈**：[Issues](https://github.com/OneStar1107/emoji-tot/issues)

## 开源与许可

**源码公开，但不可商用。** 个人学习、研究、自用、改着玩都没问题；把它打包卖钱、放进收费产品、做成带广告的服务，这些都不行——想商用请先来谈授权（hyx110702@163.com）。

本许可**不授予服务商标使用权**：EmojiTot 这个名字、角色和画风是本项目的标识，别人用了也不代表与我合作或经我认证。

第三方依赖各自沿用其原有许可，详见 [LICENSE](LICENSE) 与 [docs/RESEARCH.md](docs/RESEARCH.md) 里的依赖说明。

------

Made by [OneStar1107](https://github.com/OneStar1107) · [EmojiTot Noncommercial License](LICENSE)
