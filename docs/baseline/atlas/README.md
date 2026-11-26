# EmojiTot 全站工作台

EmojiTot 的正式入口是 Skill 内置的实时工作台。它只读取当前项目，按页面、功能、依赖、业务流和术语展示 `docs/baseline/` 的事实，并在项目文件变化后刷新同一份快照。

## 正式打开

在项目根目录运行：

```powershell
.\docs\baseline\atlas\start-workbench.ps1
```

脚本会从已安装的 `project-atlas-guardian` Skill 找到新版工作台，校验项目自有基准、直接扫描、`/api/health` 和 `/snapshot` 是否一致，再打开返回的 `http://127.0.0.1:<端口>/` 地址。它不需要启动数据库，不会修改项目文件，也不会调用 EmojiTot 应用代码。

只检查而不打开浏览器：

```powershell
.\docs\baseline\atlas\start-workbench.ps1 -NoOpen -Json
```

如果 Skill 安装位置不在常见目录，可以用 `-WorkbenchRoot` 指向包含 `scripts\check-workbench-entry.mjs` 的 workbench 目录。

## 文件

- `project-atlas.json`：项目自有权威基准。实时工作台会自动发现并保留其中的页面、功能和依赖，不用把文件复制到项目根目录。
- `start-workbench.ps1`：EmojiTot 的正式启动入口；DSH 任务开始时由 Skill 直接调用同一套新版工作台。
- `project-atlas.html`：旧的静态渲染结果，只作为离线备用和回滚证据；双击打开仍是项目基准的只读快照，但不是实时入口。
- `atlas-template.html`：静态备用页使用的模板副本。相对 Skill 原模板只改了三处：提高 `--muted` / `--amber` 对比度、补上搜索框文字颜色、去掉功能卡里与状态重复的阶段徽章。
- `preview.png` / `atlas-features.png`：上一版静态页的历史截图，不代表新版实时服务。

新版工作台自带的 `web/atlas-project-workbench.html` 不能通过 `file:///` 当作 EmojiTot 实时数据查看；直接打开文件时没有 `/snapshot` 服务，只会显示内置演示数据。正式入口必须使用启动脚本返回的本机 HTTP 地址。

## 更新静态离线副本

实时工作台读取 `project-atlas.json` 后会自动刷新。只有在需要保留离线门禁证据或准备回滚副本时，才重新生成静态 HTML：

```powershell
python "$env:DSH_HOME\skills\project-atlas-guardian\scripts\validate_atlas.py" docs/baseline/atlas/project-atlas.json

python "$env:DSH_HOME\skills\project-atlas-guardian\scripts\render_atlas.py" `
  docs/baseline/atlas/project-atlas.json `
  --template docs/baseline/atlas/atlas-template.html `
  --project-root . `
  --out docs/baseline/atlas/project-atlas.html
```

生成后运行 `node "$env:DSH_HOME\skills\project-atlas-guardian\scripts\inspect_rendered_atlas.mjs"` 做布局检查。静态副本变化时，截图和验收记录也必须一起更新。

## 事实来源与边界

- 页面与功能来自 [../README.md](../README.md) 与 [../../FEATURE-BASELINE.md](../../FEATURE-BASELINE.md)，证据是 2026-11-25 的真机闸门结果，不是本次重新跑出来的。
- 截图取自 `docs/screenshots/` 的历史验收图，仅选了 7 张已知为应用自身的图；23 张 WARN 大图没有嵌入。
- 工作台的 `reviewMode: I` 与 `changeDepth: relayout` 描述的是信息呈现方式，不代表要改 EmojiTot 产品界面。
- 本工作台不包含密钥、账号、私有 URL 或本机绝对路径。
