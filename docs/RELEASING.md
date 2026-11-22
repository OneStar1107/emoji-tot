# 版本号规则（EmojiTot）

> 2026-11-21 定稿（第二次修订）。用户拍板：大功能不再跳到 0.8.0 这种新 minor，1.0 代表「全部做完」，所以版本要慢。

## 一、四段式：0.<系列>.<大版本>.<小版本>

| 段位 | 什么时候动 | 例子 |
|---|---|---|
| 第 1 段（0） | 永远不动，直到真的 1.0（全部功能完成且调好） | 0 |
| 第 2 段（系列） | 极少动：一整个产品阶段（例如 Agent 生态、主题商店） | 0.6.x → 0.7.0 |
| **第 3 段（大版本）** | **每批大功能 +1** | 0.6.1 → 0.6.2 → … → 0.6.15 |
| **第 4 段（小版本）** | **每次小修 +1**，跟在当前大版本后面 | 0.6.2.1 → 0.6.2.2 |

也就是说：**大功能落款在第三个数字，小修落款在第四个数字**。不因为一批功能就把第三段清成 .0。

## 二、工具链的限制与我们的做法

npm / pnpm / electron-builder 只接受三段 semver（`MAJOR.MINOR.PATCH`），四段会被拒绝。所以：

- `package.json` 的 `version` 永远是**三段**（等于 0.系列.大版本）；
- 第四段由 `scripts/build-info.mjs` 在每次 `pack` / `dist` 前自动生成，写进 electron-builder 的 `buildVersion`，并决定安装包文件名、应用内版本和原生启动器的 FileVersion；tag 与 Release 标题用完整四段；
- 本地构建读取 `apps/desktop/.build-number` 并递增；CI 可用 `EMOJITOT_BUILD_NUMBER` 或 `BUILD_NUMBER` 提供确定值；
- `apps/desktop/build-info.json` 是当前构建的单一身份来源，同时包含版本、构建号、commit 与时间；`core`、`protocol`、`gallery` 的 package version 由构建脚本同步成三段公开版本；
- 应用内「关于」显示完整四段：`package.json.version` + 生成的第四段。

例：`version=0.6.2`、`buildVersion=0.6.2.3`、tag=`v0.6.2.3`、exe FileVersion=`0.6.2.3`。

## 三、发版纪律

1. 一批大功能 → 第三段 +1，第四段归 0（不写第四段就是 .0）。
2. 小修（修 bug、文案、单个样式）→ 只动第四段。
3. 第二段要动，必须是「产品阶段变了」，并在 RELEASE-NOTES 里写清理由。
4. 不允许为了好看把版本号往上跳；用户明确说 1.0 才算完成。
5. `pnpm version:check` 校验：版本必须大于最近 tag；第三段 +1 需要在 `docs/RELEASE-NOTES.md` 该版本下至少 3 条用户可感知条目；第四段 +1 只需 1 条。

## 四、历史

- 0.5.0 → 0.6.0 是规则定稿前的一次 minor 跳升，保留不改写。
