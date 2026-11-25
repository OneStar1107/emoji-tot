# core + protocol 两个库（ENG）

> 一句话职责：`packages/core` 把「身体 + 颜色 + 特征 + 状态」渲染成确定性 SVG，并给浏览器一层会动的运行时；`packages/protocol` 把两位数字翻译成状态、按优先级和停留期决定「现在显示谁」、再把变化广播给宿主。两个包都不读写磁盘、不发网络、**零运行时依赖**（两个 `package.json` 只有 `devDependencies`：`packages/core/package.json:34-37`、`packages/protocol/package.json:28-31`）。
>
> 实现根目录：`packages/core/src/`（11 个源文件 + `motion/` 5 个）、`packages/protocol/src/`（5 个源文件）。

## 1. 范围与边界

**本文件覆盖**：`packages/core/src/{render,body,palette,traits,face,cast,element,lexicon,shapes,runtime,index}.ts`、`packages/core/src/motion/{eyes,profiles,spring,state-machine,index}.ts`、`packages/protocol/src/{emotions,parse,arbiter,channel,index}.ts`；两个包的对外入口与 CJS 构建产物；两个包的自动化测试。

**本文件不覆盖**：

- 桌面端窗口、IPC、prefs 落盘、托盘、岛页面 —— 见 `docs/ISLAND.md`、`docs/SETTINGS.md` 与 `docs/baseline/` 下的桌面端模块文件。
- 四页站点（控制台/表情馆/场景/文档）的页面与路由 —— 见 `docs/baseline/` 下的站点模块文件。
- 打包、签名、更新 —— 见 `docs/SIGNING.md`、`docs/RELEASING.md`。
- 角色基因组、四层渲染、运行时管线的**散文版叙述** —— 已有 `docs/ARCHITECTURE.md:60-106`；本文件只补基准必需的事实与判定条件，不复述。协议语义的对外说明见 `docs/PROTOCOL.md`，本文件给的是实现侧数值与那边没写的边角。

**生成物只记存在、不逐行分析**：`packages/core/dist/`、`packages/protocol/dist/`、`packages/protocol/dist-cjs/`、`apps/desktop/src/vendor/protocol/`（`dist-cjs` 的拷贝）、`apps/desktop/src/renderer/vendor/core/`（`dist` 的拷贝）。拷贝动作见 `apps/desktop/scripts/copy-vendor.mjs:13-38`、`apps/desktop/scripts/copy-protocol.mjs:14-20`。

## 2. 模块与文件清单

### 2.1 packages/core

| 模块 | 职责 | 实现位置 | 触发 / 生命周期 |
| --- | --- | --- | --- |
| 渲染器 | 基因组 → 字符串 SVG；纯函数，不读时钟不碰 DOM | `packages/core/src/render.ts:370-519`（`renderCharacter`）、`:522-536`（`renderCast`）、`:538-540`（`renderDataUrl`） | 每次调用同步返回字符串；无状态 |
| 身体表 | 15 个手写闭合轮廓 + 面部锚点 + 物种附加件 | `packages/core/src/body.ts:54-174`（`BODIES`）、`:187-191`（`getBody`，未知 id 抛错） | 模块加载建表；每角色查一次 |
| 配色 | 12 个实色 + 未知回落 | `packages/core/src/palette.ts:8-21`（`COLORS`）、`:31-33`（`colorHex`） | 同上 |
| 特征表 | 26 特征 + 1 空槽，分「表面/表头」两类 | `packages/core/src/traits.ts:35-148`、`:159`（`TRAITS`）、`:171-177`（`renderTraits`） | 渲染时按数组顺序拼接 |
| 表情词汇 | 10 眼型 × 12 嘴型 × 6 眉姿 + 5 种道具 | `packages/core/src/face.ts:9-19`（类型）、`:77-152`（`FACES`，61 条） | 一次渲染查一次 `faceFor` |
| 状态命名表 | 61 条中文名 + 分组 + 一行行为描述 | `packages/core/src/face.ts:173-240`（`FACE_META`）、`:245-251` | 选择器/文档读；渲染不依赖 |
| 阵容 | 15 个有名成员（每身体一个）+ 交叉 | `packages/core/src/cast.ts:50-68`（`RAW`）、`:70-85`（`CAST`）、`:103-117`（`breed`） | 加载建表；`castMember` 查一次 |
| 33 条名录 | 33 个具名表达（名字借自参考墙） | `packages/core/src/lexicon.ts:31-70`（`LEXICON`） | 见 §3 与 §8 |
| 旧形状表 | 8 个公式化轮廓，保留给已存偏好 | `packages/core/src/shapes.ts:22-65`（`SHAPES`） | 见 §3 的「已废弃」行 |
| 自定义元素 | `<emojitot-ball>`：静态 SVG 或 live 运行时，二选一 | `packages/core/src/element.ts:41-296`、`:299-308`（`defineBall` + 导入即注册） | 连上 DOM 时 `#draw()`；断开时 `#destroyRuntime()`（`:64-66`） |
| 浏览器运行时 | 16 顶点多边形眼、弹簧姿态、视线、眨眼、一次性动作 | `packages/core/src/runtime.ts:123-710`（`createCharacterRuntime`） | 一个 RAF；`destroy()` 必须调用（`:117-122` 注释、`:698-708` 实现） |
| 弹簧积分器 | 定步长欧拉 + 有限值兜底 + 吸附 | `packages/core/src/motion/spring.ts:29-61` | 每帧每通道一次 |
| 眼型拓扑 | 10 种 16 顶点多边形 + 同编号插值 | `packages/core/src/motion/eyes.ts:13`、`:70-81`、`:83-92` | 状态切换时形变一次 |
| 动作配置 | 家族基线 + 单状态覆盖 + 眼型播放表 | `packages/core/src/motion/profiles.ts:30-70`、`:72-115`、`:123-137` | 每次 `setState` 重取；模块级 Map 缓存 |
| 状态机 | 只记录迁移（最近 12 条），不决定谁显示 | `packages/core/src/motion/state-machine.ts:22`、`:31-64` | `setState` 时 `transition` |

### 2.2 packages/protocol

| 模块 | 职责 | 实现位置 | 触发 / 生命周期 |
| --- | --- | --- | --- |
| 协议表 | 61 个 `StateId`、51 个两位 id、4 个十年段、段内回退 | `packages/protocol/src/emotions.ts:22-35`、`:61-66`、`:68-127`、`:149-154` | 加载建表；纯查表 |
| id 解析 | 严格 1–2 位十进制；不合法返回 null | `packages/protocol/src/emotions.ts:165-183`、`:185-243` | 每次解析调用 |
| 报文解析 | 4 种写法 → `{emotionId, state, tips?, hud?}` | `packages/protocol/src/parse.ts:49-82`、`:101-127` | 每条输入一次 |
| 多会话仲裁 | 优先级 / 最小停留 / 事件不丢 / 过期 | `packages/protocol/src/arbiter.ts:162-418` | 长生命周期对象；`dispose()` 清定时器（`:406-416`） |
| 事件桥 | 单来源通道：`feed` / `setEmotion` / `on` / `dispose` | `packages/protocol/src/channel.ts:63-127` | 宿主持有；无生产接入（见 §8） |
| 包入口 | 显式 re-export，实现细节收口 | `packages/protocol/src/index.ts:12-38` | — |

### 2.3 对外入口与构建产物（为何桌宠需要 CJS）

| 包 | `exports` / 入口 | 产物 | 用途 |
| --- | --- | --- | --- |
| `@emojitot/core` | `.` → `dist/index.js`；`./element` → `dist/element.js`；`./runtime` → `dist/runtime.js`（`packages/core/package.json:10-24`） | 只有 ESM（`"type": "module"`，`exports` 里**没有 `require` 条件**）；无 `dist-cjs` | 网页与渲染进程用 `<script type="module">` 加载 `vendor/core/element.js`（`apps/desktop/src/renderer/index.html:18`、`island.html:73`、`settings.html:61`、`tray.html:35`、`onboarding.html:80`） |
| `@emojitot/protocol` | `.` → `import: dist/index.js` + `require: dist-cjs/index.js`；`main` 指向 `dist-cjs/index.js`（`packages/protocol/package.json:8-17`） | 双产物：`dist/`（ESM + `.d.ts`，`tsconfig.build.json`）+ `dist-cjs/`（CommonJS、无声明，`tsconfig.build.cjs.json:7-9`）+ 手写 `dist-cjs/package.json` = `{"type":"commonjs"}` | **Electron 主进程是 CommonJS**：`apps/desktop/src/main.js:21` 用 `require('./vendor/protocol/index.js')` 取 `createArbiter / parseAgentMessage / stateForEmotion / EMOTIONS`。`packages/protocol/package.json:24` 的 build 串就是「先 ESM、再 CJS、再写 type 标记」 |

- `pnpm build` 只构建这两个包：`package.json:14`（`--filter @emojitot/core --filter @emojitot/protocol`）。
- 桌面端打包把 `dist-cjs` 拷进 `src/vendor/protocol`、`dist` 拷进 `src/renderer/vendor/core`，并**给渲染端 vendor 目录单独写一个 `{"type":"module"}` 的 `package.json`**，否则主进程动态 `import` 该目录会被按 CJS 解析而失败（`apps/desktop/scripts/copy-vendor.mjs:27-38`；消费点在 `apps/desktop/src/main.js:290-299`）。

### 2.4 一条状态的完整调用链（含真实调用点）

```
外部输入（JSON / 裸 id / 状态名）
  → parse.parseAgentMessage        两位 id 或状态名 → {emotionId, state, tips?, hud?}
  → arbiter.update / resolve       按优先级 + 900ms 停留决定「现在显示谁」
  → core.renderCharacter           基因组 × state → 确定性 <svg>（静态面）
  → core/runtime.setState          同一 state → 眼型 / 动作配置 / 信号层
  → 宿主                          写进 DOM（站点）或窗口（桌面）
```

| 宿主 | 真实接线 | 证据 |
| --- | --- | --- |
| 桌面 | `main.js` 用 `parseAgentMessage` 收口全部状态来源，再经 `faceBus.set(state,…)` 广播给球/岛/设置预览；agent 多来源走 `createArbiter({minDisplayMs:900, onApply})` | `apps/desktop/src/main.js:21`、`:267-277`、`:921-930` |
| 站点场景页 | `createCharacterRuntime` 一个实例 + `createArbiter({onApply})`，回调里 `runtime.setState('arbiter:'+sessionId)` 并记录迁移 | `apps/gallery/src/scene.ts:302-322`、`:295-300` |
| 站点其它页 | 只做静态 `renderCast` / `renderCharacter`，或按需挂 live 实例（灯箱、控制台主视觉） | `apps/gallery/src/wall.ts:135-202`、`console.ts:421-423` |
| Node（无 DOM） | `apps/gallery/scripts/preview.mjs` 同时导入 core 与 protocol，在 Node 里把整套协议渲染成静态页 | `apps/gallery/scripts/preview.mjs:4-6`、`:27-28` |

## 3. 对外条目清单

> 本模块是库，没有窗口/路由；「条目」= 对外 API 面、自定义元素属性、可被宿主引用的表。

| 条目 | 用途 | 入口 / 触发 | 实现位置 | 状态 |
| --- | --- | --- | --- | --- |
| `renderCharacter(options)` | 一行基因组 → 字符串 SVG | 宿主直接调用 | `packages/core/src/render.ts:370` | 已确认（`packages/core/test/render.test.ts:14-58`） |
| `renderCast({id,state?,size?,style?,motion?})` | 按阵容 id 渲染；未知 id 回落 cream 圆 | 站点、托盘、岛 | `packages/core/src/render.ts:522` | 已确认（桌面 15 角色联动见 `design-qa.md:139`） |
| `renderDataUrl(options)` | SVG → `data:image/svg+xml,…` | 托盘图标等 | `packages/core/src/render.ts:538` | 已确认（托盘图标验收见 `design-qa.md:84`；调用点 `apps/desktop/src/main.js:328-339`） |
| `renderFace / renderFaceDetails / faceLayout` | 只画脸 / 只画脸周围 / 只算几何 | 运行时与静态渲染共用 | `packages/core/src/render.ts:260-348` | 已确认（`runtime.ts:266`、`:464` 复用同一份几何；`design-qa.md:82` 的角色与表情页可见脸） |
| `inkFor(bodyHex)` | 按亮度取白墨/深墨 | 渲染器内部 + 导出 | `packages/core/src/render.ts:120` | 待验证（无断言；只能从截图看到 `tot` 的深底浅脸分支） |
| `BODIES` / `getBody` | 15 个身体 | 选择器、渲染 | `packages/core/src/body.ts:54`、`:187` | 已确认（`render.test.ts:14-28` 遍历 15×61=915 组合） |
| `COLORS` / `COLOR_IDS` / `COLOR_ZH` / `colorHex` | 12 色与中文名 | 选择器 | `packages/core/src/palette.ts:8-33` | 待验证（`cast.test.ts:31-35` 只校验 cast 引用的色 id 存在；`colorHex` 回落与 12 色渲染无断言；中文名全仓无消费方，见 §8） |
| `TRAITS` / `TRAIT_IDS` / `renderTraits` / `PAIRED` | 26 特征 + `none` | 选择器、渲染 | `packages/core/src/traits.ts:159-177` | 待验证（`cast.test.ts:56-62` 只校验 cast 引用的特征 id 存在；锚点几何与「表面在脸下」无断言，见 ENG-02 与 ENG-06） |
| `FACES` / `faceFor` / `FACE_IDS` | 61 张脸 | 渲染、动作配置 | `packages/core/src/face.ts:77-159` | 已确认（`render.test.ts:14-28`、`motion.test.ts:94-117`） |
| `FACE_META` / `faceMeta` / `facesInGroup` | 61 条中文名与分组 | 选择器、文档页、桌面表情网格 | `packages/core/src/face.ts:173-251` | 已确认（`apps/desktop/test/face-sync.test.mjs:94-101` 断言每条都有 kaomoji） |
| `CAST` / `castMember` / `CAST_IDS` / `DEFAULT_CAST` | 15 个有名成员 | 托盘、岛、设置、站点 | `packages/core/src/cast.ts:70-100` | 已确认（`cast.test.ts:20-80`） |
| `breed(a,b,seed)` | 两个成员交叉出新基因组 | 文档页样例 | `packages/core/src/cast.ts:103` | 已确认（函数合同有测试 `cast.test.ts:82-114`；**产品内无落地**，见 §8） |
| `LEXICON` / `lexiconEntry` | 33 条具名表达 | 无宿主引用 | `packages/core/src/lexicon.ts:31-75` | 待验证（无测试、无消费方） |
| `SHAPES` / `getShape` / `shapePreview` | 8 个旧公式轮廓 | 仅导出 | `packages/core/src/shapes.ts:22-81` | 已废弃（`index.ts:55` 注释：只为已存偏好保留；全仓无调用方） |
| `<emojitot-ball>` 元素 | 页面里一行标签即得一个角色 | 5 个桌面页面 + 站点 | `packages/core/src/element.ts:41-302` | 已确认（`design-qa.md:82` 角色与表情页、`:139` 冒烟） |
| 元素属性 `cast/body/shape/color/state/size/traits/finish/motion/live/paused` | 控制外观与是否 live | 属性变化触发重绘 | `packages/core/src/element.ts:41-44`、`:224-295` | 已确认（同上；`finish` 曾漏在 `observedAttributes` 外，`:101-108` 有记录） |
| 元素方法 `bounce/spin/burst/play` | 一次性动作，不改状态 | 宿主调用 | `packages/core/src/element.ts:152-215` | 待验证（live 分支转 `runtime.pulse`，静态分支播 CSS 关键帧；两分支都无断言） |
| `createCharacterRuntime(root, opts)` | 挂一个会动的角色 | `@emojitot/core/runtime` | `packages/core/src/runtime.ts:123` | 已确认（`design-qa.md:139` 冒烟含角色联动、`docs/RELEASE-NOTES.md:102`；RAF 层无单测，见 §8） |
| 运行时方法 `setState/setPaused/setFollowPointer/setPointer/pulse/snapshot` | 生命周期与输入 | 宿主调用 | `packages/core/src/runtime.ts:64-72`、`:599-696` | 已确认（桌面/站点实际使用，`design-qa.md:139` 冒烟含角色联动）；`destroy()` 单独记在 ENG-17 |
| `createSpring / stepSpring / springProgress` | 弹簧积分器 | 运行时逐帧 | `packages/core/src/motion/spring.ts:18-66` | 已确认（`motion.test.ts:13-29`） |
| `EYE_POLYGONS / eyePolygonsFor / morphPolygon / polygonPath` | 眼型拓扑与形变 | 运行时逐帧 | `packages/core/src/motion/eyes.ts:70-113` | 已确认（`motion.test.ts:31-68`） |
| `motionProfile(state)` | 状态 → 动作参数 | `setState` | `packages/core/src/motion/profiles.ts:123` | 已确认（`motion.test.ts:94-117` 覆盖 61 张脸） |
| `createCharacterStateMachine` | 迁移记录 | `createCharacterRuntime` 内部 | `packages/core/src/motion/state-machine.ts:31` | 已确认（`motion.test.ts:71-92`） |
| `EMOTIONS / EMOTION_IDS / EMOTION_SEGMENTS / SEGMENT_FALLBACK / IDLE_*` | 协议表与段回退 | 全宿主 | `packages/protocol/src/emotions.ts:61-154` | 已确认（`packages/protocol/test/protocol.test.ts:20-62`） |
| `stateForEmotion / resolveEmotionId / emotionIdForState / getEmotion / isEmotionId / normaliseId` | id ↔ 状态 | 解析、仲裁、桌面 | `packages/protocol/src/emotions.ts:165-243` | 已确认（`protocol.test.ts:64-93`、`semantics.test.ts:16-48`） |
| `parseAgentMessage / parseAgentMessageDetailed` | 报文 → 消息（含失败原因） | 桌面 `emitState` | `packages/protocol/src/parse.ts:49-127` | 已确认（`protocol.test.ts:95-124`） |
| `createArbiter / DEFAULT_PRIORITY` | 多会话仲裁 | 桌面 agent 层、站点场景页 | `packages/protocol/src/arbiter.ts:113-418` | 已确认（`arbiter.test.ts` 8 例 + `semantics.test.ts:92-227`） |
| `createEmotionChannel / isEvent / segmentOf` | 单来源事件桥 | 文档示例 | `packages/protocol/src/channel.ts:63-132` | 已确认（`protocol.test.ts:126-160`；**无宿主接入**，见 §8） |

## 4. 数据与存储

**结论先说**：两个包都没有持久化、没有网络、没有 `fs`/`path` 依赖；所有「数据」是模块加载时构建的常量表 + 一个宿主持有的内存对象。宿主自己的偏好文件（如桌面 `prefs.json`）由宿主写，不属本模块。

| 数据 | 位置 / 文件 | 写入者 | 读写时机 | 备注 |
| --- | --- | --- | --- | --- |
| 身体表（15） | `packages/core/src/body.ts:54-174` | 代码作者 | 加载建 `BY_ID`（`:183`） | 每项含 `path/face/height/pointed?/parts?/round?/eyeScale?` |
| 配色表（12） | `packages/core/src/palette.ts:8-21` | 代码作者 | 每次渲染 `colorHex` | 未知 id → `black`（`:31-33`） |
| 特征表（27 键 = 26 特征 + `none`） | `packages/core/src/traits.ts:35-148` | 代码作者 | 渲染时拼接 | 4 个分组常量 `:161-164` |
| 表情表（61）与命名表（61） | `packages/core/src/face.ts:77-152`、`:173-240` | 代码作者 | 渲染 / 选择器 | 两表 id 集合完全一致（本次核对：61=61，双向差集为空） |
| 阵容表（15） | `packages/core/src/cast.ts:50-85` | 代码作者 | 加载建 `BY_ID`（`:87`） | 第 7 列是唯一特征；`:77-84` 注释记录了「这一列曾被丢弃」的旧 bug |
| 协议表（51 行 / 61 状态名） | `packages/protocol/src/emotions.ts:68-127`、`:22-35` | 代码作者 | 加载建 `BY_ID`（`:131`）、`STATE_TO_ID`（`:138-139`） | 编号发布后不重排（`docs/PROTOCOL.md:34`） |
| 优先级表（39 项） | `packages/protocol/src/arbiter.ts:113-153` | 代码作者 | 每次 `resolve`/`update` 查 | 未列出的状态按 0 计（`:159-160`） |
| 仲裁会话表 | 内存 `Map<string, ArbiterSession>` | `arbiter.update()` | 每次 `update` 写、`tick` 删 | 含 `headless`、`lastSeen`（`:55-62`、`:293-300`） |
| 事件播放队列 | 内存数组（优先级降序 + 到达序） | `enqueue()` | 停留期结束时 `dequeue()` | `:178-189` 注释说明从「单槽」改成「有序列表」的原因 |
| 监听器集合 | 内存 `Set` | `arbiter.subscribe` / `channel.on` | 发布时遍历；单个抛错被吞 | `arbiter.ts:227-233`、`channel.ts:76-85` |
| 运行时状态 | DOM 数据集 `data-et-runtime / data-state / data-paused / data-reduced-motion` | `createCharacterRuntime` | 挂载时写；`setState`/`setPaused` 更新 | `runtime.ts:164-167`、`:605`、`:621`；`destroy` 删 `data-et-runtime` |
| 迁移历史 | 内存数组，上限 12 | `machine.transition` | 每次状态变化 | `motion/state-machine.ts:22`、`:42` |
| 动作配置缓存 | 模块级 `Map<string, MotionProfile>` | `motionProfile` 首次调用 | 命中即返回 | `motion/profiles.ts:117`、`:125-136` |

## 5. 状态与异常矩阵

> 只列真实存在的分支。渲染是同步纯函数，**没有加载/空/离线/重试**这些概念；异常边界集中在「入参不认识」和「浏览器能力缺失」两类。

| 场景 | 当前表现 | 实现位置 | 备注 |
| --- | --- | --- | --- |
| 渲染成功 | 返回 `<svg … viewBox="0 0 100 100" …>` 字符串 | `packages/core/src/render.ts:512-518` | 固定 `role="img"`、`aria-label="emoji-tot"` |
| 未知 `state` | 回落 `FACES.idle`，仍画一张完整脸 | `packages/core/src/face.ts:157-159` | 有测试：`render.test.ts:36-42`（未知 state 与 idle 字节相同） |
| 未知 `body` | **抛错** `Unknown body "x". Known bodies: …` | `packages/core/src/body.ts:187-191` | 有测试：`render.test.ts:48-52` |
| 未知 `color` | 回落 `COLORS.black`，不抛错 | `packages/core/src/palette.ts:31-33` | 无专门测试；行为在代码里是显式的 |
| 未知 `trait` id | 静默丢弃（既不在 `TRAITS` 也不在 `SURFACE_TRAITS`） | `packages/core/src/render.ts:378-379` | 与 `body` 的抛错策略不一致，见 §8 |
| 未知 `style` 值 | 落到 `else` 分支，按 `flat` 画 | `packages/core/src/render.ts:484-488` | 无白名单校验 |
| 运行时挂载失败（找不到 `svg` 或 `.et-character/.et-face`） | 抛错 `Character runtime could not find its SVG.` / `…missing its rig layers.` | `packages/core/src/runtime.ts:179-182` | 元素层 `catch` 后回落静态 SVG（`element.ts:278-292`） |
| `prefers-reduced-motion: reduce` | 不启 RAF，直接 `staticPaint()` 画一次；之后每次 `setState` 也静态重绘 | `packages/core/src/runtime.ts:137-139`、`:581-597`、`:613-616` | 元素层 CSS 另有 `@media` 关动画（`element.ts:34`） |
| 宿主 `paused` | 取消 RAF、保留当前姿态；`data-paused="true"` | `packages/core/src/runtime.ts:619-630` | 恢复时重置 `last` 再排帧（`:626-629`） |
| 元素 `live` 但运行时构造抛错 | 降级成静态 SVG（`try/catch` 内先 `#destroyRuntime()`） | `packages/core/src/element.ts:262-292` | 用户看到不动的球，不是空白 |
| 元素断开 DOM | `#destroyRuntime()` | `packages/core/src/element.ts:64-66` | 路由/卡片卸载路径 |
| 解析：空输入 | `reason: 'empty'` | `packages/protocol/src/parse.ts:102-104` | `parseAgentMessage` 同时返回 `null` |
| 解析：坏 JSON | `reason: 'bad-json'` | `packages/protocol/src/parse.ts:108-114` | 不抛异常 |
| 解析：对象但没有 id 字段 | `reason: 'no-id'` | `packages/protocol/src/parse.ts:116-121` | — |
| 解析：不是对象/数组/数字 | `reason: 'not-object'` | `packages/protocol/src/parse.ts:125-126` | — |
| 解析：id 形式对但不在表里 | `reason: 'unknown-id'` | `packages/protocol/src/parse.ts:124-126` | 落段回退在 `stateForEmotion` 里 |
| 通道收到读不懂的报文 | 不改变屏幕；`reportErrors !== false` 时发 `error` 事件 | `packages/protocol/src/channel.ts:95-105` | 返回 `{emotionId: fallbackId, state: current.state}`（见 §8） |
| 通道监听器抛错 | 被吞掉，其余监听器继续 | `packages/protocol/src/channel.ts:76-85` | 注释理由：「the face still has to render」 |
| 仲裁首帧（还没有任何会话） | 构造即 `publish(idleResult())`，宿主总能画东西 | `packages/protocol/src/arbiter.ts:191-194`、`:378-380` | 有测试：`semantics.test.ts:106` 期望首个回调是 `idle` |
| 仲裁：停留期内到达普通状态 | 被忽略（保持当前） | `packages/protocol/src/arbiter.ts:336-337` | — |
| 仲裁：停留期内到达不紧急事件 | 入队，停留结束后按优先级播 | `packages/protocol/src/arbiter.ts:325-329` | 有测试：`arbiter.test.ts:74-81` |
| 仲裁：比当前更紧急的事件 | 立即打断停留期 | `packages/protocol/src/arbiter.ts:319-333` | 有测试：`arbiter.test.ts:67-72` |
| 仲裁：会话静默超过 TTL | 删除会话并立刻重新解析（不等停留期） | `packages/protocol/src/arbiter.ts:340-354` | 有测试：`arbiter.test.ts:83-90` |
| 仲裁：`autoTick` 关闭 | 只由宿主调 `tick()` 才扫 | `packages/protocol/src/arbiter.ts:365-376` | 有测试：`semantics.test.ts:193-209` |
| 仲裁：最后一个会话被 remove | 清空队列并立刻回 idle | `packages/protocol/src/arbiter.ts:384-392` | 有测试：`arbiter.test.ts:112-118` |
| 仲裁：`dispose()` | 清停留定时器、TTL 定时器、监听器、队列 | `packages/protocol/src/arbiter.ts:406-416` | 有测试：`semantics.test.ts:211-227` |
| 仲裁：订阅时已有帧 | `subscribe()` 立刻回调当前帧一次，再接收后续变化 | `packages/protocol/src/arbiter.ts:399-405` | 有测试：`arbiter.test.ts:92-101`（期望序列以 `02` 开头） |
| 仲裁：同一会话同一 emotionId 重复上报 | 直接返回，不重排停留、不重发 | `packages/protocol/src/arbiter.ts:316` | — |
| 通道：同一 emotionId 再来一次 | 不触发 `change`，只可能带 `tips` | `packages/protocol/src/channel.ts:87-92` | 有测试：`protocol.test.ts:138-140`（`'34'` 连续两次只记一次） |
| 运行中标签页切回 | `visibilitychange` 里重置 `last`，避免一次巨大 `dt` | `packages/core/src/runtime.ts:677-679`、`:527` | `dt` 本身另夹到 0.05s |
| 元素属性变化 | `attributeChangedCallback` → `#draw()` 整体重绘（live 时先比 `runtimeKey`） | `packages/core/src/element.ts:68-70`、`:251-259` | 属性写同样值不重绘（`oldValue !== newValue`） |

## 6. 功能合同

> 每条可独立验收；`状态` 只用五个词；`证据` 给测试文件或验收记录。
> 判据（本文件从严）：**已确认** = 有测试文件、或 `design-qa.md` / `docs/RELEASE-NOTES.md` 这类可查验收记录**直接覆盖该条合同**；「代码读得出来但没人试过」一律记 **待验证**，哪怕实现看起来显然正确。

| ID | 功能 | 入口 | 行为合同（判定条件 / 时序 / 文案 / 数据副作用） | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- |
| ENG-01 | 渲染是纯函数 | `renderCharacter` | 同一入参两次渲染字符串**逐字节相同**；不读时钟、不查全局、不碰 DOM | 已确认 | `packages/core/test/render.test.ts:30-34`；`render.ts:1-6` 头注释 |
| ENG-02 | 叠放顺序 | `renderCharacter` | 实际输出顺序固定为：`behind`（风格附加 + 身体的后置部件）→ `shell`（身体填充）→ `partsOver`（物种部件，如花瓣）→ 表面特征 → 脸 → 表头特征（耳/冠/尾）→ `over`（高光/粒子）。表面必须在脸之下，表头特征必须在脸之上 | 待验证 | 顺序只由 `packages/core/src/render.ts:496-511` 一处数组字面量决定；**无断言**：`render.test.ts:14-28` 只验「不空」，把两层写反测试不会红 |
| ENG-03 | 墨色规则 | `inkFor(bodyHex)` | 亮度 `L=(0.299r+0.587g+0.114b)/255`；`L<0.55` → `#FFFFFF`，否则 `#1F1F1F`；非法 hex 得到 `NaN`，因 `NaN<0.55` 为 false 而走深墨（推断） | 待验证 | `packages/core/src/render.ts:79-80`、`:120-127`；无断言，`render.test.ts` 不检查墨色，只做确定性比较 |
| ENG-04 | 15 个身体 | `BODIES` | 每个是 100×100 盒内闭合路径、坐在 (50,50)，带 `face` 锚点；`star` 用 `round:11` 磨圆尖角；`flower/clover` 的 `path` 是中间小圆 + 旋转花瓣/叶片部件；`tot` 的天线属于身体而非特征 | 已确认 | `packages/core/src/body.ts:54-174`；`render.test.ts:14-28`（`:26` 断言遍历数等于 `15×61` 且 `>300`） |
| ENG-05 | 12 个配色 | `COLORS` | id → 实色 hex；未知 id → `#1F1F1F`；中文名在 `COLOR_ZH` 一一对应 | 待验证 | `packages/core/src/palette.ts:8-33`；`cast.test.ts:31-35` 只验 id 存在且不渲染，`colorHex` 回落分支无断言 |
| ENG-06 | 26 特征 + 空槽 | `TRAITS` | 4 组：耳 6（`catEar/bunnyEar/bearEar/foxEar/mouseEar/deerAntler`）、顶 9（`horn/antenna/sprout/leaf/flowerCrown/halo/crown/bow`）、侧 5（`wing/fin/spike/tail/fluff`）、表面 6（`blush/freckles/spots/stripes/patch/starfield`）+ `none`；特征按身体 `height`/`pointed` 定位；表面走「脸之下」通道，其余走「脸之上」 | 待验证 | `packages/core/src/traits.ts:35-148`、`:159-166`；`render.ts:82`、`:378-379`；`cast.test.ts:56-62` 只验 id 合法，锚点几何与层序无断言 |
| ENG-07 | 61 张表情 | `FACES` | 眼 10 种 × 嘴 12 种 × 眉 6 种，组合受表约束；可选 `dx/dy/eyeScale/mouthScale/eyeAsym/shake/blush/marks`（5 种道具）；未知 state → `FACES.idle` | 已确认 | `packages/core/src/face.ts:9-19`、`:77-159`；`render.test.ts:36-42` |
| ENG-08 | 两层词汇（51/61） | `EMOTIONS` + `FACE_META` | 51 个两位 id 各自对应 1 个状态；另有 10 个状态**引擎能画但协议无编号**：`drowsy, bored, powering-down, working, composing, proud, sad, suspicious, scared, alerting`；两表并集恰为 61 | 已确认 | `packages/protocol/src/emotions.ts:68-127`；`packages/core/src/face.ts:173-240`；`apps/gallery/src/faces.ts:8-16` 列出同 10 个；本次核对：`FACES`/`FACE_META`/`StateId` 三集合完全相等（61） |
| ENG-09 | 命名表是唯一命名点 | `FACE_META` / `faceMeta` | 每条含 `id/name(中文)/group(life 或 emotion 或 agent)/desc`；未知 id 返回 `{id, name:id, group:'emotion', desc:''}`，不返回 undefined | 已确认 | `packages/core/src/face.ts:32-38`、`:173-247`；`apps/desktop/test/face-sync.test.mjs:94-101` |
| ENG-10 | 33 条名录 | `LEXICON` | 33 条：life 9（含 `08 Spawning` 标 `extra`）、emotion 12（10–21）、agent 12（30–41）；每条 `state` 必须存在于 `FACES`（注释声称有测试守护，实际没有，见 §8） | 待验证 | `packages/core/src/lexicon.ts:31-75`；全仓无测试、无消费方 |
| ENG-11 | 15 人阵容 | `CAST` / `castMember` | 一身体一成员，id 唯一；**每个成员最多一个特征**；`face` 必在 `FACES`、`motion` 必在 `MOTIONS`（7 种）、`family` 必在 `FAMILIES`（6 种）；默认成员 `tot` | 已确认 | `packages/core/src/cast.ts:20-32`、`:50-100`；`cast.test.ts:20-79` |
| ENG-12 | 交叉 | `breed(a,b,seed)` | 确定性：同 seed 结果深度相等；`body/color/face/motion/family` 按 `seed%2` 取一方；特征 `seed%3===0` 取 a、`===1` 取 b、否则无；id 形如「a.id-x-b.id-(seed%997)」；结果**不进** `CAST` | 已确认 | `packages/core/src/cast.ts:103-117`；`cast.test.ts:82-114` |
| ENG-13 | 7 种 finish | `RenderOptions.style` | `flat`（实色无描边，默认）/ `sticker`（白或深色裁切线 + 左上高光）/ `glow`（径向渐变 + 沿轮廓光晕 + 火花）/ `dots`（点阵裁剪 + 发丝边）/ `line`（只描边，过浅的身体压暗）/ `candy`（竖向渐变 + 弧形高光）/ `emoji`（体积渐变 + 顶部高光 + 底部遮蔽 + 22% 暗边）；`outline:true` 优先于 style | 待验证 | 仅 `sticker`（桌面默认，`design-qa.md:82`）与 `flat`（`render.test.ts` 的默认路径）有覆盖；`glow/dots/line/candy/emoji` 只有代码可读，无断言、无 UI 入口（`packages/core/src/render.ts:413-488`） |
| ENG-14 | 内嵌 idle 循环 | `RenderOptions.motion === 'demo'` | 在 SVG 内注入 `<style>`：`.et-breathe` 4.8s `cubic-bezier(.37,0,.63,1)`，`transform-origin:50px 94px`，50% 时 `scale(1.03) rotate(-.8deg)`；`.et-eyes` 4.8s linear，93%–100% 保持 `scaleY(1)`、95% 为 `scaleY(.1)`；`prefers-reduced-motion:reduce` 时两条动画都 `none`；只有 `BLINKABLE`（`dot/wide/pill/heart/star/half`）6 种眼型进眨眼组 | 待验证 | `packages/core/src/render.ts:92`、`:104-110`、`:344-346`、`:515-516`；静态截图断言不了动画，无测试、无 motion 类验收记录 |
| ENG-15 | 自定义元素契约 | `<emojitot-ball>` | 11 个被观察属性；默认 `size=120`、`color='white'`、`finish='sticker'`、`state='idle'`；`live` 时交给运行时且**只在 `runtimeKey` 变化时重建**（key = cast/body/color/traits/finish/size），只改 `state` 走 `setState`；`motion="demo"` 时元素自己的 4.2s 呼吸让位给 SVG 内的 4.8s；元素产生的 SVG 一律 `aria-hidden="true"` | 已确认 | `packages/core/src/element.ts:18-44`、`:224-295`；`design-qa.md:82`、`:139` |
| ENG-16 | 运行时挂载 | `createCharacterRuntime(root, opts)` | 默认 `size=360`、`style='sticker'`、`color='black'`、`state` 取成员 `face` 或 `idle`；挂载即写 `root.innerHTML = renderCharacter(...)`，随后把 `.et-face` **替换**为 `.et-live-face`（多边形眼 + chrome 宿主），在角色前后插入信号层、在 `svg` 末尾插入粒子层；缺 `svg`/rig 层直接抛错 | 已确认 | `packages/core/src/runtime.ts:127-186`、`:193-210`；要素验收见 `design-qa.md:139` |
| ENG-17 | 销毁契约 | `runtime.destroy()` | 置 `destroyed`、`cancelAnimationFrame`、移除 `pointermove/pointerleave/visibilitychange` 三个监听、清粒子数组、`delete root.dataset.etRuntime`、`root.replaceChildren()`；此后 `schedule()` 不再排帧；元素的 `disconnectedCallback` 必须调用它 | 待验证 | `packages/core/src/runtime.ts:698-708`、`:521-523`；`element.ts:64-66`、`:217-222`；`docs/ARCHITECTURE.md:104` 只是要求，没有测试或验收记录证明监听与 RAF 真被清干净 |
| ENG-18 | 16 顶点眼型 | `EYE_POLYGONS` | 10 种拓扑**顶点数恒为 16**，因而同编号顶点可直接插值；`morphPolygon` 长度不一致抛错；`eyeAsym` 只作用右眼；`heart` 眼球固定洋红 `#F0526E` | 已确认 | `packages/core/src/motion/eyes.ts:13`、`:70-104`；`runtime.ts:113-115`；`motion.test.ts:31-68` |
| ENG-19 | 弹簧边界 | `stepSpring` | 单次 `dt` 夹到 0.5s，内部按 1/120s 上限切子步；`dt<=0` 或非有限值直接返回；积分后值/速度非有限 → 吸附到 target 并清零；差值绝对值 < 5e-5 且速度绝对值 < 5e-5 时吸附 | 已确认 | `packages/core/src/motion/spring.ts:15-60`；`motion.test.ts:13-29` |
| ENG-20 | 动作配置 | `motionProfile(state)` | 未知 state **递归取 `idle`**；基线取 `FACE_META` 的 `group`（life/emotion/agent 三套：energy/breath/sway/lift/tilt/eyeHold/blinkMin/blinkMax/gaze/eyes/signal）；`eyes` 保证含该脸的 `spec.eye`（不在则插队首）；再叠加 `OVERRIDES[state]`；结果缓存 | 已确认 | `packages/core/src/motion/profiles.ts:30-70`、`:117-137`；`motion.test.ts:94-117` |
| ENG-21 | 两位 id 严格性 | `isEmotionId` / `stateForEmotion` | 只接受整数 0–99，或去空白后匹配 `^[0-9]{1,2}$` 的串；`'3'`/`'03'`/`' 03 '`/`3` 等价于 `'03'`；`'3.5'`/`'58abc'`/百位长串/`null` 一律**不是 id**，`stateForEmotion` 返回 `idle`（无段可落） | 已确认 | `packages/protocol/src/emotions.ts:165-183`、`:213-222`；`semantics.test.ts:16-48` |
| ENG-22 | 段回退 | `SEGMENT_FALLBACK` | 段：`lifecycle 0–9`、`feeling 10–29`、`agent 30–49`、`signalling 50–59`（60–99 无段）；未知 id 先看十年段再取回退：lifecycle→`02`、feeling→`02`、agent→`32`、signalling→`50`；无段 → `idle` | 已确认 | `packages/protocol/src/emotions.ts:61-66`、`:149-154`、`:185-193`、`:213-222`；`protocol.test.ts:80-85` |
| ENG-23 | 事件 vs 条件 | `EMOTIONS[].oneshot` | 10 个 id 是事件：`01 07 08 13 25 31 33 34 38 50`；其余 41 个是条件；`isOneshotEmotion` 直接读表 | 已确认 | `packages/protocol/src/emotions.ts:49-59`、`:68-127`、`:200`；`protocol.test.ts:56-61` |
| ENG-24 | 仲裁优先级 | `DEFAULT_PRIORITY` | 39 项显式数值：`alerting=error=80`、`refusing=70`、`panicked=66`、`celebrate=done=60`、`surprised=55`、`satisfied=52`、`receiving=50`、`notifying=48`、`dragging=46`、`searching=loading=42`、工作类 40（`working/busy/focused/replying/writing/reading/sending/uploading`）、`composing=36`、`progress=34`、`thinking=30`、`recalling=29`、`waiting=28`、`listening=26`、`resigned=24`、`powering-down=powering-off=22`、`puzzled=20`、`waking=shake-awake=spawning=15`、`booting=12`、`tired=8`、`down=6`、`spacing-out=4`、`dormant=2`；未列出为 0；`headless` 不参与 | 已确认 | `packages/protocol/src/arbiter.ts:108-160`、`:196-214`；`arbiter.test.ts:44-55` |
| ENG-25 | 最小停留 + 排队 | `createArbiter` | 默认 `minDisplayMs=900`：上屏后 900ms 内普通状态不得替换；停留结束时**先播队列**、再 `resolve()`；解析结果与当前相同则**不再重排定时器**（防自激） | 已确认 | `packages/protocol/src/arbiter.ts:166`、`:257-285`；`arbiter.test.ts:57-65`、`:74-81` |
| ENG-26 | 紧急打断 | `arbiter.update` | 事件到达时：若 `priority(state) > priority(shown)` 立即 `apply`，否则入队；屏幕空时立即上屏；事件**永不丢弃** | 已确认 | `packages/protocol/src/arbiter.ts:318-334`；`arbiter.test.ts:67-72`；`semantics.test.ts:92-146` |
| ENG-27 | headless 不上屏 | `update({headless:true})` | 会话仍写入表，但**无论优先级都不显示**，也不入队 | 已确认 | `packages/protocol/src/arbiter.ts:43-45`、`:199-201`、`:310-313`；`arbiter.test.ts:51-55` |
| ENG-28 | 会话过期 | `tick()` / 自动扫描 | 默认 `sessionTtlMs=120000`；`lastSeen < now-TTL` 的会话被删；`autoTick !== false` 时自建定时器，间隔 `max(1000, min(round(TTL/4), 15000))`（默认 120s → 15s），可用时 `unref()`；有会话被删才 `apply(resolve())`（不等停留期） | 已确认 | `packages/protocol/src/arbiter.ts:167`、`:340-380`；`semantics.test.ts:175-227` |
| ENG-29 | 事件桥 | `createEmotionChannel(opts)` | `initial` 默认 `'02'`；`fallback` 默认等于 initial；`reportErrors` 默认 **true**；`feed` 读到就 `apply` 并发 `change`（仅 `emotionId` 变化时）与 `tips`（仅当带 tips）；读不懂则发 `error{reason,input}` 且**不改屏幕**；`dispose()` 清空三类监听 | 已确认 | `packages/protocol/src/channel.ts:63-127`；`protocol.test.ts:126-160` |
| ENG-30 | 报文形状 | `parseAgentMessage` | 接受 `{emotionId}`/`{emotion}`/`{state}`（三选一，null 视为没有）、JSON 字符串、裸 id `"34"`、裸状态名 `"thinking"`；`tips` 非空才带上；`hud` 只要求是对象，**内容原样透传不校验**；数组/布尔/数字/空串一律 `null` | 已确认 | `packages/protocol/src/parse.ts:19-30`、`:49-82`、`:101-127`；`protocol.test.ts:95-124` |
| ENG-31 | 信号层 | `motionProfile(state).signal` | 五种：`none` 不建层；`orbit` 建 2 个圆点绕上半椭圆（半径 46/49，y 方向压扁 0.42）；`scan` 建 3 个同心圆环（半径 40 起，相位差 1/3，透明度随相位衰减）；`progress` 建 1 个 `r=47` 圆环，用 `stroke-dashoffset` 在 35%–65% 间摆动；`spark` 建 5 个四角星（5 个全部挂在 `signalFront`，绕半径 47 转、y 压扁 0.76）。颜色取 `var(--motion-signal, #9683ff)`，火花隔一个用 `#FFD34D` | 待验证 | `packages/core/src/runtime.ts:291-393`；`motion/profiles.ts:24`；无断言，只有代码可读 |
| ENG-32 | 一次性动作 | `runtime.pulse(action)` | `spin` → 自旋目标 `2π`；`wobble` → `2π*0.45`；两者都在 760ms 后且差值 < 0.02 时归零；`bounce`/`float` → 重设 `hopAt`（0.92s 双峰曲线，第一峰 −15、第二峰 −6）；`burst` → 生成 `round(10+energy*10)` 个粒子（寿命 0.9s，半径 38 + 速度×age）；`tilt` → `rotate.velocity += 48`；其余 → `scaleX.velocity += 7` 且 `scaleY.velocity -= 7`；reduced-motion 下全部 no-op | 待验证 | `packages/core/src/runtime.ts:415-432`、`:641-660`、`:101-111`、`:395-413`；元素层 `#play` 的 CSS 分支同样无断言 |
| ENG-33 | 眼型轮转 | `motionProfile(state).eyes` + `setState` | 每 `eyeHold * (0.75 + random*0.5)` 毫秒切换到播放表下一个（循环），切换走 `morphEyes` 的 16 点形变而不是替换节点；`blinkMin<=0` 的状态（`sleeping/drowsy/powering-off` 等）永不眨眼；每次 `setState` 重置 `nextEyeAt/nextBlinkAt/blinkAt` 并立即形变到播放表首位 | 待验证 | `packages/core/src/runtime.ts:550-554`、`:599-617`、`:434-449`；`motion/profiles.ts:74-77`；播放表本身有测试（`motion.test.ts:94-117`），轮转时序无断言 |

### 6.1 数值常量基线（改之前先读这里）

| 常量 | 值 | 实现位置 | 影响的用户可见结果 |
| --- | --- | --- | --- |
| 呼吸周期（静态 SVG 内） | 4.8s，`cubic-bezier(.37,0,.63,1)` | `packages/core/src/render.ts:104-110` | 页面里 `motion="demo"` 的静止呼吸 |
| 呼吸周期（元素自带 CSS） | 4.2s，`ease-in-out`，`transform-origin:50% 88%` | `packages/core/src/element.ts:31-33` | 非 live、非 demo 时的轻微起伏 |
| 眨眼关键帧（静态） | 4.8s 周期，95% 处 `scaleY(.1)` | `packages/core/src/render.ts:106-108` | demo 模式的眨眼节奏 |
| 眨眼（运行时） | 时长 280–370ms，四段：`phase<0.15` → 0.08、`phase<0.32` → 0.06、`phase<0.72` → 1.08、`phase<1` → 1 | `packages/core/src/runtime.ts:434-449` | 运行时眨眼曲线（略带过冲） |
| 帧预算 | `dt` 夹 0.05s；弹簧子步 ≤ 1/120s；单帧最大 0.5s | `packages/core/src/runtime.ts:527`、`motion/spring.ts:15-16`、`:36` | 后台标签页回来不炸帧 |
| 姿态弹簧（12 通道，频率/阻尼） | x 4.8/0.9、y 5.4/0.88、rotate 4.2/0.82、scaleX 10/0.78、scaleY 10/0.78、gazeX 13/1、gazeY 13/1、lid 28/1、eyeMorph 10/0.92、eyeScale 8/0.9、chrome 10/1、spin 5.2/0.92 | `packages/core/src/runtime.ts:563-574` | 「跟手」的松紧、换脸时的过渡软硬 |
| 遥测节流 | 100ms（`onTelemetry` 存在时才推） | `packages/core/src/runtime.ts:515-519` | 宿主拿快照的频率 |
| 信号/粒子层级 | `signalBack` 在角色组之前、`signalFront` 在角色组之后、粒子层挂在 `svg` 末尾 | `packages/core/src/runtime.ts:193-196`、`:209-210` | 光点该在身体后还是前 |
| 迁移历史上限 | 12 条 | `packages/core/src/motion/state-machine.ts:22` | 宿主能回溯多少步 |
| 仲裁停留 / TTL / 扫描 | 900ms / 120000ms / `min(TTL/4, 15000)` | `packages/protocol/src/arbiter.ts:166-167`、`:366` | 表情稳不稳、幽灵会话多久散 |

### 6.2 协议段分组与接收端（rx）规则

| 段（`EMOTION_SEGMENTS`） | 范围 | 已用 id | 空号（留给扩展） | 未知 id 回退 | 证据 |
| --- | --- | --- | --- | --- | --- |
| lifecycle 生命周期 | 0–9 | 10 个（00–09） | 无 | `02` | `packages/protocol/src/emotions.ts:62`、`:70-79` |
| feeling 情绪 | 10–29 | 18 个（10–27） | 28、29 | `02` | `packages/protocol/src/emotions.ts:63`、`:82-99`、`:149-154` |
| agent 代理工作 | 30–49 | 20 个（30–49） | 无 | `32` | `packages/protocol/src/emotions.ts:64`、`:102-121` |
| signalling 提示 | 50–59 | 3 个（50–52） | 53–59 | `50` | `packages/protocol/src/emotions.ts:65`、`:124-126` |
| （无段） | 60–99 | 0 | 全部 | `idle`（没有段可落） | `packages/protocol/src/emotions.ts:185-193`、`:213-222` |

接收端规则（rx）——合起来是「外部脚本再野，也不会把角色弄挂，也不会让它卡住」：

| 规则 | 判定条件 | 实现位置 |
| --- | --- | --- |
| R1 只认 1–2 位十进制 | 整数 0–99，或去空白后 `^[0-9]{1,2}$`；其余一律不是 id（返回 null，不抛） | `emotions.ts:165-183`、`:181-183` |
| R2 未知 id 按十年段回退 | 见上表；回退值本身必须在表内（`protocol.test.ts:46-54` 守这条） | `emotions.ts:149-154`、`:213-222` |
| R3 非法/无段输入不白屏 | `60–99` 无段 → `idle`；`null`/垃圾 → `idle` | `emotions.ts:217`、`:221` |
| R4 多种写法等价 | `{emotionId}`/`{emotion}`/`{state}`、JSON 串、裸 id、裸状态名 | `parse.ts:49-82` |
| R5 坏输入不抛异常 | 返回 `null` 或 `{ok:false, reason}`；`reason` 五值见 §5 | `parse.ts:49`、`:101-127` |
| R6 读不懂不改屏 | 通道保持当前表情，只（可选）发 `error`；`reportErrors:false` 时连事件也不发 | `channel.ts:95-105` |
| R7 事件不丢 | 10 个 oneshot id 永不丢弃，停留期内排队；条件可被替换 | `emotions.ts` 各行 `oneshot`；`arbiter.ts:318-334` |
| R8 紧急事件穿透停留期 | 仅当 `priority(new) > priority(shown)` | `arbiter.ts:323-333` |
| R9 `headless` 不上屏 | 跟踪但不显示、不入队 | `arbiter.ts:310-313` |
| R10 静默会话自动散 | `lastSeen < now-120s` 即删；`autoTick` 默认开 | `arbiter.ts:340-354`、`:365-376` |
| R11 监听器隔离 | 单个监听器抛错被吞，其余照常收 | `channel.ts:76-85`、`arbiter.ts:227-233` |
| R12 `dispose()` 后静默 | 通道清监听；仲裁器清定时器/队列/监听 | `channel.ts:121-126`、`arbiter.ts:406-416` |

## 7. 不可随意改变（红线）

1. **渲染叠放顺序**：表面特征必须在脸之下、表头特征必须在脸之上（`render.ts:496-511`）。腮红挪到脸上会遮眼，耳朵挪到脸下会被身体吞掉 —— 理由写在 `render.ts:8-13`，也是 `docs/ARCHITECTURE.md:75-83` 的既定事实。（注意：这条顺序**没有断言** —— 它是红线，但不是被测试保护的红线，见 ENG-02。）
2. **墨色阈值 0.55 与两个墨色常量**（`render.ts:79-80`、`:120-127`）。改阈值会同时改变「黑底白字」和「白底黑字」两端，也就是桌面默认角色 `tot` 的外观。
3. **16 顶点恒定**（`motion/eyes.ts:13`）。新眼型必须正好 16 点，否则 `morphPolygon` 抛错（`:83-92`），形变手感与「一次换眼」的叙事同时崩。
4. **61 个状态名与 51 个 id 的对应关系**（`face.ts:173-240` + `emotions.ts:68-127`）。外部脚本按 id 硬编码；`docs/PROTOCOL.md:34` 写死「编号一旦发出永不重排」。新增只能填空号（feeling 28/29、signalling 53–59 空着）。
5. **段边界与回退表**（`emotions.ts:61-66`、`:149-154`）。把 `09` 挪出 lifecycle、或让 feeling 回退到某个具体情绪，都会破坏「不认识的 id 也不白屏」。
6. **10 个 oneshot id 的性质**（`emotions.ts` 各行的 `oneshot: true`）。事件变条件后，仲裁 `arbiter.ts:318-334` 的前提被破坏，开始丢事件。
7. **仲裁三数值**：`minDisplayMs=900`、`sessionTtlMs=120000`、扫描间隔 `min(TTL/4, 15000)`（`arbiter.ts:166-167`、`:366`）。降低停留会让连续工具事件闪脸；提高 TTL 会让没有收尾钩子的工具长期占屏。
8. **紧急打断规则**（`arbiter.ts:319-333`）：只有更紧急的事件能穿透停留期。改成「所有事件都打断」会退化成闪烁。
9. **`headless` 不上屏**（`arbiter.ts:310-313`）：后台工作不许抢脸。
10. **每个角色最多一个特征**（`cast.ts:9-11` 注释 + `cast.test.ts:75-79` 断言）。这是 72px 下的可读性约束，不是风格偏好。
11. **两套默认 finish 不能统一**：纯渲染默认 `flat`（`render.ts:381`），元素/运行时默认 `sticker`（`element.ts:237`、`runtime.ts:136`）。把元素改成 `flat` 会直接改变桌面所有窗口的角色外观。
12. **元素自带的 4.2s 呼吸与 SVG 内 4.8s 呼吸不得同时开**（`element.ts:31-39` 的 CSS 互斥规则）。两条周期不同的缩放在同一元素上会互相拍打。
13. **零运行时依赖 + 非商用 license 字段**：`scripts/docs-consistency.mjs:56-59` 强制两个 `package.json` 写 `LicenseRef-EmojiTot-Noncommercial` 且不得出现 `"license": "MIT"`，否则 `pnpm docs:check` 失败（`package.json:29`）。加运行时依赖也会破坏「浏览器 / Electron 主进程 / Node 中继 / VS Code 扩展通用」这条定位（`packages/protocol/src/index.ts:5-7`）。
14. **`index.ts` 不得引入 `element.ts`**（`packages/core/src/index.ts:59-63` 注释）：元素继承 `HTMLElement`，从 Node 导入会立即抛错，静态导出与测试会一起挂。
15. **运行时各层的挂载位置**：信号层插在角色组前后、粒子层挂在 `svg` 末尾、`.et-live-face` 替换 `.et-face`（`runtime.ts:193-210`）。挪进 `.et-character` 会让它们在姿态弹簧里跟着缩放/旋转，光点就不再是「环绕」而是「贴在身上」。
16. **眼型播放表必须含当前脸的眼型**：`motionProfile` 用 `base.eyes.includes(face.eye) ? base.eyes : [face.eye, ...base.eyes]` 保证首位一定是自己的眼型（`profiles.ts:130-134`），而 `setState` 立刻形变到首位（`runtime.ts:612`）。删掉这行保护，某些状态会在切换瞬间跳到别的眼型再转回来。

## 8. 已知缺口与风险

**缺测试的层**

- `createCharacterRuntime` 的 RAF/弹簧/眨眼**没有单元测试**：`packages/core/test/motion.test.ts` 只覆盖纯函数（弹簧、眼型、迁移、配置），帧循环与监听清理没有断言。它判「已确认」依据的是 docs 验收记录（`design-qa.md:139` 的 36/36 冒烟含「15 官方角色联动」、`docs/RELEASE-NOTES.md:102`），**不是**自动化测试；帧率、打断手感、长时间运行内存行为均**未验证**。
- `<emojitot-ball>` 的元素行为（属性观察、live 与静态切换、`#play` 的关键帧注入）同样没有测试；`element.ts:187-215` 用字符串拼 `animation` 简写、靠 `name.split(' ')[1]` 取时长，格式一变就静默失效。属**未验证**。
- `lexicon.ts:15-17` 声称「a test walks this list and fails on any id that has no face」，但全仓（`packages/core/test`、`apps/desktop/test`）**没有任何 `LEXICON` 引用**。该守护**不存在**，`LEXICON` 目前也无消费方（grep 只命中导出与 vendor 拷贝）。状态按「待验证」记。
- `createEmotionChannel` 有测试但**没有生产接入**：桌面走 `parseAgentMessage` + `createArbiter` 加自己的 `emotions()` 分层（`apps/desktop/src/main.js:269-277`、`:921-930`），站点场景页走 `createArbiter`（`apps/gallery/src/scene.ts:311-322`）。文档示例（`docs/PROTOCOL.md:66-79`）是它唯一的对外展示，属「有合同、无用户路径」。
- `breed` 的产物**从未被画出来**：唯一用法是文档页取样例后只拼进一行代码注释（`apps/gallery/src/docs.ts:209`、`:234`）。`renderCast` 只认 `CAST` 里的 id，未知 id 回落 cream 圆（`render.ts:522-526`），所以 bred 角色必须走 `renderCharacter` 并显式传基因组 —— 这条路径没有任何界面承接。

**表内的不一致与死条目**

- `motion/profiles.ts:99` 有一条 `afraid` 覆盖项，但 `afraid` 不在 `FACES`/`FACE_META` 里；`motionProfile` 对非 `FACES` 状态会递归回 `idle`（`:124`），因此 `afraid` **不可达**，是死配置。
- `emotions.ts:134-137` 的注释用「Tired 与 Dormant 共用 state」解释 `STATE_TO_ID` 只取最低 id；实测当前 51 个 id 映射到 51 个**互不相同**的 state（本次核对），该例子已过时。
- `face.ts:2-7` 头注释写「sixty expressions」，实际 61 条（`:77-152`）。
- `traits.ts:11-13` 头注释写「八种顶饰」，实际 `TOPS` 有 9 条（`:62-95`）。
- `shapes.ts` 的 8 个旧轮廓无任何调用方；`renderCharacter` 的 `shape` 别名其实也走 `getBody`（`render.ts:371`）。旧偏好里若存了这 8 个 id 恰好能命中 `BODIES` 同名项 —— 属**巧合而非兼容层**（推断：没有代码把 `SHAPES` 的 id 映射到 `BODIES` 的 id）。

**覆盖面比实现窄的地方**

- **7 种 finish 只有 2 种进过界面**：桌面端所有 `<emojitot-ball>` 都不写 `finish`，固定走元素默认的 `sticker`；站点控制台只给 `sticker` / `flat` 两个按钮（`apps/gallery/src/console.ts:220-221`、`:574`），`apps/gallery/src/zh.ts:28-31` 的 `FINISH_ZH` 也只有两项。`glow / dots / line / candy / emoji` 五种在当前产品里**没有用户路径**，也没有测试（见 ENG-13）—— 要么补界面，要么承认它们是预留能力。
- **中文名有两套且不一致**：引擎导出 `BODY_ZH` / `TRAIT_ZH` / `MOTION_ZH` / `COLOR_ZH`，站点却自己维护 `apps/gallery/src/zh.ts`，同一 id 两处措辞不同（引擎 `star:星`、`flower:花`、`white:雪白`、`pink:樱粉`；站点 `star:星星`、`flower:樱花`、`white:白`、`pink:粉`）。引擎那三张表全仓 0 消费方（`COLOR_ZH` 也只被站点 drawer 用），改一处不会同步另一处，属静默漂移风险。
- **一批导出没有消费方**：`PAIRED`、`bodyPreview`、`shapePreview`、`springProgress`、`isEvent`、`segmentOf` 在仓库内除定义与 vendor 拷贝外无调用；`facesInGroup` 只出现在文档页的代码示例字符串里（`apps/gallery/src/docs.ts:318-322`）；`SHAPE_IDS` 只在 `getShape` 的报错文案里用。它们不是缺陷，但会让人误以为「有 API 就有人在用」。（`renderFaceDetails` / `polygonPath` 不在此列，运行时内部确实在用：`runtime.ts:266`、`:472`。）

**行为上的坑**

- `channel.feed` 解析失败时返回 `{emotionId: fallbackId, state: current.state}`（`channel.ts:104`）：id 与 state **可能不是同一对**（例如当前在 `error`、fallback 是 `02`，返回 `emotionId:'02'` 配 `state:'error'`）。宿主照 id 重绘会跳回 idle，照 state 则保持不动 —— 语义靠调用方猜，属设计债。
- 未知 `trait` 静默丢弃（`render.ts:378`）而未知 `body` 抛错（`body.ts:189`）：同层 API 两种失败策略，宿主要做输入校验只能自己写白名单。
- `renderCharacter` 的 `aria-label` 固定为 `emoji-tot`（`render.ts:513`），不随状态变化；元素/运行时又把 SVG 置 `aria-hidden`（`element.ts:276`、`:294`，运行时各层同样 `aria-hidden="true"`）。读屏用户拿不到「现在是什么表情」。属可访问性空缺，**未验证**是否被 UI-AUDIT 接受（`docs/UI-AUDIT.md` 覆盖桌面页面，不覆盖本模块）。
- 默认尺寸/颜色在四处不同：`renderCharacter` 无默认（`color` 必填）、`renderCast` 默认 `size=96`（`render.ts:525`）、元素默认 `120`/`white`（`element.ts:230`、`:228`）、运行时默认 `360`/`black`（`runtime.ts:134`、`:131`）。同一 id 在不同入口下外观不同，是「看着一样其实不一样」的常见来源。
- `pulse()` 在 reduced-motion 下**静默 no-op**（`runtime.ts:642`），宿主无法区分「播了」与「被降级」。
- `runtime.setState` 只换脸与信号，不触发一次性动作；`snapshot().transitionReason` 记的是 `setState` 的 `reason` 参数（默认 `'host'`），不是仲裁来源 —— 宿主若要标注「谁让它变脸」必须自己传（`runtime.ts:599-617`、`:500-513`）。
- 协议 `60–99` 号位当前无段：`emotionSegment` 返回 `null`、`stateForEmotion` 直接回 idle（`emotions.ts:185-193`、`:213-222`）。将来扩段必须先改 `EMOTION_SEGMENTS` 与回退表，否则这批 id 被静默吞成待机。
- 两个包的「表 → 消费者」契约靠人守：`apps/desktop/test/face-sync.test.mjs:94-101` 只保证 `FACE_META` 每条都有 kaomoji；没有测试保证 `FACE_META` / `FACES` / `StateId` 三集合相等（本次是人工核对相等）。新增状态时若只加 `FACES` 不加 `FACE_META`，渲染能跑、选择器不显示、命名回落成英文 id，**不会红**。
- 数量类事实（15/12/26/61/15/7/6）由 `scripts/facts.mjs:68-92` 从代码算，再经 `scripts/sync-docs.mjs:29-37` 写回带 `<!--facts:…-->` 标记的位置，漂移会让 `pnpm docs:check` 失败（`package.json:29`）。但 **51 个 id 的数量没有进 `FACTS` 的文档标记**（`facts.mjs:71` 仅内部计算）；`docs/PROTOCOL.md` 的「33 个测试」是 `docs-consistency.mjs:43-61` 用字符串 `rejectText` 守的，不是从测试文件数出来的 —— 加/删测试要人手改这条断言。