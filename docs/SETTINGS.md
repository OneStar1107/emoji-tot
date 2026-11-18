# 设置中心 / Settings

独立窗口，左侧导航 + 右侧分组卡片。信息架构照用户给的「岛仔设置」截图，内容换成 tot 的。窗口 1080×760，可缩放，深色优先、跟随系统。

## 1. 导航与页面

| 分组 | 页面 | 阶段 | 内容 |
| --- | --- | --- | --- |
| 形态 | 常规 | 1 | 主题（跟随/浅/深）、开机启动、默认形态（岛/球/同时）、皮肤、大小、显示屏、位置、避开顶栏 |
| 形态 | 外观 | 1 | 岛风格（毛玻璃/实色/跟随）、模糊强度、字体、字号、动画开关 |
| 形态 | 尺寸与位置 | 1 | 岛宽、球尺寸、边距、贴边比例、多显示器 |
| 行为 | 隐藏与交互 | 1 | 点击穿透、全屏时隐藏、自动避让、托盘图标、快捷键 |
| 行为 | 页面管理 | 1 | 状态组件拖拽排序、功能页开关与排序、默认打开页 |
| 内容 | 音乐与歌词 | 2 | 展开时显示歌词、岛上歌词、时间偏移 |
| 内容 | 专注与饮水 | 2 | 番茄时长/休息时长、喝水间隔、久坐提醒 |
| 内容 | 待办与置物 | 2 | 待办存储位置、置物架目录、到期提醒 |
| 内容 | 通知、邮箱与日程 | 3 | 通知开关、邮箱账号、验证码高亮、日程提前量 |
| 内容 | AI 额度 | 2 | 账号列表、刷新间隔、余额阈值提醒 |
| 内容 | 天气 | 1 | 城市、单位、刷新间隔 |
| 系统 | 插件 | 3 | 预留 |
| 系统 | 关于 | 1 | 版本、检查更新、打开数据目录、许可证 |

## 2. 存储

`%APPDATA%/EmojiTot/prefs.json`（macOS `~/Library/Application Support/EmojiTot/`）。与现有的 `sizeKey / pinned / clickThrough / cast` 合并，不新建文件。

```json
{
  "form": "island",
  "formBoth": false,
  "skin": "frost",
  "blur": true,
  "displayId": null,
  "anchor": "top",
  "islandWidth": 420,
  "avoidTopBar": true,
  "timeFormat": "24h",
  "statusItems": ["battery", "clock", "weather", "quota", "volume"],
  "pages": { "music": true, "weather": true, "quota": true, "mail": true },
  "pageOrder": ["music", "weather", "quota", "mail"],
  "weather": { "city": "香港", "unit": "c" },
  "mail": [],
  "quota": { "provider": "deepseek", "intervalMin": 15 }
}
```

## 3. 交互约定

- 每个开关改动立即写盘 + 通知主进程，不设「保存」按钮。
- 敏感值（邮箱授权码、API key）用 Electron `safeStorage` 加密后存 `secrets.bin`，界面上只显示掩码和「已保存」。
- 空态给一句话 + 一个动作按钮：「还没有添加邮箱 → 添加」。
- 每页标题下不加说明性小作文；一句副标题足够。
