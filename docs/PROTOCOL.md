# 协议规范 / The Emotion Protocol

一份协议，两边说话：AI 侧只发一个两位数 id，角色侧决定表情、动作和特效。
规范本身不是任何人可以独占的东西；这里的实现由本项目自行编写，语义与上游一致。

## 1. 报文格式

三种写法等价，可按宿主取最省事的那种：

```json
{ "emotionId": "34", "tips": "读取失败", "hud": { "kind": "progress", "value": 0.4 } }
{ "emotion": 34 }
{ "state": "thinking" }
```

也接受裸串：`"34"`、`"thinking"`——shell hook 里 `echo 34` 就能驱动。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `emotionId` / `emotion` | 三选一 | 两位数 id，或状态名 |
| `state` | 同上 | 状态名，如 `thinking` |
| `tips` | 否 | 一行文案，宿主自行决定展示方式 |
| `hud` | 否 | 环外仪表。格式不合就丢弃，不影响表情 |

## 2. id 分段

| 段 | 范围 | 规则 |
| --- | --- | --- |
| `lifecycle` | 00–09 | 身体状态。`00` 睡眠、`02` 待机是默认落点 |
| `feeling` | 10–29 | 情绪。一 id 一表情，允许共享 state |
| `agent` | 30–49 | 代理工作。`30` 思考、`32` 繁忙、`33` 完成、`34` 出错 |
| `signalling` | 50–59 | 面向用户的提示 |

**编号一旦发出永不重排**：已有 id 的含义固定，新 id 只在段内填空。
这样外部脚本可以放心硬编码。

## 3. 容错

- 未知 id → 按**十年段**回退（生命周期/情绪回 `02`，代理工作回 `32`，提示回 `50`），不会白屏。
- 解析失败 → 返回 `null`，**不抛异常**。
- 非法 JSON → 保留当前表情，可选触发 `error` 事件。
- `3`、`'3'`、`' 03 '` 都归一化成 `03`。

## 4. 事件 vs 状态

- **状态**（condition）：可以持续，比如 `32` 处理中。
- **事件**（event）：描述一个瞬间，比如 `33` 完成、`34` 出错。

仲裁器对两者的处理不同：状态可以被更高优先级的状态替换；事件**永不丢弃**，
在停留期内到达则排队播放。本项目的改进：比当前显示更紧急的事件立即打断。

## 5. 多会话仲裁

一个角色，多个来源（三个子 agent、一个聊天窗、一个后台任务）。四条规则：

1. **优先级**：可见会话里优先级最高的胜出。一个报错盖过三个在跑。
2. **最小停留**：状态至少占领 900ms 才可被替换，防止连续事件造成闪烁。
3. **事件保证**：事件不被丢弃（见上）。
4. **过期**：静默 120s 的会话被遗忘，没有收尾钩子的工具无法永久占住脸。

`headless` 会话被跟踪但永不显示——后台工作不许抢脸。

## 6. 接入方式

```ts
import { createEmotionChannel, createArbiter } from '@emojitot/protocol';

// 单来源
const channel = createEmotionChannel({ initial: '02' });
channel.on('change', (e) => { el.state = e.state; });
channel.on('tips', (e) => show(e.text));
channel.feed('{"emotionId":"34"}');

// 多来源
const arbiter = createArbiter();
arbiter.subscribe((frame) => { el.state = frame.state; });
arbiter.update({ sessionId: 'build', emotionId: '32' });
arbiter.update({ sessionId: 'test', emotionId: '34' });
```

## 7. 编号约定

- 十位是分组，个位是组内序号，组间空号是给扩展留的；编号一旦发布就不再重排；
- 状态名是给人读的别名，编号才是对外契约；
- 33 个协议测试守住这张表：id 合法性、状态映射、事件标记、段边界，任何一处漂移都会红。
