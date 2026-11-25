# Web 站点 + 构建/发布链

> 一句话职责：`apps/gallery` 是四页静态站点（控制台 / 表情馆 / 场景 / 文档），`scripts/*.mjs` 与 `apps/desktop/scripts/*` 是把站点和桌面端送进安装包、并守住「文档里的数字必须等于代码事实」的那条链。
> 实现根目录：`apps/gallery/`、`scripts/`、`apps/desktop/scripts/`（构建配置在 `apps/desktop/package.json` 的 `build` 字段，CI 在 `.github/workflows/ci.yml`）。

## 1. 范围与边界

**本文件覆盖**

- 站点外壳：hash 路由、四视图、语言与明暗开关、375px 断点（`apps/gallery/src/main.ts`、`index.html`、`style.css`）。
- 四个视图与它们共用的抽屉 / 状态 / 标签表（`console.ts`、`wall.ts`、`scene.ts`、`docs.ts`、`drawer.ts`、`store.ts`、`i18n.ts`、`zh.ts`、`faces.ts`）。
- 站点构建与验收：`apps/gallery/vite.config.ts`、`apps/gallery/scripts/{preview,browser-check}.mjs`。
- 根目录闸门脚本：`scripts/{facts,sync-docs,docs-consistency,settings-audit,scan-sensitive,build-info,check-version,release-version-lib,package-version-lib}.mjs`。
- 打包与发布：`apps/desktop/scripts/{copy-vendor,electron-builder,after-pack,build-launcher,packaged-layout,portable-launcher,sign-release-files,self-sign-dist}.*`、`apps/desktop/scripts/{window-smoke,ui-audit,capture-ui}.mjs`。
- 版本号规则、`pnpm check` 闸门链、`release/` 产物、GitHub Release 与更新检查的接缝。

**本文件不覆盖（见哪个文件）**

| 不覆盖的内容 | 去哪里看 |
| --- | --- |
| 桌面端主进程、四个窗口、IPC、托盘 | `docs/baseline/` 同目录的桌面端模块文件；`docs/ARCHITECTURE.md`（窗口表在第 15-22 行） |
| 岛与设置中心的具体控件、页面清单 | `docs/ISLAND.md`、`docs/SETTINGS.md`、`docs/SETTINGS-AUDIT.md` |
| 角色渲染、眼型/弹簧/运动运行时内部 | `docs/baseline/` 的 core 模块文件；`docs/ARCHITECTURE.md:60-90`（基因组四项 + 渲染四层） |
| 两位数协议、仲裁算法、事件桥 | `docs/PROTOCOL.md` |
| 本机数据保留与隐私细则 | `docs/PRIVACY.md`（本文件只记「站点零网络请求」这一条） |
| 直播封面 / SMTC 实测 | `docs/LIVE-COVERAGE.md` |
| 生成物 | `node_modules`、`dist`、`out`、`release`、`apps/desktop/.ui-capture`、`apps/gallery/src/{vendor,renderer/vendor}` 只当「产物存在」记录，本文件不逐行分析 |

**模块依赖方向（本模块视角）**

```
packages/protocol ─┐
packages/core ─────┴─→ apps/gallery ─→ dist（base=/emoji-tot/）─→ GitHub Pages（手工）
                   └─→ apps/desktop（copy-vendor 落成 src/vendor + src/renderer/vendor）
apps/desktop/src/shared/schema.js ─(vite alias)─→ apps/gallery（文档页读设置页数）
apps/desktop/src/shared/schema.js ─→ scripts/facts.mjs、scripts/settings-audit.mjs、scripts/docs-consistency.mjs
```

- 站点只依赖两个 workspace 包（`apps/gallery/package.json:11-14`）；`@emojitot/core` 对外暴露 `.`、`./element`、`./runtime` 三个入口（`packages/core/package.json:10-24`）；桌面端吃的是 protocol 的 `dist-cjs`（`packages/protocol/package.json:8-17`、`copy-vendor.mjs:13-18`）。
- 站点没有任何运行时第三方依赖：`dependencies` 只有两个 workspace 包，构建期只有 `vite`（`apps/gallery/package.json:11-17`）。

**证据写法**：本文件统一用「相对仓库根的路径 + 行号」或「路径 + 常量/函数名」（例：`apps/desktop/src/main.js:444`、`schema.js PAGE_MANIFEST`），与 `docs/baseline/README.md` §1 的 `code:`/`test:`/`doc:` 前缀等价，可直接互查；凡无直接证据的判断都标「推断：」或「未验证」。

**写作基准**：HEAD `bb435d1`、tag `v0.8.20.26`、`apps/desktop/build-info.json` = `0.8.20.26`（与 `docs/baseline/README.md:5` 同一基准）。桌面端与引擎的细节不在这里复制，见同目录 `01-runtime.md` / `02-island.md` / `04-engine.md` / `05-ball-tray-onboarding.md`。

## 2. 模块与文件清单

| 模块 | 职责 | 实现位置 | 触发 / 生命周期 |
| --- | --- | --- | --- |
| 站点外壳 | 四视图注册、hash 路由、语言/明暗开关 | `apps/gallery/src/main.ts:42-138` | 模块加载即 `render()`；`hashchange` 重渲染 |
| HTML 骨架 | CSP、社交元数据、导航、`#view` 容器 | `apps/gallery/index.html`（CSP 第 5-8 行，导航 43-48，容器 61） | 静态，不随视图重建 |
| 控制台视图 | 舞台、实时骨架、代码卡、岛屿演示、抽屉挂载点 | `apps/gallery/src/console.ts:175-624` | `#/console`，可带 `?state=` |
| 表情馆视图 | 角色/表情双 tab 网格 + 灯箱 | `apps/gallery/src/wall.ts:70-602` | `#/gallery` |
| 场景视图 | 九会话单脸仲裁 + 状态总线 + 十二人群 | `apps/gallery/src/scene.ts:121-499` | `#/scene`，自带 1.8s 定时器 |
| 文档视图 | 九节文档、TOC、协议表、实时骨架 | `apps/gallery/src/docs.ts:188-622` | `#/docs`，可带 `?section=` |
| 基因抽屉 | 角色 / 颜色 / 表情 / 背景四个基因 | `apps/gallery/src/drawer.ts:44-148` | 只在控制台内创建，随视图销毁 |
| 站点共享状态 | `look` 单例 + localStorage + 订阅 | `apps/gallery/src/store.ts:13-93` | 进程内单例，跨路由存活 |
| 文案字典 | zh/en 两套 key + `{name}` 占位符 | `apps/gallery/src/i18n.ts:11-330` | 全局；切换后广播重渲染 |
| 中文名表 | 颜色 / 背景中文名（另有未使用的轮廓/画风表） | `apps/gallery/src/zh.ts:9-58` | 抽屉渲染时读 |
| 状态标签 | state → 显示名 / 两位数 id | `apps/gallery/src/faces.ts:29-49` | 控制台、表情馆、文档共用 |
| 站点样式 | token、明暗两套、动效、窄屏与无障碍 | `apps/gallery/src/style.css`（token 21-70，reduced-motion 3654-3674） | 全局单份 |
| 站点构建配置 | `base=/emoji-tot/`、settings schema 别名 | `apps/gallery/vite.config.ts:12-25` | 构建/开发 |
| 浏览器验收 | 真 Chrome + CDP 走查四页与交互 | `apps/gallery/scripts/browser-check.mjs:1-606` | `pnpm check:gallery`、CI |
| 状态墙 | Node 里渲染全部协议 id 与表情 | `apps/gallery/scripts/preview.mjs:24-171` | `pnpm preview`、CI |
| 事实注入 | `<!--facts:*-->` 填充 + 下载块版本改写 | `scripts/facts.mjs:68-92`、`scripts/sync-docs.mjs:29-113` | `pnpm docs:sync` / `docs:check` |
| 文档一致性 | 人写文档的过期事实黑名单 | `scripts/docs-consistency.mjs:28-89` | `pnpm docs:check` |
| 设置审计矩阵 | schema → `docs/SETTINGS-AUDIT.md` | `scripts/settings-audit.mjs:32,168` | `pnpm settings:audit` / `settings:check` |
| 隐私扫描 | 跟踪文件的文本规则 + 大图 + commit 作者 | `scripts/scan-sensitive.mjs:68-74,127-201` | `pnpm scan`、CI |
| 构建身份 | 四段版本、package 版本同步、commit 与时间 | `scripts/build-info.mjs:35-54`、`scripts/build-info-lib.mjs:3-24` | `pack`/`dist` 前 |
| 发布版本解析 | 四段比较、bump 类型、下载链接版本 | `scripts/release-version-lib.mjs:3-54`、`scripts/check-version.mjs:30-61` | `pnpm version:check` |
| vendored 包拷贝 | protocol/core 拷进桌面端源码树并标 ESM | `apps/desktop/scripts/copy-vendor.mjs:13-38` | `prestart`/`predist`/`prepack` |
| 打包入口 | 调 electron-builder、拼便携包装、补签、提权 | `apps/desktop/scripts/electron-builder.mjs:13-71` | `pnpm dist` |
| afterPack | 原生启动器 + Electron 改名 + 完整性级别 | `apps/desktop/scripts/after-pack.mjs:7-26`、`packaged-layout.mjs:11-25`、`build-launcher.mjs:27-76` | 每次 Windows 打包 |
| 便携启动器 | 把 payload 拼到 exe 尾部 | `apps/desktop/scripts/portable-launcher.mjs:58-131` | dist 成功后 |
| 产物签名 | `CSC_LINK` → `@electron/windows-sign` | `apps/desktop/scripts/sign-release-files.mjs:12-42` | dist 尾部（有证书才签） |
| 自签流水线 | 复用/创建本机证书后重跑 dist | `apps/desktop/scripts/self-sign-dist.ps1` | `pnpm dist:selfsigned` |
| 真窗口冒烟 | CDP 附着实跑应用并断言行为 | `apps/desktop/scripts/window-smoke.mjs:1-1464` | `pnpm smoke:desktop`、CI |
| UI 测量审计 | 岛 11 页 / 设置 16 页布局契约 | `apps/desktop/scripts/ui-audit.mjs`（阈值文档在 `docs/UI-AUDIT.md`） | `pnpm ui:audit`（不在 check 链） |
| 截图采集 | 逐页 PNG 供设计对照 | `apps/desktop/scripts/capture-ui.mjs:42-47` | `pnpm --filter @emojitot/desktop capture:ui` |
| 类型声明 | 给 vite 别名补 `@emojitot/settings-schema` 的类型 | `apps/gallery/src/env.d.ts:7-15` | 编译期 |
| Electron 二进制解析 | 非 ASCII 路径时把运行时拷到 ASCII 缓存 | `apps/desktop/scripts/electron-runtime.mjs`（缓存根在 `:72`） | dev 启动、冒烟、审计、采集共用 |
| 审计用运行时暂存 | 给打包版审计准备 ASCII 运行时 | `apps/desktop/scripts/audit-runtime.mjs:13-21` | `ui-audit` 内部 |
| 图标栅格化 | SVG 主图 → 512/256/32/16 PNG | `apps/desktop/scripts/make-icon.mjs:17-22` | 手动，改图标时跑 |
| 生成物行尾归一 | 比较前把 CRLF 归一成 LF | `scripts/generated-text.mjs:2-4` | `settings-audit` 比较时 |
| CI | `verify`(ubuntu) + `desktop-smoke`(windows) 两个 job | `.github/workflows/ci.yml:13-117` | push main / PR / 手动 |

## 3. 页面 / 窗口 / 条目清单

### 3.1 站点界面条目

| 条目 | 用途 | 入口 / 触发 | 实现位置 | 状态 |
| --- | --- | --- | --- | --- |
| 站点外壳（header/nav/footer） | 四页导航、语言、明暗 | 任意 URL | `index.html:38-66`、`main.ts:60-70` | 已确认（`browser-check.mjs:471-474` 验导航与 lang） |
| `#/console` | 控制台（默认页） | 导航 / `#/console?state=x` | `main.ts:42-47`、`console.ts:175` | 已确认（`browser-check.mjs:217-220`） |
| `#/gallery` | 表情馆 | 导航 | `main.ts:44`、`wall.ts:70` | 已确认 |
| `#/scene` | 场景（多会话仲裁） | 导航 | `main.ts:45`、`scene.ts:121` | 已确认 |
| `#/docs` | 文档 | 导航 / `#/docs?section=id` | `main.ts:46`、`docs.ts:188,464-469` | 已确认（`browser-check.mjs:518-525` 断言 9 节） |
| 未知路由兜底 | 手改 hash 时不空白 | `path in routes` 为假 | `main.ts:53` | 待验证（无测试） |
| 舞台 hero + 三档尺寸 220/360/480 | 主角与截图主体 | `[data-size]` | `console.ts:27-34,522-532` | 待验证 |
| 画风切换 sticker/flat | 同一轮廓两种表面 | `[data-finish]` | `console.ts:98,572-576` | 待验证 |
| 动作按钮 自旋/弹跳/撒花 | `runtime.pulse` | `[data-act]` | `console.ts:216-218,595-601` | 待验证 |
| 暂停动作 | 无障碍：关掉持续动效 | `[data-motion-pause]` | `console.ts:243-246,437-446` | 已确认（`browser-check.mjs:251-255`） |
| 表情条（61 格） | 选脸 | `#faceGrid` | `console.ts:249-255,448-457` | 待验证 |
| 实时骨架遥测 | 眼型/倾角/抬升读数 | `onTelemetry` | `console.ts:233-247,391-407` | 待验证 |
| 代码卡 `snippet.html` / `genome.json` | 可复制的最小实现 | `#copy`/`#copy-json` | `console.ts:273-290,97-127` | 待验证（复制失败分支无覆盖） |
| 岛屿演示 pill/panel | 说明桌面形态 | `#island-pill` | `console.ts:257-270,588-594` | 待验证 |
| 基因抽屉 | 角色/颜色/表情/背景 | `.drawer-slot` | `drawer.ts:44-148` | 待验证（仅角色名语言切换被覆盖，`browser-check.mjs:484-491`） |
| 表情馆 tabs（角色/表情） | 两套目录 | `[data-tab]` | `wall.ts:93-100,549-559` | 已确认（`browser-check.mjs:266-304,355-373`） |
| 表情馆过滤 chips + 计数 | 按族/组过滤 | `[data-family]` | `wall.ts:310-330,432-466` | 已确认（同上，断言非空真子集） |
| 表情馆灯箱 | 放大 + 复制 snippet + 跳控制台 | 点表情格 | `wall.ts:283-306` | 已确认（`browser-check.mjs:374-426`） |
| 灯箱键盘（← → Esc） | 焦点留在 dialog | `keydown`/`cancel` | `wall.ts:197-228` | 已确认（同上） |
| 场景仲裁面板 | 单脸 + 来源 + 优先级条 | `[data-act]` | `scene.ts:141-171,311-339` | 已确认（`browser-check.mjs:440-463`） |
| 状态总线 | 转移历史（最多 5 条） | 每次 `onApply` | `scene.ts:173-179,282-300` | 待验证（未断言条数） |
| 十二人群 | 随机涌现 + 换一批/party/sleep/戳 | `.herd`、`.actor` | `scene.ts:235-260,448-477` | 待验证 |
| 文档 TOC（9 条） | 滚动高亮 + 跳节 | 点击/滚动 | `docs.ts:390-397,436-488` | 已确认（`browser-check.mjs:518-525`） |
| 文档实时骨架（3 个状态） | 引擎可动手看 | `[data-engine-state]` | `docs.ts:252-272,424-433` | 已确认（同上，断言 state=thinking） |
| 文档协议表 | 按组折叠 + 行内预览 + 点击复制 | `details`/`mouseover`/`click` | `docs.ts:156-180,302-313,506-565` | 待验证 |
| 语言切换（中文/EN） | 全站重渲染 | `#lang [data-lang]` | `main.ts:98-102`、`i18n.ts:314-323` | 已确认（`browser-check.mjs:471-474`） |
| 明暗开关（默认 dark） | 页面底色 | `#mono` | `main.ts:115-138` | 已确认（`browser-check.mjs:476-480`） |
| 375px 视口 | 窄屏不横向溢出 | 视口改 375 | `style.css:3629-3650`（480/420 断点）、`browser-check.mjs:557-567` | 已确认（四页逐一断言） |

### 3.2 命令与闸门条目

| 条目 | 用途 | 入口 / 触发 | 实现位置 | 状态 |
| --- | --- | --- | --- | --- |
| `pnpm check` | 11 道闸门串成一条（顺序见 WEB-33） | 人工 / 发布前 | `package.json:32` | 已确认（CI 把同一组命令拆开跑，`ci.yml:44-77`） |
| `pnpm check:gallery` | 构建站点 + 真 Chrome 验收 | 人工 / CI | `package.json:23`、`browser-check.mjs` | 已确认（`ci.yml:59-65` 设 `CHROME_REQUIRED=1`） |
| `pnpm preview` | 全量 id/表情渲染 + 状态墙 | 人工 / CI | `package.json:20`、`preview.mjs` | 已确认（`ci.yml:56-57`） |
| `pnpm facts` | 打印所有从代码算出的计数 | 人工 | `package.json:27`、`facts.mjs:94-99` | 已确认（`docs:check` 依赖同一模块） |
| `pnpm docs:sync` / `docs:check` | 填充 facts 标记 / 只校验不改写 | 人工 / CI | `package.json:28-29` | 已确认（`ci.yml:67-68`） |
| `pnpm settings:audit` / `settings:check` | 生成 / 校验设置审计矩阵 | 人工 / CI | `package.json:30-31` | 已确认（`ci.yml:70-71`） |
| `pnpm scan` | 隐私扫描（发布前必跑） | 人工 / CI | `package.json:26` | 已确认（`ci.yml:73-74`） |
| `pnpm test:scripts` | 四个根脚本的单测 | 人工 / `check` | `package.json:18` | 已确认（4 个 `.test.mjs` 都存在） |
| `pnpm smoke:desktop` | copy-vendor + 真窗口冒烟 | 人工 / CI | `package.json:24`、`window-smoke.mjs` | 已确认（`ci.yml:116-117`，windows job） |
| `pnpm ui:audit` | 岛/设置窗布局测量，违规即 exit 1 | 人工 | `package.json:33`、`ui-audit.mjs` | 待验证（不在 check 链，CI 不跑） |
| `pnpm --filter @emojitot/desktop capture:ui` | 逐页截图供设计对照 | 人工 | `apps/desktop/package.json:14` | 已确认（产出被 `design-qa.md:39-43` 引用） |
| `pnpm dist` | build → electron-builder → 便携包装 → 补签 | 人工（发布） | `package.json:21`、`apps/desktop/package.json:18` | 已确认（`release/` 有产物，tag 到 `v0.8.20.26`） |
| `pnpm dist:selfsigned` | 复用/创建本机证书后重跑 dist | 人工（发布） | `package.json:22`、`self-sign-dist.ps1` | 待验证（真签未验证，见 §8 第 11 条） |
| `pnpm version:check` | 版本纪律 | 人工（发布前） | `package.json:34`、`check-version.mjs` | 待验证（无单测；当前按设计会失败，见 §8 第 7 条） |
| `pnpm audit:ci` | 依赖漏洞审计（moderate 级阻断） | `check` / CI | `package.json:25` | 已确认（`ci.yml:76-77`） |
| `pnpm typecheck` | 四个包 tsc 校验 | `check` / CI | `package.json:19` | 已确认（`ci.yml:44-45`） |
| `pnpm test` | `pnpm -r test`：core/protocol 走 vitest，desktop 走 `node --test`，gallery 无 test 脚本 | `check` / CI | `package.json:17` | 已确认（`ci.yml:53-54`；gallery 无 test 见 §8 第 1 条） |

## 4. 数据与存储

| 数据 | 位置 / 文件 | 写入者 | 读写时机 | 备注 |
| --- | --- | --- | --- | --- |
| `es.look.v3` | 浏览器 localStorage | `store.persist()` `store.ts:56-62` | 每次 `setLook`/`selectCast`/`setTrait` | 键名带 `v3`；解析失败回默认基因组（`store.ts:37-46`） |
| `es.lang` | localStorage | `i18n.setLang` `i18n.ts:318` | 切语言 | 读在模块顶层（`i18n.ts:290-295`） |
| `es.mono` | localStorage | `main.setMono` `main.ts:120-124` | 拨动开关 | 默认 dark，显式 `'0'` 才亮（`main.ts:127-135`） |
| `es.stage.size` | localStorage | `console.setStageSize` `console.ts:526-530` | 点尺寸按钮 | 只接受 220/360/480（`console.ts:53-61`） |
| `es.motion.paused` | localStorage | `console.setMotionPaused` `console.ts:440-444` | 点暂停 | 跨路由保留 |
| `look` 单例 | 内存 | `store.ts:48` | 全视图共享 | 抽屉/控制台/灯箱/场景读同一对象 |
| `out/preview.html` | 仓库根 `out/`（gitignore `.gitignore:11`） | `preview.mjs:162-163` | `pnpm preview`、CI 上传 | 产物，不分析 |
| `apps/gallery/dist/` | 构建产物（gitignore `.gitignore:2`） | `vite build` | `pnpm check:gallery`、CI | base 前缀 `/emoji-tot/`（`vite.config.ts:15`） |
| `apps/desktop/build-info.json` | 本地（gitignore `.gitignore:20`） | `build-info.mjs:46-52` | `pack`/`dist` 前 | 当前 `0.8.20.26`，commit `bb435d1` |
| `apps/desktop/.build-number` | 本地（gitignore `.gitignore:19`） | `build-info.mjs:43-45` | 同上 | 同公开版本才 +1（`build-info-lib.mjs:12-16`） |
| 四个 shipping package 的 `version` | desktop / gallery / core / protocol 的 `package.json` | `syncPackageVersions` `package-version-lib.mjs:11-26` | 同上 | 只写三段（`:16-18` 校验） |
| `<!--facts:key-->` 标记 | README.md、README.en.md、docs/ARCHITECTURE.md 等 7 个文件（`sync-docs.mjs:29-37`） | `sync-docs.mjs` | `docs:sync`（`--check` 只报不写） | 现用 10 类 key；`FACTS` 共 20 项（`facts.mjs:68-92`） |
| `<!--downloads:start-->` 块 | 两个 README | `sync-docs.mjs:79-96` | 同上 | 版本取自 build-info，无则取 release notes 最新四段（`release-version-lib.mjs:27-31`） |
| `docs/SETTINGS-AUDIT.md` | 生成后入库 | `settings-audit.mjs:168` | `settings:audit` | 比较前行尾归一（`generated-text.mjs:2-4`） |
| `release/` | 产物目录（gitignore `.gitignore:13`） | electron-builder | `pnpm dist` | 见 WEB-24 |
| GitHub Release | 远端 | 人工发布 | `update-check.js` 每 6 小时读一次 | 只读 `releases/latest`，不下载（`update-check.js:8-11`） |

## 5. 状态与异常矩阵

**站点**

| 场景 | 当前表现 | 实现位置 | 备注 |
| --- | --- | --- | --- |
| 加载 | 无加载态 | —— | 站点零网络请求：`apps/gallery/src` 内 grep 无 fetch/XHR/WebSocket |
| 空 | 表情馆过滤为空 → 一句话「这个分类还没有…」 | `wall.ts:332-337` | 待验证：该分支无测试 |
| 成功（复制） | 按钮变「已复制」+ `data-done`，1200ms 后回原文 | `console.ts:546-561`、`wall.ts:240-253`、`docs.ts:546-563` | 三处各自实现，时长一致 |
| 失败（复制被拒） | 按钮变「复制失败」+ `data-state=failed` + warn；文档页先用 `execCommand` 兜底 | `console.ts:550-553`、`docs.ts:518-537` | 待验证 |
| 禁用 | 暂停或 reduced-motion 时三个动作按钮 `disabled` | `console.ts:404-406` | 待验证（无测试） |
| 离线 | 不适用 | —— | 无外部请求；CSP `connect-src 'self'`（`index.html:7`） |
| 文案缺键 | 回退中文 | `i18n.ts:307` | 决定了「英文页不会出现空标签」 |
| state 无双语名 | 英文页把 `powering-down` 渲染成 `Powering down` | `faces.ts:23-26,29-37` | 十个引擎独有状态走这条 |
| 未知路由 | 落到控制台 | `main.ts:53` | —— |
| 视图抛错 | `dispose` 异常被 catch 并 log，不阻塞下一个视图 | `main.ts:78-85` | —— |

**构建/发布链**

| 场景 | 当前表现 | 实现位置 | 备注 |
| --- | --- | --- | --- |
| 包未构建 | `facts.mjs` 打印「packages are not built」并 exit 1 | `facts.mjs:29-34` | 所以 `docs:*` 都前置 `pnpm build` |
| 未知 fact key | exit 1 | `sync-docs.mjs:65-70,101-104` | —— |
| 事实/下载版本过期 | `--check` exit 1 | `sync-docs.mjs:106-110` | CI 跑 `--check` |
| 人写文档过期 | `docs-consistency` exit 1，逐条列文件与原因 | `docs-consistency.mjs:85-89` | —— |
| SETTINGS-AUDIT 过期 | `settings:check` exit 1 | `settings-audit.mjs:164-166` | —— |
| 敏感信息命中 | `scan` exit 1，分 FAIL/WARN 两段输出 | `scan-sensitive.mjs:216-245` | WARN 不失败（大图需人看） |
| 无 Chrome | browser-check「SKIP」并 exit 0；`CHROME_REQUIRED=1` 时 exit 1 | `browser-check.mjs:32-36`、`ci.yml:63-65` | 本地绿色可能是跳过的绿 |
| Electron 二进制缺失 | window-smoke 直接 exit 1 并给出安装命令 | `window-smoke.mjs:29-32` | CI 先跑 `install-electron`（`ci.yml:113-114`） |
| 无签名证书 | 静默跳过，只一条 warning；dist 不进失败 | `sign-release-files.mjs:12-20,31-32` | 与 SIGNING.md 一致 |
| csc.exe 缺失 | 便携/启动器构建抛错，dist exit 非 0 | `portable-launcher.mjs:64-67`、`build-launcher.mjs:28-31` | 依赖 .NET Framework 编译器 |
| 完整性级别设置失败 | 只 warn，不失败 | `after-pack.mjs:23-25`、`electron-builder.mjs:62-64` | 针对非 ASCII 缓存问题 |
| git 不可用 | `commit` 记空串，不失败 | `build-info.mjs:23-33` | —— |
| Chrome 首启丢失调试端口 | 30s 后重启一次，再失败才判 FAIL | `browser-check.mjs:167-184` | 打印 `chrome did not answer in 30s; relaunching once` |
| 安装路径含中文 | 运行时被拷到 ASCII 缓存再启动 | `electron-runtime.mjs:72`、`audit-runtime.mjs:7-21` | 因此仓库放在 `E:\项目\…` 也能跑冒烟与审计 |
| 首次启动岛还没有盒子 | 零高度页面 ≥3 个 → 重跑一次审计；第二次仍违规则 FAIL 并点名页 | `ui-audit.mjs:44-48` | 报告里标 `retried` |
| 无 tag | `version:check` 直接 PASS 退出 0 | `check-version.mjs:36-40` | —— |
| 版本不新于 tag | exit 1 | `check-version.mjs:42-45` | 见 §8 第 7 条 |
| 条目不足 | exit 1，并提示该写 1 条还是 3 条 | `check-version.mjs:47-61` | BIG 需 3 条，SMALL 需 1 条 |

## 6. 功能合同（WEB-）

| ID | 功能 | 入口 | 行为合同（判定条件 / 时序 / 文案 / 副作用） | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- |
| WEB-01 | hash 路由 | 任意 `#/...` | 把 `#/x?q` 解析成 `{route, ctx.state}`；route 不在表内则回 `console`；只有 `state` 参数进 ctx，其余 query 丢弃；`render()` 在 `hashchange` 与模块末尾各调一次，并 `scrollTo(0)` | 已确认 | `main.ts:50-57,74-96`；`browser-check.mjs:217-220` |
| WEB-02 | 视图先销毁再新建 | 每次路由变化 | 先调 `active.dispose?.()`（异常 catch），再建新视图替换 `#view`；dispose 必须清定时器、IntersectionObserver、runtime、document 级监听。验收：20 次切换后活跃 interval = 0；离开场景后 = 0 | 已确认 | `main.ts:78-89`；`browser-check.mjs:539-554` |
| WEB-03 | 语言切换 | `#lang [data-lang]` | 写 `es.lang` → 改 `<html lang>` 为 `zh-CN`/`en` → 广播重渲染（不是改文本节点）→ 静态 `[data-i18n]` 同步重写 → `aria-pressed` 反映当前语言 | 已确认 | `main.ts:60-70,98-108`；`i18n.ts:314-323`；`browser-check.mjs:471-474` |
| WEB-04 | 页面明暗 | `#mono` | 默认 dark；只有 localStorage 显式 `'0'` 才 light；写 `<html data-mono>`；样式 token 由该属性驱动。验收：拨动后 `dataset.mono` 必变 | 已确认 | `main.ts:115-138`；`browser-check.mjs:476-480` |
| WEB-05 | 表情深链 | `#/console?state=happy` | 视图创建时立刻 `setLook({state})`，写 `es.look.v3` 并广播；不允许被已存状态覆盖；表情馆灯箱的「控制台」按钮用的也是同一条链接 | 已确认 | `console.ts:176-178`；`store.ts:65-71`；`browser-check.mjs:466-468` |
| WEB-06 | 代码卡与舞台同源 | 任一基因变化 | `look.cast` 非空 → `renderCast({id})`；否则 `renderCharacter({body,color,traits})`。`snippet()` 与 `genome()` 每次 apply 重算；只有文本真的变了才 flash（`data-flash` 重新触发，520ms 后移除） | 待验证 | `console.ts:77-127,459-486,379-389` |
| WEB-07 | 运行时按基因组重建 | 基因/尺寸变化 | 签名 = `[cast,body,color,traits,finish,stageSize]`；签名变 → `destroy()` 后重建；签名不变 → 只 `setState(state,'console')`。换表情不得重建运行时 | 待验证 | `console.ts:409-435,467-472` |
| WEB-08 | 复制反馈 | `#copy`/`#copy-json`/灯箱复制 | `navigator.clipboard.writeText` 成功 → 文案「已复制」+`data-done`+`dataset.state=ok`，1200ms 后恢复原文；拒绝 → 「复制失败」+`failed`+warn；两条路径都必须恢复 `disabled=false` | 待验证 | `console.ts:542-564`；`wall.ts:235-255`；`docs.ts:540-565` |
| WEB-09 | 舞台尺寸与画风 | `[data-size]`/`[data-finish]` | 尺寸只接受 220/360/480 并写 `es.stage.size`；snippet 仅在非 360 时附 `size="…"`；画风切换只改绘制参数，不改几何 | 待验证 | `console.ts:27-34,97-105,522-532` |
| WEB-10 | 暂停控件 | `[data-motion-pause]` | 控件存在于控制台，`aria-pressed` 与文案随 runtime 快照更新（暂停/继续），并在 `es.motion.paused` 里跨路由保留 | 已确认 | `console.ts:243-246,391-407,437-446`；`browser-check.mjs:251-255` |
| WEB-11 | 基因抽屉单一真相 | 抽屉任一控件 | 任一基因写入 `store.look` 并广播；改 body/color/traits 时 `cast` 置 `''`（变成自定义）；`selectCast` 整体替换四基因 + state；所有面板由 look 派生，不各自缓存 | 待验证 | `store.ts:65-89`；`drawer.ts:125-144` |
| WEB-12 | 表情馆双 tab / 过滤 / 计数 | `[data-tab]`、`[data-family]` | cast tab 首格是 4 格宽 feature 卡；emotion tab 61 格、4 个过滤（全部+三组）；计数文案 `{n} / {total}`；过滤结果必须是非空真子集；换 tab 时 filter 复位 `all` | 已确认 | `wall.ts:74-100,310-330,432-466,549-567`；`browser-check.mjs:266-304,355-373` |
| WEB-13 | 灯箱焦点 | 点表情格 | 打开时记住触发元素；→/← 换表情后焦点必须仍在 dialog 内；Esc（cancel）必须阻止默认并走同一 teardown；关闭后移除节点并把焦点还给（仍连接的）触发元素 | 已确认 | `wall.ts:146-228,283-306`；`browser-check.mjs:374-426` |
| WEB-14 | 场景单脸仲裁 | `#/scene` | 九会话各自上报，`onApply` 是唯一显示来源；同一 state 重复上报不产生新历史；历史最多 5 条；reset 移除全部会话 → owner 变 `—`，但历史保留 | 已确认 | `scene.ts:282-300,359-410`；`browser-check.mjs:440-463` |
| WEB-15 | 场景暂停=停表 | `[data-act="toggle"]` | 暂停清 interval 并把文案换成「继续自动上报」、`aria-pressed=true`；恢复从新计时（不是续算剩余） | 待验证 | `scene.ts:412-433` |
| WEB-16 | 文档九节 + TOC | `#/docs` | 九个固定 id 的 section（what…call）；TOC 按钮滚动到 `#sec-<id>`；按视口内 top 最接近 0 的节高亮；进入视口一次性揭示（reduced-motion 下直接可见） | 已确认 | `docs.ts:40-50,358-374,436-508`；`browser-check.mjs:518-525` |
| WEB-17 | 文档 `?section=` 记账 | 点 TOC / 深链 | 点击或深链进入都走 `goTo()`；用 `history.replaceState` 写 `?section=<id>`，不触发路由重渲染；深链在视图挂载后两个 rAF 再定位（无平滑） | 待验证 | `docs.ts:446-469,600-608` |
| WEB-18 | 文档协议表交互 | 表格行 | 三组 `<details>`，life 组默认展开；行 hover 时才注入 24px 预览（`data-ready` 缓存）；点击/回车/空格复制 emotionId，成功显示「已复制 #xx」、失败「复制失败」，1200ms 回原值；无 id 的十个状态显示 `—` | 待验证 | `docs.ts:156-180,302-313,506-590` |
| WEB-19 | 375px 无横向溢出 | 视口 375×812 | 四页 `documentElement.scrollWidth - 375` 必须 ≤ 0 | 已确认 | 断点 1080/860/480/420 与粗指针在 `style.css:3529,3537,3629,3643,3647`；断言 `browser-check.mjs:557-567` |
| WEB-20 | 站点与桌面共享设置表 | 文档页「设置中心」一句 | `@emojitot/settings-schema` 由 vite 别名指到 `apps/desktop/src/shared/schema.js`，页数 = `SETTINGS_NAV` 项数求和，不复制第二份表 | 待验证 | `vite.config.ts:12-23`；`docs.ts:33,342`；`env.d.ts:7-15` |
| WEB-21 | CSP 只允许 self | 任意页面加载 | `default-src 'self'`；`script-src 'self'`；`style-src 'self' 'unsafe-inline'`；`img-src 'self' data: blob:`；`object-src/base-uri/form-action 'none'`；`frame-ancestors 'none'` | 待验证 | `index.html:5-8`（无自动化断言） |
| WEB-22 | facts 标记由代码驱动 | `pnpm docs:check` | 未知 key → exit 1；值与 `FACTS` 不一致 → exit 1；写回只改两个标记之间；下载块里裸版本与 `v` 前缀版本分别替换 | 已确认 | `sync-docs.mjs:29-113`；`ci.yml:67-68` |
| WEB-23 | 四段版本号生成 | `pack`/`dist` | `package.json.version` 必须三段，否则抛错；同版本递增第四段（上限 65535），换版本归 1；`EMOJITOT_BUILD_NUMBER`/`BUILD_NUMBER` 可外部指定且不写本地计数 | 已确认 | `build-info-lib.mjs:3-24`；`build-info.test.mjs`；`build-info.mjs:38-45` |
| WEB-24 | 产物命名与便携包装 | `pnpm dist` | 安装包 `EmojiTot.Setup.exe`、便携 `EmojiTot.Portable.exe`；electron-builder 先产出内部 `EmojiTot.<buildVersion>.portable.internal.exe`，再拼原生启动器 + 追加 payload，签名后删内部件；打包树里 Electron 改名 `EmojiTotRuntime.exe`，`EmojiTot.exe` 是原生启动器 | 已确认 | `apps/desktop/package.json:49-67`；`electron-builder.mjs:15-53`；`packaged-layout.mjs:11-25`；测试 `packaged-layout.test.mjs`、`portable-wrapper.test.mjs` |
| WEB-25 | 无证书即跳过签名 | dist 尾部 | `WIN_CSC_LINK`/`CSC_LINK` 为空 → 返回 false，只一条 warning；配置了非本地文件（如密钥库 URL）→ 同样跳过并说明原因；只有本地证书文件才补签 | 已确认（真实产物签名未验证） | `sign-release-files.mjs:12-42`；`sign-release-files.test.mjs`；`docs/SIGNING.md:73-75` |
| WEB-26 | 版本纪律闸门 | `pnpm version:check` | 当前版本必须严格大于最近 `v*` tag；第三段 +1（BIG）需 notes 里该版本下 ≥3 条 `- ` 条目，第四段 +1（SMALL）需 ≥1 条；无 tag 直接 PASS | 待验证 | `check-version.mjs:30-61`（无单测文件；见 §8 第 7 条） |
| WEB-27 | 隐私扫描阻断 | `pnpm scan` | 只扫 `git ls-files`（跳过 vendor/node_modules/release/dist）；FAIL 集 = 文本规则命中 + 未登记的桌面尺寸截图；WARN 集 = 大图 + 非 noreply 的 commit 作者；FAIL 非空 → exit 1 | 已确认 | `scan-sensitive.mjs:22,68-74,174-201,216-245`；`scan-sensitive.test.mjs`；`ci.yml:73-74` |
| WEB-28 | 站点零网络请求 | 任意页面 | 构建产物只请求自身资产；跨域被 CSP 拦住；无统计、无字体 CDN、无第三方脚本 | 待验证 | `apps/gallery/src` grep 无 fetch/XHR/WebSocket；无自动化断言 |
| WEB-29 | vendored 包落位 | `pnpm start`/`dev`/`pack`/`dist`/`capture:ui` | 每个入口先跑 copy-vendor：清空目标目录 → 拷 `packages/protocol/dist-cjs` 到 `src/vendor/protocol`，拷 `packages/core/dist` 到 `src/renderer/vendor/core`，并在 core 目录写 `{type:module, main:index.js}`（否则主进程按 CJS 读 ESM 会在第一个 `export` 处失败） | 已确认 | `copy-vendor.mjs:13-38`；`apps/desktop/package.json:10-18`；间接由 `smoke:desktop` 覆盖 |
| WEB-30 | afterPack 打包整形 | 每次 Windows 打包 | 编译原生启动器到 `<outDir>/.launcher/EmojiTot.exe` → Electron 的 `EmojiTot.exe` 改名 `EmojiTotRuntime.exe` → 启动器装回 `EmojiTot.exe` → 对打包树 `icacls /setintegritylevel (OI)(CI)M /T`（失败只 warn） | 已确认 | `after-pack.mjs:7-26`；`packaged-layout.mjs:11-25`；测试 `packaged-layout.test.mjs` |
| WEB-31 | 真窗口冒烟的硬约束 | `pnpm smoke:desktop` | 端口 9555；`--remote-debugging-port` 必须先于应用路径传参；必须清掉 `ELECTRON_RUN_AS_NODE`；断言含「renderer 无 Node 全局（sandbox 开）」「preload 桥存在」「外窗尺寸非 0」；结束必 `taskkill /T` 并清临时 profile | 已确认 | `window-smoke.mjs:21-46,158-160,1447-1458`；`ci.yml:113-117` |
| WEB-32 | ASCII 运行时缓存 | 启动/冒烟/审计/采集 | 可执行文件路径非 ASCII 时，先把运行时拷到 `%LOCALAPPDATA%/EmojiTot/electron-runtime`（可用环境变量改）再启动；dev、安装版、便携版都要求这条 | 已确认 | `electron-runtime.mjs:72`；`audit-runtime.mjs:7-21`；测试 `electron-runtime.test.mjs`、`audit-runtime.test.mjs`；`README.md:63` |
| WEB-33 | `pnpm check` 的顺序 | `pnpm check` | 严格按序：`test:scripts → typecheck → build → test → docs:check → settings:check → preview → check:gallery → smoke:desktop → audit:ci → scan`；任一非 0 即中断。顺序有意义：`build` 必须先于 `test`（desktop 测试要 import protocol 的 dist） | 已确认 | `package.json:32`；`ci.yml:47-49` 的注释说明了 build-before-test |
| WEB-34 | 人写文档黑名单 | `pnpm docs:check` | 断言两个 README 含 `releases/download/v<artifact>/EmojiTot.Setup.exe` 与 `.Portable.exe`、含 `pnpm smoke:desktop`；禁止 `EmojiTot.Setup.<artifactVersion>`（用户面安装包不再暴露构建号）；并逐条禁掉过期的测试数、导航项数、功能页数、IPC 名、隐私文件名 | 已确认 | `docs-consistency.mjs:36-83`；`ci.yml:67-68` |
| WEB-35 | 设置审计矩阵生成 | `pnpm settings:audit` | 行来自 `knownPaths()` 与 `CONSUMERS`、默认值来自 `DEFAULTS`、页数来自 `PAGE_MANIFEST`/`STATUS_MANIFEST`，所以矩阵不会描述代码里没有的开关；`--check` 在行尾归一后比较，过期即 exit 1 | 已确认 | `settings-audit.mjs:21-30,57-134,156-168`；`ci.yml:70-71` |
| WEB-36 | 浏览器验收的覆盖面 | `pnpm check:gallery` | 四路由可渲染；控制台挂载有状态的多边形眼运行时并暴露暂停控件；cast 网格多列 + 过滤非空真子集；feature 卡可点开控制台；表情 tab 61 格/4 过滤/3 组；灯箱焦点与 Esc；场景按钮文案与 reset；表情深链；语言切换；主题切换；英文抽屉；文档 9 节与实时骨架；20 次切换后 0 interval；375px 四页不溢出；键盘焦点可见 | 已确认 | `browser-check.mjs:41-604`（每项一个 `ok()`） |

## 7. 不可随意改变（红线）

1. **`vite base` 必须随命令切换**：build 时 `/emoji-tot/`，dev 时 `/`（`vite.config.ts:15`）。GitHub Pages 从子路径提供站点，改错即全站 404；`docs/ARCHITECTURE.md:123` 把这条写进了架构说明。
2. **站点不得引入外部资源**：CSP 已是 `default-src 'self'`（`index.html:5-8`），`og.png` 是唯一图片资产（`apps/gallery/public/og.png`）。加 CDN 字体/脚本必须同时改 CSP、README 的「零图片资源」说法与 `docs/PRIVACY.md`。
3. **localStorage 键名是用户数据 ABI**：`es.look.v3`/`es.lang`/`es.mono`/`es.stage.size`/`es.motion.paused`。改键 = 已保存的偏好全部丢失；改 `look` 结构要升 `v4` 并保留读旧值的分支（现有 `v3` 后缀就是为此存在，`store.ts:39`）。
4. **两条深链契约**：`#/console?state=<state>`（表情馆灯箱按钮在用它，`wall.ts:141`）与 `#/docs?section=<id>`（`SECTION_IDS` 的顺序与 id 可被外部链接引用，`docs.ts:40-50`）。
5. **视图必须实现干净 dispose**：定时器、`IntersectionObserver`、runtime、`document` 级 `keydown` 都要清。browser-check 以「20 次路由切换后 0 个 interval」为门槛（`browser-check.mjs:539-546`），任何新视图漏一个定时器就是这条闸门变红。
6. **灯箱的焦点契约**：`dialog` 换内容后焦点必须仍在 top-layer 内，Esc 必须还焦点给触发元素（`wall.ts:197-228`）。这条是键盘可用性的最低线，不许为了动画简化掉。
7. **表情馆网格必须同步重建**：验收脚本在同一次任务里读 tile 数量，所以过滤动画用「覆盖一层 ghost 淡出」而不是 View Transition（`wall.ts:14-19,351-381`）。改回异步过渡会让计数读到旧值。
8. **文档页所有数字必须来自代码**：节数、角色数、表情数、设置页数都从模块读（`docs.ts:384-387,342`）；`<!--facts:*-->` 区间由 `docs:check` 校验，人写的过期说法由 `docs-consistency` 黑名单拦（`docs-consistency.mjs:36-83`）。
9. **证书与密码只走环境变量**，绝不入库（`docs/SIGNING.md:73-75`；`sign-release-files.mjs:12-29`）。当前用的自签证书私钥只在当前用户证书库。
10. **版本号只走「三段 + 生成第四段」**：不要手工把四段写进 `package.json`（`build-info-lib.mjs:5-8` 会抛错；规则见 `docs/RELEASING.md:18-26`）。
11. **产物文件名是被断言的字符串**：`EmojiTot.Setup.exe`/`EmojiTot.Portable.exe` 同时被 electron-builder 配置（`apps/desktop/package.json:50,66`）、README 下载链接和 `docs-consistency.mjs:36-41` 依赖，改一个要一起改。
12. **已发布 tag 与当前产物不得清理**：`release/` 里当前版本的四件东西（Setup / Setup.blockmap / Portable / win-unpacked）要保留，旧版产物才可清（`docs/RELEASING.md:48`）。
13. **`docs/baseline/*.md` 不受 `docs:check` 保护**：`sync-docs.mjs:29-37` 的 DOCS 列表里没有它。本文件里出现的数字改代码时要手动同步，不要指望 CI 报错。

## 8. 已知缺口与风险

1. **站点没有单元测试**：`apps/gallery/package.json:6-10` 只有 `dev`/`build`/`preview`，`pnpm -r test` 不会跑它；全部验收压在 `browser-check.mjs`（真 Chrome）上。没装 Chrome 的机器上 `pnpm check:gallery` 会「SKIP + exit 0」（`browser-check.mjs:32-36`），本地绿色可能只是跳过。
2. **死代码：`apps/gallery/src/sessions.ts`**。`DEMO_SESSIONS` 全仓无导入点（grep 只命中定义），scene.ts 自带 `SESSIONS`（`scene.ts:27`）。推断：已废弃，可删。
3. **死字典键**：`i18n.ts` 里至少 18 个键零消费 —— `console.cast`、`console.shape`、`console.color`、`console.state`、`console.code`、`console.noParams`、`console.runtime.state`、`console.snippet`、`console.genome`、`wall.hover.motion`、`wall.hover.motionShort`、`scene.title`、`scene.showing`、`scene.error`、`scene.done`、`scene.reset`、`nav.language`、`docs.tableGroup`。推断：历史残留。
4. **死导出**：`zh.ts` 的 `SHAPE_ZH`、`FINISH_ZH`、`zh()` 无导入点（`drawer.ts:15` 只取 `BACKGROUND_ZH`，颜色走 `COLOR_ZH`）。推断：残留。
5. **样式表有两个入口**：`index.html:12` 的 `<link rel="stylesheet" href="/src/style.css">` 与 `main.ts:16` 的 `import './style.css'` 指向同一份文件；构建后合并为一份 CSS（`apps/gallery/dist/assets/` 只有一个 css），但分叉时容易只改一处。未验证能否安全去掉其一。
6. **GitHub Pages 部署不可复现**：`gh-pages@^6.3.0` 只出现在 root devDependencies（`package.json:37`），全仓无调用点、无 workflow；`docs/ARCHITECTURE.md:123` 只有一句「推到 gh-pages」。推断：发布是手工的，本文件给不出可执行命令（未验证）。
7. **`pnpm version:check` 现在必然失败**：最新 tag 是 `v0.8.20.26`（`git describe --tags --abbrev=0 --match v*`），`apps/desktop/build-info.json` 的 `buildVersion` 也是 `0.8.20.26`，而 `check-version.mjs:42-45` 要求严格大于 tag。这是「先 bump 再 check」的顺序要求，不是脚本错；但如果有人把它当发布前最后一步跑，会误以为版本没 bump。（未执行该命令验证输出。）
8. **release notes 落后于 tag**：`docs/RELEASE-NOTES.md` 最新节是 `0.8.20.18`（第 7 行），tag 已到 `0.8.20.26`，`0.8.20.19`–`.26` 无条目。推断：下一次 `version:check` 到 `0.8.20.27` 时会因缺条目失败（`check-version.mjs:47-55` 要求 1 或 3 条）。是否有意省略未验证。
9. **没有 `latest.yml`，也没有 electron-updater**：`release/` 里只有 `EmojiTot.Setup.exe`、`EmojiTot.Setup.exe.blockmap`、`EmojiTot.Portable.exe`、`win-unpacked/`、`builder-debug.yml`、`.icon-ico/`、`.launcher/`。更新提示走 GitHub Releases API（`update-check.js:8-11`，6 小时间隔），不自动下载、不静默安装。将来若接 electron-updater，这条链要重新设计。
10. **`ui:audit` / `capture:ui` 不在任何自动闸门里**：`pnpm check` 不含它们，`ci.yml` 只有两个 job 也不含。两者都依赖本机已安装版 exe（`ui-audit.mjs:28-31`）和 Electron 二进制，属于人工闸门；其产出 `.ui-capture/` 已被 gitignore（`.gitignore:21`），所以只有 `design-qa.md:39-43` 这类文档记录能证明跑过。
11. **真实签名状态未验证**：无证书时签名被跳过（只 warn），本文件无法断言 `release/EmojiTot.Setup.exe` 与 `EmojiTot.Portable.exe` 当前是否已签、是否 `Valid`。核对方法见 `docs/SIGNING.md:62-71`（`Get-AuthenticodeSignature`）。
12. **Windows-only 打包链**：`after-pack.mjs:8` 对非 win32 直接 return；`window-smoke.mjs` 收尾用 `taskkill`；完整性级别用 `icacls`。是否存在 Linux/macOS 打包目标未验证 —— 现有配置只有一个 `win` 目标（`apps/desktop/package.json:68-74`），且 `docs/PRIVACY.md:11` 明说「只发布 Windows 版」。
13. **facts 覆盖面小于 FACTS 项数**：`docs` 实际引用 10 类 key（version、cast、faceStates、bodies、colors、traits、eyeStyles、mouthStyles、islandPages、settingsPages），而 `FACTS` 有 20 项（`facts.mjs:68-92`）；`sitePages`、`sceneHerd`、`protocolIds`、`segments` 等无人引用。未验证是否有意保留。
14. **「零网络请求」只是 grep 结论**：`apps/gallery/src` 内无 `fetch`/`XMLHttpRequest`/`WebSocket`/`sendBeacon`，但没有任何断言守住它；CSP 的 `connect-src 'self'`（`index.html:7`）同样无测试。加一个分析脚本或 CSP 报错用例可以把这两条变成可验证的。
15. **站点与桌面共用 schema 的耦合是隐式的**：`vite.config.ts:12` 直接指向 `../desktop/src/shared/schema.js`，桌面端移动或改名这个文件会同时打断站点构建与 `facts.mjs`（`facts.mjs:13`）和 `docs-consistency.mjs`（第 11 行）。未验证是否有 CI 之外的守护。
16. **两个无调用点的脚本**：`apps/desktop/scripts/copy-protocol.mjs` 做的事已被 `copy-vendor.mjs` 完全覆盖，且全仓没有任何引用点（grep `copy-protocol` 零命中，npm scripts 里也没有）；`apps/desktop/scripts/ui-check.mjs` 需要手起的 `--dev` 调试端口和 `mouse.ps1`，同样零引用点，而同类行为（沙箱、preload、窗口尺寸）已由 `window-smoke.mjs` 断言。推断：两者都已废弃，删前建议确认没有仓库外的习惯用法。
17. **生成的审计矩阵里有一段手写结论**：`docs/SETTINGS-AUDIT.md` 的「这一轮修掉的假开关」整段是 `settings-audit.mjs:136-154` 里的字面量，不随 schema 变化；将来新增的修复不会自动进这段，读的人容易以为矩阵已覆盖。
18. **`docs:check` 在写本文件时是红的**：`docs/ARCHITECTURE.md:19` 的 `settingsPages` 标记写着 15，但 `SETTINGS_NAV` 是 6+4+6 = 16 页（`apps/desktop/src/shared/schema.js:62-105`）；两个 README 的下载块指向 `v0.8.20.18`（`README.md:42-43`），当前产物版本是 `0.8.20.26`。所以 `pnpm check` 现在过不了（`docs:check` 这道必红）。原因推断：0.8.20.19 之后没有跑过 `pnpm docs:sync`（同步时会用 build-info 覆盖下载块版本）。
19. **隐私扫描有两类天然盲区**：文本规则看不到图片内容（靠 `docs/screenshots/.reviewed` 人工登记，`scan-sensitive.mjs:158-195`），WARN（大图、真实 commit 作者邮箱）不阻断（`:236-245`）。`pnpm scan` 通过只代表「文本干净 + 桌面级截图都登记过」，不代表产物可以发布。
