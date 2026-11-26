# EmojiTot 全站工作台

工作台把 EmojiTot 的页面、功能合同、IPC 链路、数据、依赖和验证证据放在同一张可浏览的图上。
它只读当前项目目录，不启动应用、不写用户数据、不上传任何内容。

## 正式入口（实时）

在项目根目录运行：

```powershell
.\docs\baseline\atlas\start-workbench.ps1
```

脚本会找到已安装的 `project-atlas-guardian` 工作台，校验项目基准、直接扫描、健康接口和实时快照指向同一个项目与同一组数量，然后打开 `http://127.0.0.1:<端口>/`。

只检查、不打开浏览器：

```powershell
.\docs\baseline\atlas\start-workbench.ps1 -NoOpen -Json
```

用完停止本机服务（只杀 `--root` 指向本项目的那个工作台进程）：

```powershell
.\docs\baseline\atlas\stop-workbench.ps1
```

## 事实源与重新生成

- `project-atlas.json`：项目自有权威基准，`node scripts/atlas-build.mjs` 生成。
  人工维护的模块、页面、功能合同、依赖、改动、术语、证据和交接仍写在同一个文件里；
  生成步骤只补齐工作台需要的字段、六层蓝图和统计，不会改变数量（39 页面 / 113 功能 / 15 依赖）。
- 文件必须保持紧凑格式并小于 300 KB：实时工作台的文本读取上限是 320 KB，
  超过上限它会静默退回“纯扫描”，于是人工基准里的功能合同就看不见了。
- `node scripts/atlas-build.mjs --check` 校验基准是否最新；过期会以非零退出码失败。
- `pnpm atlas:build` / `pnpm atlas:check` 是同一组命令的快捷方式。

```powershell
node scripts/atlas-build.mjs
node scripts/atlas-build.mjs --check
```

## 基准里有什么

| 项目 | 数量 | 说明 |
| --- | --- | --- |
| 模块 | 6 | 运行时、灵动岛、设置中心、球/托盘/引导/更新卡、引擎与协议、站点 |
| 页面 | 39 | 窗口、页面、面板、库、流水线都在同一棵页面树里 |
| 功能合同 | 113 | 入口、结果、数据副作用、不能放宽的边界、实现位置 |
| 依赖 | 15 | 偏好 schema、prefs 文件、表情总线、服务、引擎、扫描与 IPC 守门 |
| 术语 | 12 | 每个术语都带可见的 `[解释：……]` |
| 当前待办 | 4 | 更新卡 P0、设置页接线、文档同步、无调用方 IPC |

六层蓝图共 178 个节点：页面/前端 39、功能 17、接口/后端（IPC）91、数据模型 10、依赖/服务 15、验证 6。

## IPC 链路怎么读

EmojiTot 是 Electron 应用，没有 HTTP 后端；它的“接口层”是 IPC 通道
[解释：渲染页面和主进程之间约定好的消息通道；页面不能直接读文件或建窗口，只能通过这些通道请求主进程去做。]
。工作台把每条通道按同一套状态显示：

| 状态 | 含义 | 当前数量 |
| --- | --- | --- |
| 已接通 | preload 暴露了调用方，主进程也登记了处理函数 | 87 |
| 仅主进程 | 主进程有处理函数，但没有任何 preload/渲染层调用 | 4 |
| 仅前端 | 页面会调用，但主进程没有对应处理函数 | 0 |

4 条仅主进程的通道是 `island:visible`、`island:show`、`island:hide`、`island:ready`：
它们在 `apps/desktop/src/main/island.js` 登记了 handler，但没有任何 preload 暴露。
工作台把它们列成待确认项，不自动删除，也不假装它们“已接通”。是否保留要先确认真机用途。

自动扫描（工作台实时服务）统计的是 62 个登记过的 handler、58 条已接通；
项目基准的 91 条 = 这 62 条 + 29 条主进程 → 渲染层的推送通道
[解释：主进程主动发给页面的消息，例如设备列表、歌词或更新状态；方向与调用相反。]
。两套数字不矛盾，分母不同，蓝图里逐条列出。

## 证据截图

- `evidence/workbench-focus-1440.png`：1440 宽、个人镜头“现在这一步”。
- `evidence/workbench-1440-pages.png`：页面树与功能明细。
- `evidence/workbench-1440-baseline.png`：功能基准与筛选。
- `evidence/workbench-blueprint-ipc.png`：技术蓝图，顶部显示 62 接口 / 58 已接通，下方是六层节点。
- `evidence/workbench-1024.png` / `evidence/workbench-320.png`：窄屏与标准宽度，无横向溢出。

截图是工作台界面本身，不包含用户桌面、窗口标题或本机路径。

## 离线副本

需要离线留档时，把实时快照导出到项目外的目录：

```powershell
node "$env:DSH_HOME\skills\project-atlas-guardian\workbench\scripts\export-portable.mjs" --root . --out "$env:TEMP\emojitot-atlas"
```

导出物包含 `PROJECT-ATLAS.md`、`project-atlas.snapshot.json`、自包含 HTML 和触发指南，并会做敏感信息检查。
它内嵌 41 张设计素材，约 13 MB，因此不提交进仓库；仓库只保留唯一事实源
[解释：同一份事实只维护一份，其他展示都从它生成，避免两个版本互相矛盾。]
和上面的验收截图。

## 已知限制

- 工作台“AI 为什么这样判断”面板里的原始计数在合并人工基准前生成，可能显示 34 页面 / 136 功能；页面树和功能基准里是合并后的 39 / 113。两者以左侧导航为准，这是工作台自身待修的地方。
- 工作台左侧导航的序号与说明文字只有 9–10 px，可读性检查会给出“文字小于 11px”的提示；这是 Skill 自带界面，不是 EmojiTot 的产品界面。
- 设计视图识别到 41 个图片/HTML 来源，0 个映射到页面；这些是仓库里的参考素材，不代表已采纳的设计。
- 静态渲染副本（旧 `project-atlas.html` 与模板）已删除，避免出现第二份会过期的事实源；需要留档时用上面的导出命令重新生成。
- 本目录不包含密钥、账号、私有 URL 或本机绝对路径。
