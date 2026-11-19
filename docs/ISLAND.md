# 灵动岛形态 / Island

tot 的第二种形态：贴在屏幕顶部中间的一条胶囊。收起时只有脸和时间；点击展开成一张卡片，横向翻页放功能。

> 一句话：不是 macOS 刘海，也不是一条横贯屏幕的岛 —— 是「顶部居中、按内容长宽、点击展开」的一个 tot。

## 1. 形态与尺寸

| 状态 | 宽 | 高 | 内容 |
| --- | --- | --- | --- |
| 收起 pill | 168–220（按组件算） | 36 | tot 小脸 28px + 组件区（时间/电量/温度/余额）+ 播放指示 |
| 展开面板 | 420 | 按页面 300–380 | 顶栏（脸/播放标题/电量/时间/齿轮）+ 页面区 + 分页点 |
| 展开 + 通知 | 420 | 按内容最多 460 | 临时插页，3.5s 后回到原页 |

窗口 = 内容尺寸 + 留白（左右 32px、上下 36px，给阴影和悬停放大），主进程按渲染层上报的 box 逐帧 setBounds。

### 顶栏那一行放什么

只放正在播放的标题。页名常驻在头像下面（9px），不再以大字号和媒体标题并排重复；右侧原来那个 96px 的媒体窄槽也取消了，标题直接用整列宽度，超长时内层 span 跑马灯。没有播放时标题行留空，`min-height` 锁住高度，翻页不会跳。

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

页面与状态组件由 `src/shared/schema.js` 声明（`PAGE_MANIFEST` / `STATUS_MANIFEST`），设置页只改开关与顺序，岛只按注册表渲染。关掉一页会同时停掉它的后台服务，除非胶囊里的状态组件还要用。

| key | 名称 | 阶段 | 数据源 |
| --- | --- | --- | --- |
| `music` | 音乐 | 已实现 | PowerShell + WinRT SMTC；歌词 LRCLIB |
| `weather` | 天气 | 已实现 | Open-Meteo（PowerShell 子进程） |
| `quota` | AI 额度 | 已实现 | DeepSeek `/user/balance`，密钥 safeStorage |
| `mail` | 邮箱 | 已实现 | IMAP（imapflow），验证码 + .ics 提取 |
| `focus` | 专注 | 已实现 | 结束时间戳 + 通知 |
| `todo` | 待办 | 已实现 | 本地 JSON，到期提醒一次 |
| `health` | 健康 | 已实现 | 喝水 / 久坐计时 + 通知 |
| `shelf` | 置物架 | 已实现 | 复制式收纳，路径或字节都能收 |
| `calendar` | 日程 | 已实现 | 本地 JSON + ICS 解析 |
| `devices` | 设备 | 已实现 | PowerShell PnP，电量与连接状态 |

状态组件（常驻 pill，不占页）：电量、时间、温度、余额。顺序可拖，可单独开关。

## 5. 通信

```
renderer(island) --island:box {w,h}--> main  → setBounds 居中
renderer --island:hover bool--------> main  → setIgnoreMouseEvents 兜底
main --island:* data---------------> renderer
either window --face:report <state>-> main  → 另一扇窗（face:apply / island:face）：两边表情永远同一张
```

尺寸同步用 `ResizeObserver` + `requestAnimationFrame` 节流，每帧最多上报一次；key 相同则不发。

## 6. 与球形态的关系

- 设置项 `displayMode: 'island' | 'ball' | 'both'`，默认 `island`。它同时决定当前显示和下次启动；同屏时岛贴顶、球贴边，互不抢焦点。
- 旧版 `form` / `formBoth` 在读取时迁移到 `displayMode`，新值存在时优先使用新值。
- 托盘菜单永远提供另一个形态的一键切换。
