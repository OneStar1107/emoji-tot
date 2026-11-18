# 灵动岛形态 / Island

tot 的第二种形态：贴在屏幕顶部中间的一条胶囊。收起时只有脸和时间；点击展开成一张卡片，横向翻页放功能。

> 一句话：不是 macOS 刘海，也不是一条横贯屏幕的岛 —— 是「顶部居中、按内容长宽、点击展开」的一个 tot。

## 1. 形态与尺寸

| 状态 | 宽 | 高 | 内容 |
| --- | --- | --- | --- |
| 收起 pill | 168–220（按组件算） | 36 | tot 小脸 28px + 组件区（时间/电量/温度/余额）+ 播放指示 |
| 展开面板 | 420 | 按页面 300–380 | 顶栏（脸/标题/电量/时间/齿轮）+ 页面区 + 分页点 |
| 展开 + 通知 | 420 | 按内容最多 460 | 临时插页，3.5s 后回到原页 |

窗口 = 内容尺寸 + 留白（左右 14px、上下 10px，给阴影和悬停放大），主进程按渲染层上报的 box 逐帧 setBounds。

## 2. 位置

- 水平居中于「当前显示屏」的工作区；垂直贴工作区顶部（`y = workArea.y`）。
- 多显示器：跟随设置里选的屏；屏被拔掉时回主屏（`screen.on('display-removed')`）。
- 不占用任务栏、不进 Alt+Tab、不在全屏应用上出现（设置可调）。

## 3. 交互

| 动作 | 结果 |
| --- | --- |
| 左键点 pill | 展开到上次停留的页 |
| 左键点面板外 | 收起（渲染层失焦 + 主进程 blur 兜底） |
| 右键 | 托盘菜单（与球共用一个菜单，只是多「切到球形态」） |
| 横向滚轮 / 底部圆点 | 换页 |
| 悬停 pill 300ms | 轻微放大 1.04，不展开（防误触） |
| 拖拽 pill 横向 | 移动位置（可选，默认关闭） |

缩放：`win.webContents.setZoomFactor(display.scaleFactor)` 风险大，改为 CSS 用 `devicePixelRatio` 自适应，不上 zoomFactor。

## 4. 页面注册表

页面由 `src/shared/pages.js` 声明，设置页只改开关与顺序，岛只按注册表渲染。

| key | 名称 | 阶段 | 数据源 |
| --- | --- | --- | --- |
| `music` | 音乐 | 1（空态）/ 2（SMTC） | PowerShell + WinRT SMTC |
| `weather` | 天气 | 1 | Open-Meteo |
| `quota` | AI 额度 | 1（空态）/ 2 | DeepSeek `/user/balance` |
| `mail` | 邮箱 | 1（空态）/ 3 | IMAP（imapflow） |
| `focus` | 专注 | 2 | 本地计时 |
| `todo` | 待办 | 2 | 本地 JSON |
| `health` | 健康 | 2 | 本地计时 + 通知 |
| `shelf` | 置物架 | 2 | 本地文件拖放 |
| `calendar` | 日程 | 3 | 本地 JSON + ICS 解析 |
| `battery` | 电量 | 1 | PowerShell `Win32_Battery` |

状态组件（常驻 pill，不占页）：电量、时间、温度、余额、音量、日程下一项。顺序可拖。

## 5. 通信

```
renderer(island) --island:box {w,h}--> main  → setBounds 居中
renderer --island:hover bool--------> main  → setIgnoreMouseEvents 兜底
main --island:page {key,data}-------> renderer
main --island:expand bool-----------> renderer
```

尺寸同步用 `ResizeObserver` + `requestAnimationFrame` 节流，每帧最多上报一次；key 相同则不发。

## 6. 与球形态的关系

- 设置项 `form: 'island' | 'ball'`，默认 `island`（用户指定开机默认岛）。
- `formBoth: boolean`，勾选后两种窗口同时存在；同屏时岛贴顶、球贴边，互不抢焦点。
- 托盘菜单永远提供另一个形态的一键切换。
