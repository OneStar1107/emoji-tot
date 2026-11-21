# 直播封面覆盖面

岛要画「正在看什么」，就需要封面。这份文档回答一件事：**Windows 上到底拿不拿得到封面，拿不到时我们靠什么兜底。**

结论先说：**封面只在「网页 + MediaSession」这条路上出现。** 本机实测拿到 artwork 的有斗鱼、B 站视频、YouTube（视频页和直播页）、Twitch（给的是主播头像）；SMTC 那条路只给 150px 级的小图——Chrome 转发的是页面 artwork 的缩小版（YouTube 视频 150×83），ego 转发的是视频帧（斗鱼 150×84），都当不了封面。所以封面策略是「能取 artwork 就取，取不到就标题兜底」，不能指望 SMTC。

两条探测脚本都在 `scripts/probes/`，都可以单独跑：

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/probes/smtc-cover.ps1 -Pretty
node scripts/probes/mediasession-cdp.mjs --only douyu
node scripts/probes/mediasession-cdp.mjs --url "https://www.douyu.com/288016" --settle 6000
```

## 一、两条路是什么

| 路 | 读什么 | 谁上报 | 我们能拿到什么 |
| --- | --- | --- | --- |
| SMTC | `GlobalSystemMediaTransportControlsSession` | 应用自己（浏览器代页面转） | 标题、艺人、进度、thumbnail（有没有看应用） |
| 页面 MediaSession | `navigator.mediaSession.metadata` | 网页自己 | 标题、艺人、专辑、artwork 多张（带 sizes） |

SMTC 的 `SourceAppUserModelId`：Win32 程序就是 exe 名（本机实测是 `egolite`，对应安装项「ego (lite)」），UWP 是 `PackageFamilyName!App`。Windows 每个应用只留一条会话，同一应用开多个标签页只报一个。

Chrome/Edge 会把页面的 MediaSession 转进 SMTC，但**转进去的 thumbnail 不一定是 artwork**——下文的实测就是这句话的证据。

## 二、实测 A：SMTC（2026-11-22 00:10，本机）

机器上当时只有一条媒体会话：ego (lite) 浏览器在放斗鱼直播。

```json
{"app":"egolite","title":"斗鱼No.1声优-13点GTA6","artist":"寅子",
 "status":"Playing","playing":true,"position":40602.4,
 "thumb":true,"thumbBytes":24232,"thumbMime":"image/png"}
```

缩略图存下来是 **150×84 PNG，24,232 字节**。打开看，是比赛画面的**视频帧**（赛车镜头），不是斗鱼房间封面。

同一时刻用 CDP 读同一个直播间（`https://www.douyu.com/288016`），页面**是有封面的**：

```json
"metadata": {"title":"【重播】恭喜BFX获得德杯冠军","artist":"英雄联盟赛事"},
"artwork": [{"src":"https://rpic.douyucdn.cn/asrpic/261024/288016_src_2019.avif/dy4",
             "bytes":114470,"mime":"image/jpeg"}]
```

→ **SMTC 有 thumbnail ≠ 有封面**。egolite 转发斗鱼直播时，Windows 拿到的是画面帧（150×84 这种小尺寸），拿它当封面会糊成一块马赛克；Chrome 转发 YouTube 时会换成 artwork 缩小版，但同样只有 150×83（见四·2）。这条实测是「封面必须走标题兜底」的直接依据。

## 三、实测 B：页面 MediaSession（2026-11-22 00:13，Chrome 157 headless，无登录，允许自动播放，停留 5s）

> 这一批跑在**没有 VPN 的直连网络**上，YouTube / Twitch / Spotify 显示 `ERR_CONNECTION_CLOSED`，意思是「这条网络到不了」，不是「没有封面」。VPN 开启后的重测见第四节。

| 站点 | 页面 | MediaSession | metadata 标题 | artwork 张数 | artwork 字节 | 视频在播 |
| --- | --- | --- | --- | --- | --- | --- |
| 哔哩哔哩直播 | live.bilibili.com | 有 | 空 | 0 | 0 | 是 |
| 哔哩哔哩视频 | www.bilibili.com/video/BV1GJ411x7h7 | 有 | **空** | 1 | 3,486（webp 320w，是视频封面） | 是 |
| 斗鱼 | www.douyu.com | 有 | 【小奶团】直播-雀神集市八折门票钻石 | 1 | **472,485**（jpeg） | 是 |
| 斗鱼直播间 | www.douyu.com/288016 | 有 | 【重播】恭喜BFX获得德杯冠军 | 1 | **114,470**（jpeg） | 是 |
| 虎牙 | www.huya.com | 有 | 空 | 0 | 0 | 是 |
| 虎牙直播间 | www.huya.com/660000 | 有 | 空 | 0 | 0 | 是 |
| 抖音直播 | live.douyin.com | 有 | 空 | 0 | 0 | 是 |
| 抖音直播间 | live.douyin.com/866337858407 | 有 | 空 | 0 | 0 | 否（房间无效） |
| 快手直播 | live.kuaishou.com | 有 | 空 | 0 | 0 | 是（27 个 video） |
| B 站直播间 | live.bilibili.com/21452505 | 有 | 空 | 0 | 0 | 是 |
| YouTube | www.youtube.com/watch?v=… | — | — | — | — | **ERR_CONNECTION_CLOSED** |
| Twitch | www.twitch.tv | — | — | — | — | **ERR_CONNECTION_CLOSED** |
| Spotify | open.spotify.com | — | — | — | — | **ERR_CONNECTION_CLOSED** |
| Netflix | www.netflix.com | 有 | 空 | 0 | 0 | 否（首页） |
| Apple Music | music.apple.com | 有 | 空 | 0 | 0 | 否（首页） |
| QQ 音乐 | y.qq.com | 有 | 空 | 0 | 0 | 否（首页） |
| 网易云音乐 | music.163.com | 有 | 空 | 0 | 0 | 否（首页） |
| 酷狗音乐 | www.kugou.com | 有 | 空 | 0 | 0 | 否（首页） |

三条读法：

1. **「有 MediaSession」不等于「有 metadata」**。虎牙、抖音、快手、B 站直播都是 API 在、metadata 空。指望它们上报等于什么都没上报。
2. **斗鱼是这批里唯一全给的**：标题、艺人（主播名）、封面（首页推荐位 472KB、直播间页 114KB）都有。
3. **B 站视频页有 artwork 但标题空**，而且艺术图是视频封面（320w webp），不是播放中的画面 —— 能用，但字段残缺。

## 四、实测 C：VPN 开启后重测（2026-11-22 01:14–01:31）

环境：Windows 本机，Windows 系统代理 `127.0.0.1:7890`（`ProxyEnable=1`），出口显示美国（ipify 报 147.90.235.83，ip-api 报 70.36.125.104，代理出口不固定）。Chrome 157.0.8103.79 headless（直播的 SMTC 用 headful 补了一次）、无登录、允许自动播放、settle 7–26s。Node 侧抓 artwork 也走代理（`NODE_USE_ENV_PROXY=1` + `HTTP_PROXY/HTTPS_PROXY`），否则海外 artwork 的字节数恒为 0。同一时刻不走代理直连，YouTube / Twitch 仍是 `ERR_CONNECTION_CLOSED`、Netflix 403——**可达是 VPN 给的，不是站点变了**。

| 站点 | 页面 | MediaSession | metadata.title / artist | artwork | SMTC | 视频在播 |
| --- | --- | --- | --- | --- | --- | --- |
| YouTube 视频 | watch?v=aqz-KE-bpKQ（Big Buck Bunny） | 有 | Big Buck Bunny 60fps 4K - Official Blender Foundation Short Film / Blender | 1 张，320×180，15,155 B（AVIF，hqdefault） | 150×83 PNG 28,592 B，封面缩小版 | 是（854×480） |
| YouTube 直播 | @LofiGirl/live（当时 4t4AQ15yj1M） | 有 | christmas lofi radio 🎄 cozy ambience to relax to / Lofi Girl | 1 张，320×180，16,101 B（AVIF；同图 JPEG 480×360、19,717 B） | 无会话（已采样，未起播） | 否（paused，0×0） |
| Twitch 频道页 | twitch.tv/ohnepixel | 有 | 🔴[DROPS] GTA 6 FULL PLAYTHROUGH🔴 / ohnePixel | 1 张，150×150 头像，36,989 B PNG | 150×150 PNG 38,382 B，头像 | 是（852×480） |
| Spotify Web | open.spotify.com；track 页 | 有 | 空 | 0 | 未采样（未起播） | 否（需登录） |
| Netflix | www.netflix.com | 有 | 空 | 0 | 未采样（未起播） | 否（首页） |
| Apple Music | music.apple.com；歌曲页 | 有 | 空 | 0 | 未采样（未起播） | 否（需登录/点击） |
| QQ 音乐 | y.qq.com | 有 | 空 | 0 | 未采样（未起播） | 否（首页） |
| 网易云音乐 | music.163.com；song 页 | 有 | 空 | 0 | 未采样（未起播） | 否（都不自动播） |
| 酷狗音乐 | www.kugou.com | 有 | 空 | 0 | 未采样（未起播） | 否（首页） |

Twitch 首页（twitch.tv）同样有 metadata：`1121 GTA RP 天氣冷颼颼的` / `倒呼 (cjw_gg)`，artwork 是 39,248 B 的头像图片；SMTC 未单独采样。

原始输出（节选）：

```json
{"id":"youtube","pageTitle":"Big Buck Bunny 60fps 4K - Official Blender Foundation Short Film - YouTube",
 "metadata":{"title":"Big Buck Bunny 60fps 4K - Official Blender Foundation Short Film","artist":"Blender",
  "artwork":[{"src":"https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg?...","sizes":"320x180"}]},
 "artwork":[{"bytes":15155,"status":200,"mime":"image/avif"}],
 "videos":[{"paused":false,"w":854,"h":480}]}
{"id":"youtube-live","pageTitle":"christmas lofi radio 🎄 cozy ambience to relax to - YouTube",
 "metadata":{"title":"christmas lofi radio 🎄 cozy ambience to relax to","artist":"Lofi Girl",
  "artwork":[{"src":"https://i.ytimg.com/vi/4t4AQ15yj1M/hqdefault.jpg?...","sizes":"320x180"}]},
 "artwork":[{"bytes":16101,"status":200,"mime":"image/avif"}],
 "videos":[{"paused":true,"w":0,"h":0}]}
{"id":"twitch","pageTitle":"ohnePixel - Twitch",
 "metadata":{"title":"🔴[DROPS] GTA 6 FULL PLAYTHROUGH🔴","artist":"ohnePixel",
  "artwork":[{"src":"https://static-cdn.jtvnw.net/jtv_user_pictures/...-profile_image-150x150.png"}]},
 "artwork":[{"bytes":36989,"status":200,"mime":"image/png"}],
 "videos":[{"paused":false,"w":852,"h":480}]}
```

三条读法：

1. **YouTube 给的是真封面**：artwork 是视频的 `hqdefault`（320×180），取回来是 Big Buck Bunny 海报 / Lofi Girl 圣诞插画，不是播放中的画面；直播页也有封面。
2. **Twitch 给的是主播头像**：150×150 的 profile image，能当图用，但不是直播画面封面。
3. **音乐站和 Netflix 全是「有 MediaSession、metadata 空或没有」**：首页不自动播放；Spotify 的 track 页也是 metadata 对象在、title 空；匿名拿不到任何封面。

### 四·2 SMTC 同一时段的三条会话

```json
{"app":"Chrome","title":"Big Buck Bunny 60fps 4K - Official Blender Foundation Short Film","artist":"Blender",
 "thumb":true,"thumbBytes":28592,"thumbMime":"image/png"}
{"app":"Chrome","title":"🔴[DROPS] GTA 6 FULL PLAYTHROUGH🔴","artist":"ohnePixel",
 "thumb":true,"thumbBytes":38382,"thumbMime":"image/png"}
{"app":"egolite","title":"斗鱼No.1声优-13点GTA6","artist":"寅子",
 "thumb":true,"thumbBytes":24232,"thumbMime":"image/png"}
```

三条缩略图都存下来看过：

| 来源 | 尺寸 | 字节 | 画面内容 |
| --- | --- | --- | --- |
| Chrome + YouTube 视频 | 150×83 PNG | 28,592 | Big Buck Bunny 海报（artwork 缩小版，真封面） |
| Chrome + Twitch 频道 | 150×150 PNG | 38,382 | 主播头像（profile image） |
| ego + 斗鱼直播 | 150×84 PNG | 24,232 | 比赛画面帧（视频帧） |

→ **SMTC 每应用只留一条会话，thumbnail 一律 150px 级**；内容是「Chrome 转发的页面 artwork 缩小版」还是「ego 转发的视频帧」取决于浏览器。两者都太小，当封面都会糊。

YouTube 直播（当前在播的场次）试了三次都没起播（headless 停留 14s/26s、headful 35s，都是 `paused`、0×0），同一时段 SMTC 里没有 Chrome 会话，**直播的 SMTC 封面这一格是「测不到」，不是「没有」**。

一条踩坑记录：脚本默认的 YouTube 目标是 `jfKfPfyJRdk`，这场直播已经下播（`playabilityStatus.status=UNPLAYABLE`，reason「This live stream recording is not available.」）。页面照样报 title/artist，artwork URL 却 404，返回 120×90 占位图（1,097 B）。**拿到 artwork 字段不等于封面可用，要校验 HTTP 状态和尺寸。**

## 五、三档归类

### A. 有封面

| 应用 | 形式 | 实测 | 我们怎么用 |
| --- | --- | --- | --- |
| 斗鱼 | 网页（ego/Chrome/Edge） | MediaSession artwork 472KB/114KB | 直接取 artwork |
| 斗鱼 | PC 客户端 | 未安装，未实测 | 按 SMTC thumbnail 处理，预计同网页 |
| B 站视频（非直播） | 网页 | artwork=视频封面 3.4KB，标题空 | 取 artwork；标题回落到页面标题/SMTC |
| YouTube 视频 | 网页（VPN） | artwork 15,155 B / 320×180，标题、艺人都有 | 直接取 artwork |
| YouTube 直播 | 网页（VPN） | artwork 16,101 B / 320×180 | 取 artwork；SMTC 没有会话，别等它 |
| Twitch | 网页（VPN） | artwork 36,989 B / 150×150 主播头像 | 当「有图」用；要直播画面封面还得另找接口 |

### B. 没封面，但标题可用 → 接口兜底

| 应用 | 形式 | 实测 | 兜底 |
| --- | --- | --- | --- |
| 哔哩哔哩直播 | 网页 | 只有页面标题，无 metadata | **已实现**：`bilibili-cover.ps1`（标题 → 直播搜索 → cover） |
| 虎牙 | 网页/客户端 | metadata 全空 | 标题里有房间名，接口未接；先画字卡 |
| 抖音直播 | 网页/客户端 | metadata 全空 | 同上 |
| 快手直播 | 网页/客户端 | metadata 全空 | 同上 |
| QQ 音乐 / 网易云 / 酷狗 | 桌面客户端 | 本机未在播放，未实测 | 客户端通常自己上报 SMTC 封面；拿不到就用专辑名画字卡 |

### C. 完全拿不到

| 应用 | 原因 |
| --- | --- |
| Spotify Web | VPN 下可达，但匿名首页/歌曲页 metadata 全空，播放要登录；SMTC 未采样（未起播） |
| Apple Music Web | 同上，歌曲页也不自动播 |
| Netflix 播放态 | 首页无 metadata；播放页要登录 + DRM，headless 无法验证 |
| 任何 2.4G 私有协议的直播盒子 | 不在本表范围 |

### 未实测（本机缺条件，不写结论）

斗鱼/虎牙/抖音/快手的 PC 客户端、QQ 音乐/酷狗/Spotify/Apple Music 桌面端：这台机器上没装或没在放，**不下结论**。要补测只需装上一个、放起来，再跑一次 `smtc-cover.ps1`。

## 六、兜底顺序（给岛的实现建议）

1. **SMTC thumbnail 只当「有胜于无」**：先看尺寸和内容。150px 级（150×83 的 artwork 缩小版、150×84 的视频帧都算）就直接丢，别当封面。
2. **标题优先**：SMTC 有 `title`，页面有 `document.title`。
3. **标题能对上平台接口就取真封面**：B 站走 `bilibili-cover.ps1`；斗鱼网页本来就有 artwork，优先级更高。
4. **对不上就画字卡**：主播名/歌曲名 + 主题色，用 `packages/core` 的渲染器出图，比一块糊掉的小截图强。
5. **什么都没**：应用图标 + 播放状态点。

## 七、局限

- 全部是 **headless Chrome、无登录、无 DRM** 的测量；登录后才播、付费内容、客户端独有功能都不在覆盖内。
- 只测了一台机器、两条网络（2026-11-22 凌晨）：**无 VPN 直连**（海外站点 `ERR_CONNECTION_CLOSED`）和**系统代理 VPN**（出口美国，见第四节）。VPN 只解决「页面到不了」，不改变「要不要登录」——Spotify / Apple Music / Netflix 依旧拿不到 metadata。
- YouTube 直播在本机没起播（headless / headful 都是 `paused`），所以直播的 SMTC 结论是空缺，不是否定。
- 首屏自动播放依赖 `--autoplay-policy=no-user-gesture-required`；真实浏览器里用户得先点一下，但那不影响 metadata 是否存在（metadata 在播放器初始化时就写了）。
- 一个站点一次快照。斗鱼首页的推荐位每次刷新都不同，所以字节数会变，数量级不会。

## 八、复现

```bash
# SMTC 侧：列会话，存缩略图
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/probes/smtc-cover.ps1 -Pretty
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/probes/smtc-cover.ps1 -SaveThumbs "C:\Temp\thumbs"

# 页面侧：14 个站点全跑，或单站、单页
node scripts/probes/mediasession-cdp.mjs --out probe.json

# VPN 环境下让 Node 侧抓 artwork 也走系统代理，否则海外 artwork 的 bytes 恒为 0
HTTP_PROXY=http://127.0.0.1:7890 HTTPS_PROXY=http://127.0.0.1:7890 NODE_USE_ENV_PROXY=1 \
  node scripts/probes/mediasession-cdp.mjs --out probe.json

# 直播要测当下在播的场次：用频道 handle 的 /live 入口，别用会过期的 video id
node scripts/probes/mediasession-cdp.mjs --url "https://www.youtube.com/@LofiGirl/live" --settle 26000
node scripts/probes/mediasession-cdp.mjs --url "https://www.twitch.tv/ohnepixel" --settle 9000
node scripts/probes/mediasession-cdp.mjs --only huya
node scripts/probes/mediasession-cdp.mjs --url "https://live.bilibili.com/21452505" --settle 8000
```

两个脚本都只读：不登录、不点按钮、不改页面。CDP 脚本用一次性 profile，退出时 `taskkill /T` 整棵进程树。
