# 外设电量识别调研 / Device battery

> 结论先行：**Windows 只替我们读得懂蓝牙设备**（BLE 的 `DEVPKEY_Bluetooth_Battery`）。2.4 GHz 接收器
> 背后的鼠标、键盘、耳机，电量都藏在厂商私有 HID 协议里，系统属性模型里根本没有这个字段。所以
> 「设备页那一行是 —」不是 bug，是信息源不存在。本文核对了 9 个开源项目，据此只实现三条协议
> （Logitech HID++、Razer、ASUS ROG），其余品牌明确不做。

## 1. 逐项目核查

许可证一列来自 `gh api repos/<repo> --jq .license.spdx_id`，并在浅克隆的 `LICENSE` 文件里复核过原文。

| 项目 | 许可证 | 语言 | 识别方式 | 覆盖 | 能直接用到 PowerShell/Node |
| --- | --- | --- | --- | --- | --- |
| [HeyOkay/HaloBattery](https://github.com/HeyOkay/HaloBattery) | **MIT** | Python | 每个型号一个 provider，走 hidapi 原始报文 | 约 90 个型号 / 30 个品牌，见 §2 | **是（唯一一份能直接对照实现的）**：`providers/asus.py`、`logitech.py`、`razer.py` 都写清了报文与字节位 |
| [AngeloCore/gpx-battery](https://github.com/AngeloCore/gpx-battery) | **无 LICENSE 文件**（`gh api` 返回 `null`） | Rust | HID++ 2.0，0x1004/0x1000/0x1001 | 罗技 G Pro X Superlight 1/2 及任意 HID++ 2.0 鼠标 | 只能读，不能抄：无许可证即「保留所有权利」 |
| [deancanen/LGSTrayBattery](https://github.com/deancanen/LGSTrayBattery) | **GPL-3.0** | C# | HID++（`LGSTrayHID/HIDMsg.cs`）+ G HUB WebSocket | 罗技鼠标/键盘/耳机 | 否：GPL 与本项目 MIT 不兼容，只取协议事实 |
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

### 2.2 需要私有协议（能读，但要逐品牌逆向）

按 VID 归组，清单来自 HaloBattery `docs/devices.md` 的全表（90 个型号）：

| VID | 品牌 | 协议 | 我们是否实现 |
| --- | --- | --- | --- |
| `046D` | Logitech | **HID++ 1.0 / 2.0**（0x1004 统一电量、0x1000 状态、0x1001 电压；接收器槽位 1–6，直连槽位 0xFF） | **是** |
| `1532` | Razer | **90 字节 feature report**，class `0x07`，cmd `0x80`（电量）/ `0x84`（充电） | **是** |
| `0B05` | ASUS ROG / TUF | **65 字节 output report** `12 07`，电量在回显后 +4，充电 +9 | **是**（本机硬件即此品牌） |
| `1038` | SteelSeries | Aerox / Rival / Arctis 各自报文 | 否 |
| `1B1C` | Corsair | Dark Core / Virtuoso / HS80 / Void 各自报文 | 否 |
| `03F0` `0951` `0B48` | HyperX | NGENUITY 报文 / 厂商页 `0xFF13` | 否 |
| `3367` | Endgame Gear | 17 字节帧 + `0x55 - sum` 校验 | 否 |
| `054C` | Sony | DualSense / DualShock 4 的 HID 输入报告（蓝牙需 full report 模式） | 否 |
| `057E` | Nintendo | Switch Pro / Joy-Con HID | 否 |
| `2DC8` `20BC` `045E` | 8BitDo / 北通 / Xbox 兼容手柄 | D-input 增强报告 / XInput | 否 |
| `37D1` `3151` `25A7` `05AC` 等 | Pulsar、ATK/VXE、WLmouse、MCHOSE、G-Wolves、Keychron、NZXT、Glorious、Finalmouse、Rapoo、AULA、DAREU、MonsGeek、AJAZZ、Inphic、Lofree、VAXEE、iRocks、Lamzu、EWEADN、Compx | 各家 4K/8K 接收器报文，同一族内字节位都不一样 | 否 |
| `3329` `2886` `0BDA` `046D:0Bxx` 等 | Audeze、DJI、Jabra、Plantronics、Skullcandy、Turtle Beach、JBL、Sony INZONE、Astro、Lofree | 耳机/麦克风私有报文（HeadsetControl 反向工程） | 否 |

### 2.3 完全没人做（或只有零星社区补丁）

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

- 通道：interface 0 的厂商 collection（本机 `MI_00`，usage page `0xFF01`，输入输出均 65 字节）。
- 请求：65 字节 `00 12 07 00 …`（report id 0 + 命令 `12 07`）。
- 应答：回显 `12 07`；电量在回显起点 +4，充电位 +9（与 G-Helper 的 `packet[5]/packet[10]` 同一坐标系，
  只是它把 report id 留在 `[0]`）。
- `FF AA` = 固件不认识该命令；全零 = 只有接收器在、鼠标睡着或关着（G-Helper 的 empty packet 判定）；
  电量 0 且未充电同样按待机处理，不显示 0 %。

### 3.4 失败时怎么办

能力检测任一环失败（没有对应 VID 的设备 / 打不开 collection / 超时 / 空包）就地返回空结果，
`devices.js` 保持原来的 `battery: null`，页面照旧显示「—」。不重试到卡住、不抛错、不影响蓝牙那一路。

## 4. 真机验证

| 项目 | 结果 | 说明 |
| --- | --- | --- |
| 蓝牙 BLE 路径 | **读到** | AZOTH 100 %、FlyDigi BS2PRO 94 %、Xbox 手柄 89 %、iPhone 100 %（`Get-PnpDeviceProperty` 批量读取） |
| ROG GLADIUS III WIRELESS AIMPOINT（`0B05:1A72`） | **协议通道打开成功，读数被拒** | `MI_00` 集合确认（`0xFF01`，in/out 65）；`00 12 07` 发出后连续 40 次收到 65 字节全零。按 §3.3，全零 = 只有接收器在应答、鼠标处于待机/休眠，与 G-Helper `IsDeviceReady=false` 的判定一致。**不是协议猜错**：请求长度、report id、回显位置与 G-Helper 源码逐字节相同 |
| 该鼠标唤醒后 | 未在本次会话内读到 | 鼠标由人手唤醒，自动化无法在不移动用户光标的前提下触发；读取器每 5 分钟重试一次，鼠标一动就会补上 |

**因此没有写「一定能读到」的结论**：ASUS 这条只到「通道与请求与上游逐字节一致、设备在待机时返回全零」
这一步；真实电量数字要等鼠标活动时由周期轮询自然拿到。

## 5. 做与不做的理由

**做（三条）**

1. 用户基数：罗技 + 雷蛇 + 华硕 ROG 覆盖了本机与外设市场的大半，且三家的协议都有**独立多份**开源
   实现互相印证（Solaar / LogiOps / HaloBattery；OpenRazer / HaloBattery；G-Helper / HaloBattery）。
2. 成本可控：三条协议都是「发一个固定长度报告、读一个固定长度回复」，Node 侧只是调度，真正的 IO 用
   一段 P/Invoke 完成，不加任何依赖、不改打包配置。
3. 只读：三条都只发「查询电量」，不碰灯光/DPI/宏，不引入「改坏设备」的风险。

**不做**

1. **其余 20+ 品牌**：每个都要单独逆向，且我们没有对应硬件可验证——按下述红线，无法验证的协议不写。
2. **GPL 代码**：Solaar / OpenRazer / HeadsetControl / LGSTrayBattery 都是 GPL，与本项目 MIT 冲突，
   只取「协议事实」（报文结构、字节位），实现全部独立编写。
3. **无许可证项目**（gpx-battery）：同样只读不发想。
4. **分体耳机电量、厂商广播包**（AirPods / Nothing / Fast Pair）：属于蓝牙广播解析，与「外设私有
   HID」是两条线，收益低于维护成本。
5. **写设备配置**：本项目的目标是显示电量，写配置既有风险又无需求。

## 6. 可复核清单

- 许可证：`gh api repos/<owner>/<repo> --jq .license.spdx_id` 逐条执行；克隆目录下 `LICENSE` 原文可对照。
- ASUS 协议：G-Helper `AsusMouse.cs` 的 `GetBatteryReportPacket/ParseBattery/ParseChargingState`；
  HaloBattery `providers/asus.py` 的 `parse_reply`。
- Razer 协议：OpenRazer `driver/razerchromacommon.c:1057`；HaloBattery `providers/razer.py` 文件头的报文布局。
- HID++ 协议：Solaar `lib/logitech_receiver/hidpp20.py`；HaloBattery `providers/logitech.py` 文件头；
  logipal `battery_overlay.py` 的 `_build_report`。
- 本机实测：`Get-PnpDeviceProperty -KeyName '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2'`（蓝牙）；
  `device-battery.ps1` 的 JSON 输出（私有协议）。
