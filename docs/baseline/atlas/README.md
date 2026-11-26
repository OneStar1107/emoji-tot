# EmojiTot 全站工作台

这是 `docs/baseline/` 的可视化版本：把 39 个页面/窗口、113 条功能基准、15 条依赖、8 条业务流、3 项待办改动和 12 条术语放在一张可离线打开的 HTML 里。

## 文件

- `project-atlas.json`：工作台的数据源，结构遵循 project-atlas-guardian 的 schema。
- `project-atlas.html`：自包含单文件（图片已内嵌，无外部请求），双击即可打开，也可在 DSH 侧栏预览。
- `atlas-template.html`：本项目使用的渲染模板副本。相对 Skill 原模板只改了三处：提高 `--muted` / `--amber` 对比度、补上搜索框文字颜色、去掉功能卡里与状态重复的阶段徽章。
- `preview.png` / `atlas-features.png`：工作台首页与「功能基准 + 搜索“更新”」的渲染截图。

## 重新生成

```bash
# 先校验数据源；PASS 后再渲染
python "$DSH_HOME/skills/project-atlas-guardian/scripts/validate_atlas.py" docs/baseline/atlas/project-atlas.json

python "$DSH_HOME/skills/project-atlas-guardian/scripts/render_atlas.py" \
  docs/baseline/atlas/project-atlas.json \
  --template docs/baseline/atlas/atlas-template.html \
  --project-root . \
  --out docs/baseline/atlas/project-atlas.html
```

## 事实来源与边界

- 页面与功能来自 [../README.md](../README.md) 与 [../../FEATURE-BASELINE.md](../../FEATURE-BASELINE.md)，证据是 2026-11-25 的真机闸门结果，不是本次重新跑出来的。
- 截图取自 `docs/screenshots/` 的历史验收图，仅选了 7 张已知为应用自身的图；23 张 WARN 大图没有嵌入。
- 工作台的 `reviewMode: I` 与 `changeDepth: relayout` 描述的是信息呈现方式，不代表要改 EmojiTot 产品界面。
- 本工作台不包含密钥、账号、私有 URL 或本机绝对路径。
