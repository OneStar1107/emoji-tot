# 设置中心审计矩阵

> 本文件由 `pnpm settings:audit` 从 `apps/desktop/src/shared/schema.js` 生成，不要手改。
> CI 跑 `pnpm settings:audit --check`，矩阵与代码不一致会失败。

## 三份 manifest

### 页面（岛上展开后的左右翻页）

| key | 标题 | 副标题 | 后台服务 | 默认 |
| --- | --- | --- | --- | --- |
| `music` | 音乐 | 系统正在播放 | `media` | 开 |
| `weather` | 天气 | 当地与七日 | `weather` | 开 |
| `quota` | AI 额度 | 余额与账号 | `quota` | 开 |
| `mail` | 邮箱 | 摘要与验证码 | `mail` | 开 |
| `focus` | 专注 | 番茄钟与休息 | `focus` | 开 |
| `todo` | 待办 | 清单与到期 | `todo` | 开 |
| `health` | 健康 | 喝水与久坐 | `health` | 开 |
| `shelf` | 置物架 | 临时收纳 | `clipboard` | 开 |
| `devices` | 设备 | 蓝牙与电量 | `devices` | 关 |
| `calendar` | 日程 | 月历与邀请 | `calendar` | 开 |

### 状态组件（收起时仍在胶囊里）

| key | 名称 | 依赖服务 | 默认 |
| --- | --- | --- | --- |
| `battery` | 电量 | `battery` | 开 |
| `clock` | 时间 | 无 | 开 |
| `weather` | 温度 | `weather` | 开 |
| `quota` | 余额 | `quota` | 关 |

## 服务计划

默认配置下运行的服务：`battery`、`calendar`、`mail`、`media`、`quota`、`todo`、`weather`。

规则：页面开 = 服务跑；页面关 = 服务停。例外只有一条——胶囊里的状态组件还要用的服务保留
（关掉天气页但胶囊仍显示温度时，`weather` 继续跑）。另有功能级开关独立于页面：
`focus.enabled`、`health.enabled`、`todo.enabled`、`shelf.enabled`、`shelf.clipboard`。

## 审计矩阵

| preference path | 默认值 | 设置页 | 消费进程 | 消费位置 | 生效 | 说明 | 覆盖测试 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `form` | `island` | 常规 | 主进程 | `main.js applyForm()` | 即时 | 岛 / 球 / 双形态 | has a SERVICE_PLAN entry · lists every path |
| `formBoth` | `false` | 常规 | 主进程 | `main.js applyForm()` | 即时 | 两种形态同时显示 | has a SERVICE_PLAN entry · lists every path |
| `launchAtLogin` | `false` | 常规 | 主进程 | `main/settings.js app.setLoginItemSettings` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `cast` | `tot` | 常规 | 主进程 | `main.js setCast() · island:cast · cast:changed` | 即时 | 当前角色 | has a SERVICE_PLAN entry · lists every path |
| `position` | `null` | 常规 | 主进程 | `main.js createWindow() / savePrefs()` | 即时 | 非控件：球拖拽后自动写入 | has a SERVICE_PLAN entry · lists every path |
| `theme` | `dark` | 外观 | 渲染进程 | `island.js resolveTheme() · settings.js applyChrome()` | 即时 |  | lists every path · writes dotted keys through setPath |
| `skin` | `frost` | 外观 | 渲染进程 | `island.js applyPrefs() → body[data-skin]` | 即时 |  | lists every path · writes dotted keys through setPath |
| `blur` | `true` | 外观 | 渲染进程 | `island.js applyPrefs() → body[data-blur]` | 即时 |  | lists every path · writes dotted keys through setPath |
| `uiScale` | `100` | 外观 | 渲染进程 | `island.js --ui-scale · settings.js zoom` | 即时 |  | lists every path · writes dotted keys through setPath |
| `radius` | `22` | 外观 | 渲染进程 | `island.js --radius` | 即时 |  | lists every path · writes dotted keys through setPath |
| `font` | `system` | 外观 | 渲染进程 | `island.js --ui-font` | 即时 |  | lists every path · writes dotted keys through setPath |
| `weight` | `400` | 外观 | 渲染进程 | `island.js --ui-weight` | 即时 |  | lists every path · writes dotted keys through setPath |
| `fontSize` | `0` | 外观 | 渲染进程 | `island.js --ui-size` | 即时 |  | lists every path · writes dotted keys through setPath |
| `motion` | `true` | 外观 | 渲染进程 | `island.js applyPrefs() → body[data-motion]` | 即时 |  | lists every path · writes dotted keys through setPath |
| `reduceMotion` | `false` | 外观 | 渲染进程 | `island.js applyPrefs() → body[data-reduce-motion]` | 即时 | 关掉呼吸与跳动，保留状态变化 | lists every path · writes dotted keys through setPath |
| `islandWidth` | `420` | 尺寸与位置 | 渲染进程 | `island.js --island-w` | 即时 |  | lists every path · writes dotted keys through setPath |
| `pillHeight` | `34` | 尺寸与位置 | 渲染进程 | `island.js --pill-h` | 即时 |  | lists every path · writes dotted keys through setPath |
| `sizeKey` | `md` | 尺寸与位置 | 主进程 | `main.js createWindow() SIZES[sizeKey]` | 重启后 | 改尺寸需要重开球窗口 | has a SERVICE_PLAN entry · lists every path |
| `pinned` | `true` | 尺寸与位置 | 主进程 | `main.js createWindow() alwaysOnTop · applyMainPrefs()` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `clickThrough` | `true` | 尺寸与位置 | 主进程 | `main/island.js · main.js setIgnoreMouseEvents` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `displayId` | `null` | 尺寸与位置 | 主进程 | `main/island.js place()` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `avoidTopBar` | `true` | 外观 | 主进程 | `main/island.js place()` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `oledShift` | `false` | 外观 | 主进程 | `main/island.js startOledShift()` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `timeFormat` | `24h` | 外观 | 渲染进程 | `island.js applyPrefs() → timeFormat24` | 即时 |  | lists every path · writes dotted keys through setPath |
| `hideFullscreen` | `true` | 隐藏与交互 | 主进程 | `main.js applyMainPrefs() fullscreen.start/stop` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `trayIcon` | `true` | 隐藏与交互 | 主进程 | `main.js createTray()` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `hotkey` | `true` | 隐藏与交互 | 主进程 | `main.js applyMainPrefs() globalShortcut` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `wheelPaging` | `true` | 隐藏与交互 | 渲染进程 | `island.js wheel handler` | 即时 |  | lists every path · writes dotted keys through setPath |
| `blurCollapse` | `true` | 隐藏与交互 | 渲染进程 | `island.js blur handler` | 即时 |  | lists every path · writes dotted keys through setPath |
| `hoverOpenDelay` | `100` | 隐藏与交互 | 渲染进程 | `island.js hover watcher` | 即时 |  | lists every path · writes dotted keys through setPath |
| `hoverCloseDelay` | `120` | 隐藏与交互 | 渲染进程 | `island.js hover watcher` | 即时 |  | lists every path · writes dotted keys through setPath |
| `hoverAutoHide` | `true` | 隐藏与交互 | 渲染进程 | `island.js hover watcher` | 即时 |  | lists every path · writes dotted keys through setPath |
| `statusItems` | `[battery, clock, weather]` | 页面管理 | 渲染进程 | `island.js enabledStatusKeys → renderPillStatus()` | 即时 |  | draws every status item |
| `pages` | 9/10 项开 | 页面管理 | 主进程 | `main.js applyServicePlan() · island.js enabledPages()` | 即时 | 同时控制渲染入口与后台服务 | pages drive services |
| `pageOrder` | `[music, weather, quota, mail, focus, todo, health, shelf, devices, calendar]` | 页面管理 | 渲染进程 | `island.js enabledPages()` | 即时 |  | pages drive services |
| `defaultPage` | `music` | 页面管理 | 渲染进程 | `island.js initial page selection` | 重启后 | 下次打开生效 | lists every path · writes dotted keys through setPath |
| `weather.city` | `香港` | 天气 | 主进程 | `main.js refreshWeather()` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `weather.unit` | `c` | 天气 | 渲染进程 | `island.js renderPillStatus() / weather card` | 即时 |  | lists every path · writes dotted keys through setPath |
| `weather.intervalMin` | `15` | 天气 | 主进程 | `main.js scheduleWeather()` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `weather.autoLocate` | `false` | 天气 | 主进程 | `main.js refreshWeather()` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `music.lyrics` | `true` | 音乐与歌词 | 渲染进程 | `island.js music page` | 即时 |  | lists every path · writes dotted keys through setPath |
| `music.islandLyrics` | `true` | 音乐与歌词 | 渲染进程 | `island.js renderPillStatus()` | 即时 |  | lists every path · writes dotted keys through setPath |
| `music.offset` | `0.35` | 音乐与歌词 | 渲染进程 | `island.js lyric sync` | 即时 |  | lists every path · writes dotted keys through setPath |
| `focus.work` | `25` | 专注与饮水 | 主进程 | `services/focus.js prefs().work` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `focus.rest` | `5` | 专注与饮水 | 主进程 | `services/focus.js prefs().rest` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `focus.enabled` | `false` | 专注与饮水 | 主进程 | `services/focus.js prefs().enabled` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `health.waterMin` | `45` | 专注与饮水 | 主进程 | `services/health.js` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `health.standMin` | `60` | 专注与饮水 | 主进程 | `services/health.js` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `health.enabled` | `false` | 专注与饮水 | 主进程 | `services/health.js` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `todo.enabled` | `true` | 待办与置物 | 主进程 | `services/todo.js` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `todo.notify` | `true` | 待办与置物 | 主进程 | `services/todo.js` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `shelf.enabled` | `true` | 待办与置物 | 渲染进程 | `island.js shelf page` | 即时 |  | lists every path · writes dotted keys through setPath |
| `shelf.dir` | （空） | 待办与置物 | 主进程 | `services/shelf.js dir()` | 即时 | 留空用默认的资料库/shelf | has a SERVICE_PLAN entry · lists every path |
| `shelf.clipboard` | `false` | 待办与置物 | 主进程 | `main.js applyServicePlan() clipboardHistory` | 即时 | 默认关；关闭时清掉未固定条目 | has a SERVICE_PLAN entry · lists every path |
| `calendar.leadMin` | `10` | 通知、邮箱与日程 | 主进程 | `services/calendar.js lead time` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `calendar.fromMail` | `true` | 通知、邮箱与日程 | 主进程 | `services/calendar.js ics import` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `quota.provider` | `deepseek` | AI 额度 | 渲染进程 | `settings.js add-account form default` | 即时 |  | lists every path · writes dotted keys through setPath |
| `quota.intervalMin` | `15` | AI 额度 | 主进程 | `services/quota.js reschedule` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `quota.alert` | `true` | AI 额度 | 主进程 | `services/quota.js low-balance check` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `quota.threshold` | `5` | AI 额度 | 主进程 | `services/quota.js low-balance check` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `notify.system` | `true` | 通知、邮箱与日程 | 主进程 | `services/notify.js` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `notify.body` | `true` | 通知、邮箱与日程 | 主进程 | `services/notify.js` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `messenger.wechat` | `true` | 通知、邮箱与日程 | 主进程 | `services/messenger.js` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `messenger.qq` | `true` | 通知、邮箱与日程 | 主进程 | `services/messenger.js` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `messenger.wecom` | `true` | 通知、邮箱与日程 | 主进程 | `services/messenger.js` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `messenger.feishu` | `true` | 通知、邮箱与日程 | 主进程 | `services/messenger.js` | 即时 |  | has a SERVICE_PLAN entry · lists every path |
| `messenger.dingtalk` | `true` | 通知、邮箱与日程 | 主进程 | `services/messenger.js` | 即时 |  | has a SERVICE_PLAN entry · lists every path |

## 这一轮修掉的假开关

- **所有分组开关写入的是字面量键。** `focus.enabled` 被写成 `prefs["focus.enabled"]` 而不是
  `prefs.focus.enabled`，读的时候永远读不到，所以 18 个分组开关（专注、健康、待办、置物、
  剪贴板、通知、消息应用、音乐、额度阈值、天气单位…）全部是"点了没反应"。现在统一走 `setPath`。
- **`reduceMotion` 没有任何消费者。** 现在落到 `body[data-reduce-motion]`，CSS 把循环动画的
  迭代次数压到 1，一次性过渡保留。
- **`shelf.dir` 改不了目录。** 目录原本硬编码，现在读偏好；相对路径落在应用数据目录内。
- **`shelf.clipboard` 没有任何消费者。** 剪贴板服务原本无条件运行，现在随开关启停。
- **胶囊的 `quota` 状态组件没有渲染器。** 现在绘制余额；`volume` 需要系统音量读取，成本不划算，
  直接从 manifest 删除。
- **`pinned` / `sizeKey` / `oledShift` / `weatherAutoLocate` 不在默认值里。** `pinned` 由主进程
  默认置顶，界面却显示为关——开关和现实相反。现在都有默认值。
- **`devices` 页在设置里不可达。** 岛上画得出来，设置的页面表里没有这一行。两份表合成一份。
- **页面关了服务照跑。** `startServices` 无条件启动全部 11 个服务。现在由 `applyServicePlan()`
  按 manifest 差异启停，偏好一改就重算。
- **过期说明。** "阶段 1 只保存偏好""阶段 2 再接""阶段 3 上线"共 6 处，全部删除——这些功能
  早就在跑了。
