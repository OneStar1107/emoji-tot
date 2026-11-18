# 参考与依赖调研 / Research

阶段 0 的结论：**哪些现成、能不能用、我们怎么用**。

## 1. 用户给的三个参考仓库

| 仓库 | 许可证 | 结论 |
| --- | --- | --- |
| `Aithena/emotion-ball` | README 标 dual-license，LICENSE 取不到 | 只看能力清单（陈列墙/画册/设置抽屉/双语），不取代码 |
| `dreamcall520/emotion-ball-desktop-pet` | **仅学习研究，禁止商用** | 只看交互清单（贴边、额度卡、便签），不取代码 |
| `sam70361/aora-bot` | 取不到（可能私有） | 待确认，暂不参考 |

## 2. 搜到的可复用 MIT 项目

| 项目 | 星 | 许可证 | 覆盖 | 采用方式 |
| --- | --- | --- | --- | --- |
| `goprocker/Islet` | 8 | MIT | 灵动岛窗口、SMTC 音乐、天气、番茄钟、置物架、日历、额度、粘贴板、通知 | **参考架构与窗口/桥方案，自己重写**；不引整包 |
| `rud1x/Istel` | 12 | MIT | Windows 岛 overlay（React） | 参考交互，不引 |
| `a961282799-crypto/dsh-island` | 8 | MIT | DSH 岛插件 | 参考协议桥，不引 |
| `mrcrapto/toki` | 4 | MIT | 屏幕边缘 notch | 参考贴边，不引 |
| `sebhildebrandt/systeminformation` | 3.1k | MIT | 电量/系统信息 | 阶段 2 可选依赖；阶段 1 先用 PowerShell |
| `postalsys/imapflow` | — | MIT（npm） | IMAP | 阶段 3 引入依赖 |
| Open-Meteo | — | 公开 API | 天气 | 直接调用，无需 key |

## 3. 关键技术结论

1. **音乐 = PowerShell + WinRT SMTC**。Islet 的 `media.ps1` 证明可行：`GlobalSystemMediaTransportControlsSessionManager` 读标题/艺人/封面/进度，`TryTogglePlayPauseAsync` 控制。比原生模块省掉编译链，打包无 ABI 风险。我们重写为 `src/main/services/media.ps1`。
2. **岛展开 = 渲染层 ResizeObserver → 主进程 setBounds**。CSS 决定内容尺寸，窗口跟随；不要在主进程里硬编码动画曲线，否则内容与窗口不同步。
3. **点击穿透 = setIgnoreMouseEvents + 轮询光标**。Electron 的 `forward: true` 在 Windows 上不保证转发 mousemove（本项目球窗口已踩过），所以主进程轮询光标判断是否在岛矩形内。
4. **天气 = Open-Meteo 两步**：`geocoding-api.open-meteo.com/v1/search` 拿经纬度，`api.open-meteo.com/v1/forecast` 拿当前 + 7 日。
5. **电量 = PowerShell `Get-CimInstance Win32_Battery`**，字段 `EstimatedChargeRemaining` / `BatteryStatus`（2 = 充电中）。无电池设备返回空数组 → 界面自动隐藏。

## 4. 不采用

- `electron-notifikations` 一类需要原生编译的包：打包 ABI 风险。
- 任何 GPL / 禁止商用代码：与项目 MIT 冲突。
- 整包复制 Islet：品牌、UI、状态机全不同，抄进来反而更贵。
