# 界面测量 / UI audit

一条命令，把岛和设置窗的布局契约重新量一遍。它替代了此前每轮临时写在 `.agents/` 里的 CDP 脚本：同样的 10 + 14 页、同样的阈值，换一轮开发不用重写。

```powershell
pnpm ui:audit                  # 默认一轮：10 个岛页 + 14 个设置页
pnpm ui:audit -- --stress      # 再加一轮：等宽字体 + 字重 600 + 缩放 140%
pnpm ui:audit -- --json        # stdout 只有一份 JSON，适合接 CI
pnpm ui:audit -- --port 9580   # 指定 CDP 端口
pnpm ui:audit -- --exe <path>  # 指定另一个安装版 exe
pnpm ui:audit -- --skin solid  # 只跑一套皮肤
pnpm ui:audit -- --skins all   # 五套皮肤各量 10 个岛页，设置窗只量一次
```

脚本只读界面：它不修改 `renderer/` 或 `main/` 的源码，也不碰你正在用的 profile；唯一的写入是 `%TEMP%` 下自己的临时 profile。退出码在发现违规时为 1，可以直接当闸门。

## 它量什么

| 面 | 指标 | 判定 |
| --- | --- | --- |
| 岛（每页） | `.pages` 的 `scrollHeight` | 大于 `clientHeight`（= 217）即内容溢出 |
| 岛（每页） | 内容盒实际占用 | 最底部子元素的底边减内容区顶边；超过可用高度即溢出 |
| 岛（每页） | 横向越界元素 | 元素盒子越过 `.pages` 内容盒左右边，且不是被内层 `overflow: hidden` 主动裁掉的装饰 |
| 岛（每页） | 被裁文字 | 自己或某个祖先 `overflow: hidden/clip` 裁掉了文字，而该处没有 `text-overflow: ellipsis` |
| 岛（每页） | 滚动区高度 | 内层 `overflow-y: auto/scroll` 的 `clientHeight === 0` 且还有内容 |
| 岛（每页） | 控件高度 | `button/input/select/textarea/a[href]/[role=button]` 可见高度 < 20px |
| 设置窗（每页） | 横向溢出 | `#content` 的 `scrollWidth > clientWidth`，或某个元素越过内容列左右边 |
| 设置窗（每页） | 卡片内越界 | 元素盒子越过它最近的 `.card` 左右边 |
| 设置窗（每页） | 被裁文字 | 同岛，但以 `#content` 为边界；纵向滚动是设置窗的正常行为，不算裁切 |
| 设置窗（每页） | 控件高度 | 同上，< 20px |

另有一项对账：页数取自 `src/shared/schema.js` 的 `PAGE_MANIFEST`（10）和 `SETTINGS_NAV`（14），实际页数取自运行中的 DOM（`#dots button`、`#rail .rail-item`）。两边对不上时报告 `page-count`，防止某一页没渲染出来却悄悄少测一页。

测量时临时 profile 会打开全部页面（`devices` 默认是关的），并关掉动画与自动避让，保证量到的是布局而不是过渡帧。

## 皮肤（--skin / --skins all）

岛有五套皮肤：`frost`（毛玻璃）、`solid`（实色）、`plain`（极简）、`magazine`（杂志）、`console`（控制台）。皮肤改变的是填充、字体与装饰，`.pages` 的 217px 盒高不变；但同一页在毛玻璃下守得住，不代表在杂志版下也守得住。所以每套皮肤都要把 10 个岛页重新量一遍。

- `--skin <key>`：把皮肤写进临时 profile 的 `prefs.json`，再启动应用，只测这一套。
- `--skins all`：按 `frost → solid → plain → magazine → console` 依次起五次应用，每套量 10 个岛页。设置窗 14 页只在第一套（frost）量一次：`skin` 只作用于岛窗口（`island.js applyPrefs() → body[data-skin]`），设置窗不套皮肤、布局完全相同，重新量五遍只会得到五份一样的数字。报告里每个被跳过的设置窗都会注明这一点。

启动后脚本会读 `document.body.dataset.skin`，和预期不一致就把这一轮判失败：未知皮肤值会静默回退到 frost，报告若还挂着 solid 的标题，量到的就是另一套布局。

`--skin` / `--skins` 与 `--stress` 互斥：stress 轮固定用默认皮肤，皮肤轮固定用默认字体与缩放，避免「某套皮肤 + 140%」这种组合把报告撑成二维矩阵。

`--json` 在顶层多一层 `skins`，键是皮肤名。每套皮肤一个对象：

```json
"skins": {
  "frost": {
    "name": "frost",
    "prefs": { "skin": "frost", "font": "system", "weight": 400, "uiScale": 100 },
    "island": { "expectedPages": 10, "foundPages": 10, "pages": [], "issues": [] },
    "settings": { "expectedPages": 14, "foundPages": 14, "pages": [], "issues": [] },
    "errors": [],
    "violations": 0,
    "settingsMeasured": true
  },
  "solid": {
    "name": "solid",
    "prefs": { "skin": "solid", "font": "system", "weight": 400, "uiScale": 100 },
    "island": { "expectedPages": 10, "foundPages": 10, "pages": [], "issues": [] },
    "settings": null,
    "errors": [],
    "violations": 0,
    "settingsMeasured": false
  }
}
```

`skins.<key>.settings` 为 `null`、`settingsMeasured` 为 `false`，表示这一套没有再量设置窗；顶层 `settingsMeasuredOn` 说明设置窗实际量在哪套皮肤上。

## 阈值从哪来

```css
/* apps/desktop/src/renderer/island.css */
.pages { padding: 12px 2px 0; height: 217px; overflow-y: auto; scrollbar-width: none; }
```

- **217** 是 `.pages` 的固定盒高。面板不随页面变高，翻页时窗口不跳。
- **12** 是它的 `padding-top`。这 12px 是视觉留白，不属于可用内容。
- **205 = 217 − 12**，是一页真正能画东西的高度。内容超过 205 时 `scrollHeight` 会大于 217；而 `.pages` 隐藏了滚动条，用户看不到「下面还有」，所以溢出就是 bug，不是可滚动。
- **20px** 是最小可点高度。当前设计里开关是 20–22px（`.switch`），20 是下限；低于 20 的按钮在 140% 缩放下很难点中。
- 测量值允许 **1px** 误差（`TOLERANCE`），避免小数像素和字体度量造成假阳性。

这些阈值不写死在脚本里：可用高度由运行时的 `clientHeight − padding` 算出，所以改 `.pages` 高度时脚本会跟着变；页数由 schema 提供。脚本只负责「现在是否守住了契约」。

## 怎么跑起来

脚本启动的是**安装版** `%LOCALAPPDATA%\Programs\@emojitotdesktop\EmojiTot.exe`，不是源码目录：

1. 在 `%TEMP%` 下建一个临时 `--user-data-dir`，写入测量用 `prefs.json`；
2. 清掉 `ELECTRON_RUN_AS_NODE` 后 spawn —— DSH 会话默认带这个变量，不清掉 Electron 会当 Node 跑，无窗口、静默退出 0；
3. 用 `--remote-debugging-port`（默认 9576，被占用时自动顺延）连浏览器端点，`Target.attachToTarget` 后操作真实窗口；
4. 岛：点 pill 展开，逐页点 `#dots button`；设置窗：在岛页面调用 `window.islandAPI.openSettings()`，再逐页点 `#rail .rail-item`；
5. 结束后 `taskkill /T /F` 杀掉自己起的整棵进程树，并删除临时 profile。成功、失败、违规、Ctrl+C 都走同一套清理。

安装版必须和当前源码的 schema 对得上。如果页数对不上，先重新构建安装，再判断是不是脚本的问题。

`--stress` 的 prefs 是 `font: mono`、`weight: 600`、`uiScale: 140`，也就是最宽的字符、最重的字重、允许的最大缩放。它比默认轮更严，可能真的报出违规：例如等宽字体下固定 `font-size: 11px` 的小按钮（`.msg-open`）会掉到 18.7px。看到 exit 1 先读 `Violations` 段；这是界面问题，不是脚本报错。

## 加一个页面

脚本不需要改。它从运行中的界面自己发现页面，只向 schema 对账：

- **岛**：在 `src/shared/schema.js` 的 `PAGE_MANIFEST` 加一项，再在 `renderer/island.js` 的 `RENDERERS` 里实现该页。脚本下次运行会多出一个 dot，自动按它测量。
- **设置窗**：在 `SETTINGS_NAV` 的某个分组里加一项，再在 `renderer/settings.js` 的 `RENDERERS` 里实现该页。脚本下次运行会多出一个 `[data-nav]`。

新增页面如果用了新的固定高度、内部滚动或 `.card` 之外的容器，第一次跑 `--stress` 就能看出它在极端字体下是否还守得住。

## 输出

人读模式按轮分节。单轮（默认 / `--stress` / `--skin`）是一张岛表（每页的 `scrollHeight`、`used/available`、横向越界、裁字、滚动区、小控件和 `ok/FAIL`）加设置表，最后是违规清单和这一轮的 PASS/FAIL。

`--skins all` 每套皮肤一个小节，五套跑完再打一张总表：

```text
Skins · island .pages scrollHeight (px) · contract ≤ 217
  page        frost  solid  plain  magazine  console
  音乐         205    205    205    205       205
  ...
  verdict     ok     ok     ok     FAIL      ok
```

总表一眼能看出「哪套皮肤、哪一页先撞线」；最后一行是全局 PASS/FAIL，只要有任意一套违规就是 `FAIL`，退出码 1。`--json` 输出同样内容的机器可读版本，除 `passes` 外还有「皮肤」一节描述的 `skins`：

```json
{
  "ok": false,
  "passes": [{ "name": "solid", "prefs": { "skin": "solid", "font": "system", "weight": 400, "uiScale": 100 } }],
  "skins": { "frost": { "violations": 0 }, "solid": { "violations": 2 } },
  "settingsMeasuredOn": "frost",
  "notes": ["settings pages are measured once, on frost: skins restyle the island window only, the settings window keeps one layout"],
  "issues": []
}
```

每个页面对象里的 `metrics` 是原始测量值，`issues` 是这一页的违规（带 `element`、`height`、`text` 等细节）。`errors` 收集渲染层的未捕获异常——页面脚本抛错也算违规。
