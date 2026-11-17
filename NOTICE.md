# 上游许可与来源说明 / Upstream Notices

本项目不包含任何上游项目的商业授权。它是一个**非营利、非商业**的衍生
融合作品。以下三段说明了对每个上游的义务，发布本项目时不得删除。

## 1. Aora Bot — 引擎与协议

- 仓库：https://github.com/sam70361/aora-bot
- 许可：Aora Bot License 1.1（中文为准）
- 依据：§1.3(d)「以开源许可公开全部源代码、且不以营利为目的的开源项目」
  属于免费使用者；§2 授予免费、非独占、全球范围的使用、复制、修改与
  随产品分发权利。
- 本项目履行的义务：
  - §5.1 随源码保留许可与版权声明 → 见本文件与 CREDITS.md；
  - §5.2 公开产品时署名字样「Powered by Aora Bot」并链接仓库 →
    见 README 与 demo 页脚；
  - §4(a) 未将引擎作为主体单独出售或付费分发；
  - §4(f) 未删除上游版权与许可声明。
- 上游范围提示：Aora Bot 仓库 `emotion-ball` 分支中的经典版 Emotion Ball
  不适用 Aora Bot License，而适用该分支内的 Emotion Ball 社区许可。

## 2. Emotion Ball — 表情语义与展示馆原型

- 仓库：https://github.com/Aithena/emotion-ball
  （与上述 Aora Bot 仓库 `emotion-ball` 分支同源；该分支内含的
  `LICENSE` 是社区许可正文，本仓库以此为准）
- 许可：Emotion Ball 社区许可（非商业免费；球形角色视觉形象永不商用）
- 本项目借用的部分：两位数字 emotionId 的分段语义（生命周期 / 情绪 /
  代理工作 / 提示）、`handleAIMessage` 式的容错接入体验、展示馆的
  信息结构。协议语义属于接口规范，代码为本项目自行实现。
- 义务：保留许可声明与 NOTICE、注明出处、不将球形角色视觉形象商用。

## 3. 球球桌宠 — 桌面端功能设计参考

- 仓库：https://github.com/dreamcall520/emotion-ball-desktop-pet
- 许可：Learning & Research Only License（仅供学习研究许可，禁止一切
  商业用途，且永不提供商业授权）
- 本项目借用的部分：桌面端的产品行为设计（拖拽、贴边收起、托盘、鼠标
  注视、气泡、设置中心的信息架构）。**桌面应用代码为本项目自行实现**，
  不复制其源码或资源。
- 义务：保留许可说明、注明出处、绝对不用于商业用途。

## 4. 本项目自身

- 许可：EmojiBot Studio 非商业共享许可 1.0，见 `LICENSE`。
- 本项目代码与上游代码是分开持有的：上游部分随包依赖引入或按其许可
  引入，本项目新增代码由本项目贡献者以非商业许可发布。
