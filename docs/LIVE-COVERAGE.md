# 直播封面覆盖面

岛要画「正在看什么」，就需要封面。这份文档回答一件事：**Windows 上到底拿不拿得到封面，拿不到时我们靠什么兜底。**

结论先说：**封面只在「网页 + MediaSession」这条路上出现，而且只有斗鱼给了；SMTC 那条路给的是视频帧，不是封面。** 所以封面策略必须是「标题兜底」，不能指望 SMTC。

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

→ **SMTC 有 thumbnail ≠ 有封面**。视频会话里 Windows 给的是画面帧（150×84 这种小尺寸），拿它当封面会糊成一块马赛克。这条实测是「封面必须走标题兜底」的直接依据。

## 三、实测 B：页面 MediaSession（2026-11-22 00:13，Chrome 157 headless，无登录，允许自动播放，停留 5s）

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
2. **斗鱼是唯一全给的**：标题、艺人（主播名）、封面（首页推荐位 472KB、直播间页 114KB）都有。
3. **B 站视频页有 artwork 但标题空**，而且艺术图是视频封面（320w webp），不是播放中的画面 —— 能用，但字段残缺。

## 四、三档归类

### A. 有封面

| 应用 | 形式 | 实测 | 我们怎么用 |
| --- | --- | --- | --- |
| 斗鱼 | 网页（ego/Chrome/Edge） | MediaSession artwork 472KB/114KB | 直接取 artwork |
| 斗鱼 | PC 客户端 | 未安装，未实测 | 按 SMTC thumbnail 处理，预计同网页 |
| B 站视频（非直播） | 网页 | artwork=视频封面 3.4KB，标题空 | 取 artwork；标题回落到页面标题/SMTC |

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
| YouTube / Twitch / Spotify | 本机网络直接 `ERR_CONNECTION_CLOSED`，未实测；且无登录态 |
| Netflix / Apple Music 播放态 | 首页无 metadata；DRM 播放页 headless 无法验证 |
| 任何 2.4G 私有协议的直播盒子 | 不在本表范围 |

### 未实测（本机缺条件，不写结论）

斗鱼/虎牙/抖音/快手的 PC 客户端、QQ 音乐/酷狗/Spotify/Apple Music 桌面端：这台机器上没装或没在放，**不下结论**。要补测只需装上一个、放起来，再跑一次 `smtc-cover.ps1`。

## 五、兜底顺序（给岛的实现建议）

1. **SMTC thumbnail 只当「有胜于无」**：先看尺寸，小到 150×84 这种视频帧就直接丢，别当封面。
2. **标题优先**：SMTC 有 `title`，页面有 `document.title`。
3. **标题能对上平台接口就取真封面**：B 站走 `bilibili-cover.ps1`；斗鱼网页本来就有 artwork，优先级更高。
4. **对不上就画字卡**：主播名/歌曲名 + 主题色，用 `packages/core` 的渲染器出图，比一块糊掉的小截图强。
5. **什么都没**：应用图标 + 播放状态点。

## 六、局限

- 全部是 **headless Chrome、无登录、无 DRM** 的测量；登录后才播、付费内容、客户端独有功能都不在覆盖内。
- 只测了一台机器、一条网络（2026-11-22 凌晨）。海外站点在这条网络上不可达，因此 YouTube/Twitch/Spotify 三行是「不可达」，不是「没有封面」。
- 首屏自动播放依赖 `--autoplay-policy=no-user-gesture-required`；真实浏览器里用户得先点一下，但那不影响 metadata 是否存在（metadata 在播放器初始化时就写了）。
- 一个站点一次快照。斗鱼首页的推荐位每次刷新都不同，所以字节数会变，数量级不会。

## 七、复现

```bash
# SMTC 侧：列会话，存缩略图
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/probes/smtc-cover.ps1 -Pretty
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/probes/smtc-cover.ps1 -SaveThumbs "C:\Temp\thumbs"

# 页面侧：14 个站点全跑，或单站、单页
node scripts/probes/mediasession-cdp.mjs --out probe.json
node scripts/probes/mediasession-cdp.mjs --only huya
node scripts/probes/mediasession-cdp.mjs --url "https://live.bilibili.com/21452505" --settle 8000
```

两个脚本都只读：不登录、不点按钮、不改页面。CDP 脚本用一次性 profile，退出时 `taskkill /T` 整棵进程树。
