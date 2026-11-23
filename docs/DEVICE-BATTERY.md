# 外设电量识别调研 / Device battery

> 结论先行：**Windows 只替我们读得懂蓝牙设备**（BLE 的 `DEVPKEY_Bluetooth_Battery`）。2.4 GHz 接收器
> 背后的鼠标、键盘、耳机，电量都藏在厂商私有 HID 协议里，系统属性模型里根本没有这个字段。所以
> 「设备页那一行是 —」不是 bug，是信息源不存在。
>
> 本文核对了 10 个开源项目，据此实现了三类协议 + 18 个品牌族：蓝牙路径（系统属性）、Logitech HID++ /
> Razer / ASUS ROG（本仓库原有三条），以及按 BatteryHub 设备表补的 15 个品牌族。**未标 tested 的一律是
> untested**——本机没有那些硬件，失败时静默跳过，不猜读数。

## 1. 逐项目核查

许可证一列来自 `gh api repos/<repo> --jq .license.spdx_id`，并在浅克隆的 `LICENSE` 文件里复核过原文。

| 项目 | 许可证 | 语言 | 识别方式 | 覆盖 | 能直接用到 PowerShell/Node |
| --- | --- | --- | --- | --- | --- |
| [HeyOkay/HaloBattery](https://github.com/HeyOkay/HaloBattery) | **MIT** | Python | 每个型号一个 provider，走 hidapi 原始报文 | 约 90 个型号 / 30 个品牌，见 §2 | **是（唯一一份能直接对照实现的）**：`providers/asus.py`、`logitech.py`、`razer.py` 都写清了报文与字节位 |
| [krisgfx9/Wireless-Device-Battery-Monitor](https://github.com/krisgfx9/Wireless-Device-Battery-Monitor)（BatteryHub） | **GPL-3.0**（LICENSE 原文与 GitHub API 均为 GPL-3.0） | C++ | 每个品牌一个 driver，Win32 HID 原始报文 | 18 个品牌族，见 §3.4 | **否（GPL）**：只取协议事实（VID/PID、报告号、命令字节、回复偏移、型号 ID），不复制代码 |
| [AngeloCore/gpx-battery](https://github.com/AngeloCore/gpx-battery) | **无 LICENSE 文件**（`gh api` 返回 `null`） | Rust | HID++ 2.0，0x1004/0x1000/0x1001 | 罗技 G Pro X Superlight 1/2 及任意 HID++ 2.0 鼠标 | 只能读，不能抄：无许可证即「保留所有权利」 |
| [deancanen/LGSTrayBattery](https://github.com/deancanen/LGSTrayBattery) | **GPL-3.0** | C# | HID++（`LGSTrayHID/HIDMsg.cs`）+ G HUB WebSocket | 罗技鼠标/键盘/耳机 | 否：本项目采用非商用自定义许可，不复制 GPL 源码，只取协议事实 |
| [LucvanDeenen/logipal](https://github.com/LucvanDeenen/logipal) | **MIT** | Python | HID++ 2.0，短/长报告自适应 | 罗技 G Pro（Lightspeed） | 是：`battery_overlay.py` 是最短的 HID++ 可运行样例（约 110 行） |
| [openrazer/openrazer](https://github.com/openrazer/openrazer) | **GPL-2.0** | C | 90 字节 feature report，class 0x07 | 雷蛇全系（`razerchromacommon.c`） | 否：内核驱动 + GPL；协议事实可用（见 §3.2） |
| [L1GHTSHAPER/BT-Charge-Indicator](https://github.com/L1GHTSHAPER/BT-Charge-Indicator) | **MIT** | C# | Windows 设备属性 + BLE GATT + 各家广播包 | 蓝牙耳机/手柄/键鼠，另有 AirPods、Nothing、Fast Pair | 是，但只对蓝牙路径有意义（我们已用系统属性，比它轻） |
| [Abdullah-Mohammed-OTU/G-Pro-Battery-Tray-Tool](https://github.com/Abdullah-Mohammed-OTU/G-Pro-Battery-Tray-Tool) | **MIT** | Python | HID++ 2.0 单文件实现 | 罗技 G Pro Superlight | 是：`superlight_battery.py` 与 logipal 同构，可作交叉验证 |
| [pwr-Solaar/Solaar](https://github.com/pwr-Solaar/Solaar) | **GPL-2.0** | Python | HID++ 1.0/2.0 的权威实现 | 罗技全系 | 否（GPL），但是 HID++ 的**事实标准**，用来核对特性号与错误码 |
| [Sapd/HeadsetControl](https://github.com/Sapd/HeadsetControl) | **GPL-3.0** | C++ | 各家耳机私有报文 | 罗技/雷蛇/海盗船/SteelSeries/华硕耳机 | 否（GPL），协议事实可用 |

**为什么只有 HaloBattery 能直接对照**：它把「请求字节、回显位置、电量在第几字节、充电位、错误包」
逐条写进了 `docs/protocols.md`（79 KB）与 `providers/*.py` 的文件头；其余项目要么没许可证，要么
只有代码没有说明，要么是 GPL。

## 2. 品牌三分法

### 2.1 系统已能读（不需要我们写协议）

| 类别 | 数据源 | 实测（本机） |
| --- | --- | --- |
| 蓝牙 BLE 设备（耳机、键盘、鼠标、手柄、手机） | `DEVPKEY_Bluetooth_Battery`（`{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2`） | ROG AZOTH 键盘 **100 %**、FlyDigi BS2PRO 手柄 **94 %**、Xbox Wireless Controller **89 %**、手机 **100 %** |
| 蓝牙经典（HFP）耳机 | 厂商驱动写入同一个 PnP 属性，取决于耳机 | 本机无此类设备，未验证 |
| Xbox 手柄 | 同上（BLE） | 89 % |
| 标准 HID Battery Strength（usage 0x06/0x20） | 驱动把该 usage 映射成设备属性，**极少见** | 本机 0 例 |

限制：BLE 的**分体电量**（左右耳 + 充电仓）系统只给一个总值；AirPods / Nothing / Fast Pair 的
分体值必须解析厂商广播包（BT-Charge-Indicator 的做法），这是另一件事，我们不做。

### 2.2 需要私有协议：已实现的三条

按 VID 归组，这三条在本仓库已经有独立实现，且都有**多份**独立开源实现互相印证：

| VID | 品牌 | 协议 | 实现位置 |
| --- | --- | --- | --- |
| `046D` | Logitech | **HID++ 1.0 / 2.0**（0x1004 统一电量、0x1000 状态、0x1001 电压；接收器槽位 1–6，直连槽位 0xFF） | §3.1 |
| `1532` | Razer | **90 字节 feature report**，class `0x07`，cmd `0x80`（电量）/ `0x84`（充电） | §3.2 |
| `0B05` | ASUS ROG / TUF | **65 字节 output report** `12 07`（鼠标）/ `12 01`（键盘），电量在回显后 +4 / +6 | §3.3 |

### 2.3 需要私有协议：按 BatteryHub 设备表补的 15 个品牌族

这些协议事实来自 BatteryHub `src/drivers/*.cpp` 的注释（GPL-3.0，只取事实，见 §6）。**本机没有对应
硬件，全部 untested**；能力检测失败时静默跳过，不猜读数、不下发写命令。

| 品牌 | VID:PID（表内） | 协议 / 命令字节 | 实现 |
| --- | --- | --- | --- |
| SteelSeries | `1038`：Arctis 7/1、Nova 3P/5/7、Aerox、Rival 3/650 | `00 06 18/12`、`00 00 B0`、`92/D2`、`00 AA 01` | 是 |
| Corsair | `1B1C`：Void/HS70/HS80、Virtuoso、Sabre、Bragi | `C9 64`、Bragi GET `0F/10`、`08 04` | 是 |
| LAMZU | `373E`、`37B0` | 65 字节 feature `[3]=02 [4]=02 [6]=83`；`[8]` 电量 | 是（按型号名守卫） |
| Endgame Gear | `3367:1970` / `3367:1961` | `A1 B4 00` / `08 04`（和为 0x55） | 是 |
| EWEADN | `372E:103D` / `372E:1027` | `47 00` 链路、`4F 81` 电量（bit7 充电） | 是 |
| ATK / VGN / VXE / Redragon | `320F:5088/5055/226F/50C3`、`373B:1012` | Evision `04 seq 1A flag`；`[8]` 电量 `[9]` 状态 | 是 |
| AULA / MCHOSE | `3554:FA09/FB40`、`41E4:2001` | 20 字节 output `13 4A 01 …` + 校验；`[5]` 电量 | 是 |
| MCHOSE | `5253`、`3837:100C/100B/100A/1001/1012` | feature `12 F9`，payload 全 `^FF`；`[9]` 电量 `[10]` 充电 | 是（按型号名守卫） |
| Glorious / G-Wolves | `258A:2022…201A`、`33E4:3854` | 65 字节 feature `[3]=02 [4]=02 [6]=83` | 是 |
| HyperX | `03F0`：Cloud III、Cloud II、Alpha、Haste 2、Cloud III S | `66 82/8A/89`、`06 FF BB`、`21 BB`、`52 01`、`0C 02 03 01` | 是 |
| Cooler Master | `2516:01B7/0169/0167` | `46 81 00` → `47 81`；`[10]` 电量 `[11]` 充电 | 是 |
| DAREU | `260D:1090/1074/1125/0022/1131/1148` | `08 04`、`04 F6`、Togran `0A slot len class cmd` | 是 |
| Fantech / Redragon Areson | `25A7:FA7B/FA7C/FA7E` | 17 字节 feature `08 04`，和为 0x55 | 是 |
| Finalmouse | `361D:0100/0300/0301` | vendor `FF00`：GET `21 57` 后 wake `96`；burst 5 mV | 是 |
| Audeze | `3329`（Maxwell 等） | `02 03 …` 查询，`[?]` 电量 | 是 |
| Rapoo | `24AE:1410…4618` | 被动 Nordic `07` 帧 / 旧 `BB B0` 帧 | 是 |
| Jabra | `0B0E`（排除 DECT 基座） | GNP：`05 dst 00 seq 46 class 12 02` | 是（按型号名守卫） |

**明确未实现**（避免半套协议）：AULA X9 Ultra 的多步事务、HyperX Cloud Stinger/Flight 的 mV 曲线与
10 次重读。表里没有的 VID:PID 一律不发包。

### 2.4 完全没人做（或只有零星社区补丁）

- **白牌 2.4G 键鼠套装**：接收器只枚举成标准 HID 键鼠，没有厂商 collection，也没有公开协议——
  连「发什么字节」都无从谈起，这类设备物理上就读不到。
- **国产办公外设的低端线**（双飞燕、富勒、新贵、雷柏的低端型号）：没有厂商配置软件，也就没有可抓的
  报文；Rapoo 只有 VT7/V700/VT9 这类高端型号被社区补上。
- **显示器 / USB Hub 内置的键鼠**：走的是 Hub 的标准 HID，同上。
- **白牌 TWS 与蓝牙音箱**：多数不广播 BLE Battery Service，系统属性为空，也没有厂商 App 可抓——本机
  「小爱音箱」正是这一类的典型（`BTHENUM` 节点存在，但没有电量属性）。
- **摄像头、部分麦克风、智能家居**：HaloBattery 补了一小部分（智能插座、手环），但都是逐型号，没有通用路径。

## 3. 我们实现了什么

`apps/desktop/src/main/services/device-battery.js`（Node 侧调度 + 缓存）与
`apps/desktop/src/main/services/device-battery.ps1`（零依赖 P/Invoke 读 HID）。
只读电量，**不写任何设备配置**（不点灯、不改 DPI、不改回报率）。

### 3.1 Logitech HID++ 2.0（`046D`）

来源：Solaar 的特性号表 + HaloBattery `providers/logitech.py` + logipal 的可运行样例（三份独立实现互相印证）。

- 通道：usage page `0xFF00`，usage `0x0001`（短报告 7 字节）/ `0x0002`（长报告 20 字节）。
- 请求：`11 <槽位> <特性索引> <(功能<<4)|软件ID> <参数…>`，补齐到 20 字节。
- 根特性 `0x0000`：功能 0 查特性索引（参数 `<hi> <lo>`），功能 1 是 ping。
- 电量特性按优先序：`0x1004`（功能 1 → `<百分比> <等级标志> <状态>`）、`0x1000`（功能 0）、
  `0x1001`（功能 0 → 16 位大端毫伏，flags bit7 = 充电）。
- 状态值 `0` 放电、`1` 充电、`2` 将满、`3` 满、`4` 慢充。
- 错误包：`10|11 <槽位> 8F|FF <特性索引> <功能|软件ID> <错误码>`；`0x08` 槽位空、`0x09` 已配对但关机。
- 电压→百分比用 Solaar 的锂电放电曲线插值（`4186 mV→100 %` … `3500 mV→0 %`）。

### 3.2 Razer（`1532`）

来源：OpenRazer `razerchromacommon.c:1057` 的 `get_razer_report(0x07, 0x80, 0x02)`，
以及 HaloBattery `providers/razer.py` 的报文布局。

- 90 字节 feature report，`[0]` 状态（请求写 `0x00`）、`[1]` 事务 ID（鼠标多为 `0x1F`，耳机 `0x3F`）、
  `[6]` 命令类 `0x07`、`[7]` 命令 `0x80`、`[8..87]` 参数、`[88]` 为 `[2..87]` 的异或校验。
- 回复 `[0]==0x02` 为成功，电量在 `[9]`（即 `arg[1]`）；`0x01` 忙、`0x03` 失败、`0x04` 超时、`0x05` 不支持。
- 设备列表与事务 ID 取自 OpenRazer 的 PID 表（只收录 OpenRazer 自己会读的无线型号）。

### 3.3 ASUS ROG（`0B05`）

来源：G-Helper `app/Peripherals/Mouse/AsusMouse.cs`（`ParseBattery` 读 `packet[5]`、
`ParseChargingState` 读 `packet[10]`），HaloBattery `providers/asus.py` 给出集合选择与四类应答。

- 通道：厂商 collection，**按 caps 选而不是按接口号**——Gladius III 是 `MI_00`（`0xFF01`，输入输出 65 字节），
  Azoth 是 `0xFF00`，只认 `mi_00` 会漏掉其中一个。要求 `page ≥ 0xFF00` 且输出报告 ≥ 65 字节。
- 鼠标请求：65 字节 `00 12 07 00 …`（report id 0 + 命令 `12 07`），回显后 +4 电量、+9 充电；
  3 次间隔 300 ms 的重试，因为无线鼠标只在唤醒后的短窗口内应答。
- 键盘请求：`00 12 01`，回显后 offset 6 电量、9 充电（Falchion 为 11）。
- `FF AA` = 固件不认识该命令；全零 = 只有接收器在、鼠标睡着或关着（G-Helper 的 empty packet 判定）；
  电量 0 且未充电同样按待机处理，不显示 0 %。

### 3.4 读取时机：三层

设备电量不是「打开页面才读」的量，`device-battery.js` 因此有三条读取路径：

1. **打开 / 回到设备页**：立即探测，**3 次间隔 3 秒的重试**。2.4 GHz 鼠标只在唤醒后的短窗口应答，一次
   探测落进休眠就是 65 字节全零；三次间隔重试是「—」变成数字的关键。
2. **后台常驻**：设备页关闭时仍然每 **5 分钟**探测一次。关掉页面不会停止读取，所以下次打开时数字已经
   是新的，而不是「打开才发现旧了」。
3. **刷新按钮**：设备页 hero 右上的「刷新」立即再探一次，不等两条时钟。

探测完成时间记录在 `devices.snapshot().probedAt`（快照字段），因此「不打开设备页也会更新」是可观测的：
两次快照的 `probedAt` 递增即为证据。

### 3.5 VID/PID 精确匹配

同一个 VID 下常有多套协议：`320F` 同时是 ATK 键盘和 Redragon M999，`25A7` 同时是 Fantech 与 Redragon
Areson，`260D` 下有三个 DAREU 家族。因此：

- **调用点按 PID 分派**：每个品牌函数拿到的是精确的 4 位 PID，`Get-PathsFor` 用
  `vid_xxxx&pid_yyyy` 全串匹配后再打开集合，不做前缀或 VID 级广播。
- **整 VID 协议加型号守卫**：LAMZU（`373E`/`37B0`）、MCHOSE `5253`、Jabra `0B0E` 的上游驱动按整个
  VID 实现，调用前用 PnP 友好名匹配型号/品牌（`Test-ModelName`）；名字不匹配的 PID 收不到这些字节。
- **默认拒绝**：表里没有的 VID:PID 不发包，失败静默。

### 3.6 失败时怎么办

能力检测任一环失败（没有对应 VID 的设备 / 打不开 collection / 超时 / 空包）就地返回空结果，
`devices.js` 保持原来的 `battery: null`，页面照旧显示「—」。不重试到卡住、不抛错、不影响蓝牙那一路。
探测没有输出时**保留上一次答案**，一次瞬时的打开失败不会把已显示的电量抹掉。

## 4. 真机验证

| 项目 | 结果 | 说明 |
| --- | --- | --- |
| 蓝牙 BLE 路径 | **读到** | AZOTH 100 %、FlyDigi BS2PRO 94 %、Xbox 手柄 89 %（`pnputil /properties` 原生快照） |
| ROG AZOTH（`0B05:1A83`） | **100 %（蓝牙路径）** | 键盘的厂商通道同样只回全零（待机），页面上的 100 % 来自 BLE 属性，不是私有协议 |
| ROG GLADIUS III WIRELESS AIMPOINT（`0B05:1A72`） | **协议通道打开成功，读数被拒 → 需唤醒** | `MI_00` 集合确认（`0xFF01`，in/out 65，feat 0）；`00 12 07` 发出后 **3 个包 × 各 10 次 = 30 次读取全部 65 字节全零**；用 `mouse_event` 移动光标唤醒后再发 3 个包 × 10 次，**仍然全部全零**（合计 60 次）。按 §3.3，全零 = 只有接收器在应答、鼠标处于待机/休眠，与 G-Helper `IsDeviceReady=false` 一致。**需人工唤醒**：物理移动鼠标或按键后再点「刷新」/ 等后台轮询 |
| 新增 15 个品牌族 | **untested** | 本机无对应硬件；能力检测失败即静默跳过 |

**因此没有写「一定能读到」的结论**：ASUS 这条只到「通道与请求与上游逐字节一致、设备在待机时返回全零」
这一步；真实电量数字要等鼠标被物理唤醒后由三层读取路径之一自然拿到。

## 5. 做与不做的理由

**做**

1. 用户基数：罗技 + 雷蛇 + 华硕 ROG 覆盖了本机与外设市场的大半，且三家的协议都有**独立多份**开源
   实现互相印证（Solaar / LogiOps / HaloBattery；OpenRazer / HaloBattery；G-Helper / HaloBattery）。
2. 成本可控：所有协议都是「发一个固定长度报告、读一个固定长度回复」，Node 侧只是调度，真正的 IO 用
   一段 P/Invoke 完成，不加任何依赖、不改打包配置。
3. 只读：只发「查询电量 / 查询状态」，不碰灯光/DPI/宏，不引入「改坏设备」的风险。
4. BatteryHub 的设备表把 18 个品牌族的报告号与字节位写清楚了，因此可以按事实独立实现；移植只发生在
   有明确命令字节的家族上，缺字节的一律不写（见 §2.3 末尾）。

**不做**

1. **写设备配置**：本项目的目标是显示电量，写配置既有风险又无需求。
2. **GPL 代码**：Solaar / OpenRazer / HeadsetControl / LGSTrayBattery / BatteryHub 都是 GPL，与本项目
   许可条款不兼容，只取「协议事实」（报文结构、字节位），实现全部独立编写。
3. **无许可证项目**（gpx-battery）：同样只读不抄。
4. **分体耳机电量、厂商广播包**（AirPods / Nothing / Fast Pair）：属于蓝牙广播解析，与「外设私有
   HID」是两条线，收益低于维护成本。
5. **没有命令字节的半套协议**：宁可显示「—」，不猜一个可能写坏设备的包。

## 6. NOTICE / 许可证归属

- 本项目 EmojiTot 为 **EmojiTot Noncommercial License**（根 `LICENSE`）。
- 参考实现 BatteryHub / Wireless Battery（krisgfx9/Wireless-Device-Battery-Monitor，commit 632f204c）为
  **GPL-3.0**。本项目采用更严格的非商用自定义许可，**没有复制、改写或链接其 GPL 源代码**。
- 使用的内容是协议事实：VID/PID、报告号、命令字节、回复偏移、状态码。这些事实同时被 HaloBattery、
  Solaar、OpenRazer、G-Helper、HeadsetControl 与各厂商网页驱动独立使用；本项目按这些事实独立实现为
  PowerShell。
- 根目录 `NOTICE` 记录了该归属与「未复制 GPL 代码」的声明。若未来需要直接复用 BatteryHub 代码，必须
  把相应文件按 GPL-3.0 分发并重新评估整个二进制的许可证，不能标成项目自有许可。

## 7. 可复核清单

- 许可证：`gh api repos/<owner>/<repo> --jq .license.spdx_id` 逐条执行；克隆目录下 `LICENSE` 原文可对照。
- ASUS 协议：G-Helper `AsusMouse.cs` 的 `GetBatteryReportPacket/ParseBattery/ParseChargingState`；
  HaloBattery `providers/asus.py` 的 `parse_reply`。
- Razer 协议：OpenRazer `driver/razerchromacommon.c:1057`；HaloBattery `providers/razer.py` 文件头的报文布局。
- HID++ 协议：Solaar `lib/logitech_receiver/hidpp20.py`；HaloBattery `providers/logitech.py` 文件头；
  logipal `battery_overlay.py` 的 `_build_report`。
- BatteryHub 协议：`src/drivers/<file>.cpp` 的注释（每个函数注释里标注了上游文件与命令字节）。
- 本机实测：`pnputil /enum-devices /connected /class Bluetooth /properties /format xml`（蓝牙）；
  `devices-pnp.ps1` 的 Config Manager 属性读取（HFP 节点）；
  `device-battery.ps1` 的 JSON 输出（私有协议）；设备页两次快照的 `probedAt`（后台轮询）。
