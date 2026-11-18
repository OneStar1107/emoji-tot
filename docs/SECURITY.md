# 安全与隐私加固记录

这次加固的范围、做法，以及依赖审计的前后对比。隐私的**行为**细节（存什么、存多久、怎么删）在 [PRIVACY.md](PRIVACY.md)，这里只记工程状态。

## 1. 依赖审计：前后对比

审计命令（本机 registry 是 npmmirror，它不实现 audit 端点，所以要显式指官方源）：

```bash
pnpm audit --registry=https://registry.npmjs.org
```

| | 升级前 | 升级后 |
| --- | --- | --- |
| 漏洞总数 | 70 | **1** |
| critical | 3 | **0** |
| high | 25 | **0** |
| moderate | 33 | 1 |
| low | 9 | 0 |

唯一剩下的 moderate 是 minimatch（GHSA-g3hv-75wg-m249），路径为 apps/desktop → electron-builder → app-builder-lib → minimatch。它只在**打包时**参与文件匹配，不进安装包、不在运行时加载，因此不属于「高危运行时依赖告警」。

### 版本变化

| 包 | 之前 | 之后 | 为什么 |
| --- | --- | --- | --- |
| electron | 33.4.11 | **45.3.4** | 25 个 high 里最严的一条要求 >=42.11.16（GHSA-jr5w-w6x2-84p9 等），33 已不在任何补丁线上 |
| electron-builder | 25.1.8 | **26.18.0** | 与 Electron 45 的打包流程对齐 |
| vite | 6.4.6 | **8.3.8** | 旧版的 esbuild 传递依赖有告警 |
| vitest | 3.2.7 | **5.1.1** | 同上，测试栈一起升级 |
| engines.node（根） | >=20.0.0 | **>=22.12.0** | 上面三者的最低要求 |
| CI node-version | 20 | **22** | 同一条约束 |

升级引入了 electron-winstaller（electron-builder 26 的 Windows 打包依赖），它的安装脚本只下载 7-Zip，已加入 pnpm-workspace.yaml 的 allowBuilds。

## 2. 渲染进程沙箱

三个窗口（球、岛、设置）全部 `sandbox: true`。三个 preload 只用到 contextBridge、ipcRenderer、webUtils，都是沙箱内可用的 API，所以没有功能损失。

回归保护：`apps/desktop/test/security.test.mjs` 逐文件断言 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`，并断言源码里不再出现裸的 `ipcMain.handle/on`。

## 3. IPC 校验层

新增 `src/main/ipc-guard.js` + `src/main/ipc-shape.js`。所有 36 个渲染进程到主进程的调用都经过 `guardedHandle` / `guardedSend`，检查三项：

1. **发送者**：webContents id 必须登记过角色，且 frame URL 必须是对应的本地 html。登记发生在 `loadFile` 之前。
2. **大小**：默认 64 KB；`local:do` 的 addBuffer 单独放宽到 8 MB。`byteSize` 认字符串、数组、ArrayBuffer 和 TypedArray，并对自引用对象设深度上限。
3. **形状**：每个通道声明自己接受的字段。`mail:do` / `calendar:do` / `quota:do` 用 `actionPayload([...])` 的闭集；`local:do` 用服务→动作的白名单；`island:box` 的宽高必须是 1..10000 的有限数；`drag:start` 的坐标必须是有限数。

不符合的消息返回 null，不抛异常——一个已经卸载的页面不该在主进程制造 unhandled rejection。

特别收紧的四个：

- `settings:patch`：32 KB 上限，必须是普通对象；未知键由 schema 的 filterPatch 丢弃。
- `local:do`：服务与动作双白名单，addBuffer 要求 name 是 1..255 字符的字符串。
- `mail:do` / `calendar:do`：动作闭集，data 必须是对象。
- `island:box`：非正数或超限直接拒绝，避免窗口被设成 0×0 后不可见。

## 4. 导航、新窗口、权限

在 `app.on("web-contents-created")` 里统一挂：

- `setWindowOpenHandler` → 一律 deny。
- `will-navigate` → 只允许 file:// 下的本地页面，其余 preventDefault 并记一条日志。
- `will-attach-webview` → preventDefault。

`session.defaultSession` 上挂 `setPermissionRequestHandler`（一律 false）、`setPermissionCheckHandler`（一律 false）、`setDevicePermissionHandler`（一律 false）。应用不需要摄像头、麦克风、定位、通知中继或 Chromium 层面的剪贴板读取权限——剪贴板和通知都在主进程里做。

## 5. 注入面

页面里所有来自外部的字符串都走 escapeHtml：媒体标题/艺人、邮件主题、日历标题与地点、待办文本、剪贴板条目、置物架文件名、设备名。这次补上的是天气页——`now.text`、`weather.place.name`、`place.country` 之前直接插进 innerHTML，而地点名来自地理编码服务。湿度与风速改成 Number() 归一。

回归保护：测试断言天气描述与地点必须被 escapeHtml 包裹。

## 6. Gallery CSP

`apps/gallery/index.html` 加了 meta CSP：

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self';
object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

style-src 保留 unsafe-inline 是因为 Vite 在开发模式下注入内联样式；生产构建的 CSS 是独立文件。script-src 没有 unsafe-inline，这是最要紧的一条。

## 7. 敏感数据存储

日历订阅 URL 改为通过 safeStorage 加密后写入 cache-calendar.json（此前是明文）。内存里保持明文供请求使用，磁盘上是 v1: 密文。旧版本写入的明文值在读取时按原样接受，升级不会丢订阅。

邮箱授权码与 AI Key 原本就走 secrets.js（safeStorage）。secrets.bin 的前缀规则与「plain: 意味着没有可用钥匙串」这一点写进了 PRIVACY.md。

## 8. 剪贴板历史

默认关闭（shelf.clipboard 从 true 改 false）。关闭时 `clipboardHistory.stop()` 调 `clearUnpinned()`，清掉未固定条目；固定条目保留，由设置页的「清除全部记录」按钮连同固定项一起删除。设置页的开关文案写明了这个区别。

## 9. 仍未做 / 需要注意

- **Electron 33 → 45 跨 12 个大版本，本次只验证了构建与单测，没有在真窗口里点过一遍。** 升级前后窗口行为（贴边、穿透、灵动岛展开、托盘）需要人工冒烟。建议按 README 的「验证」表逐条过。
- 桌面端三个 html 还没有 CSP（本次只按要求给 Gallery 加了）。补的话要先确认页面没有内联 script。
- 主进程绕过系统代理直连是刻意行为（见 PRIVACY.md），如果将来要支持企业代理，这里需要重新设计。
- 剩下的 minimatch moderate 只能等 electron-builder 上游更新；它不在运行时链路上。
