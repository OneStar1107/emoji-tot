# 架构

四个包，一条从「两个数字」到「一个 SVG」的路。

```
apps/desktop      Electron 桌宠：贴边、穿透、状态气泡
apps/gallery      四页站点：控制台 / 表情馆 / 场景 / 文档
        ↓ 都依赖
packages/core     组合式角色引擎：身体、特征、表情、渲染（纯函数，输出 SVG）
packages/protocol 两位数协议：解析、仲裁、事件桥
```

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
| `body` | `core/src/body.ts` 里的参数化轮廓（`r(t)` 或参数曲线采样） | 15 |
| `color` | `core/src/palette.ts` 的实色 | 12 |
| `traits` | `core/src/traits.ts`，**每个角色最多一个** | 26 |
| `state` | `core/src/face.ts` 的眼型 × 嘴型词汇 | 44 |

`core/src/cast.ts` 把 135 个组合钉成有名有姓的成员，每个还带一个招牌表情（`face`）和一个招牌动作（`motion`）。`breed(a, b, seed)` 能交叉两个基因组，用于演示「阵容不是枚举出来的」。

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
