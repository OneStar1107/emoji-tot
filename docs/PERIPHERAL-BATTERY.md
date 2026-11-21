# 外设电量：Windows 发布什么，我们才读得到什么

这份文档回答两件事：**西伯利亚 T7 GT 的电量到底能不能读**，以及**GitHub 上那批外设电量项目能给我们什么**。

结论先说：**能读。Windows 发布了 100%，但它不在 HID 上，而在「免提音频网关」那个节点上。** 厂商自己的 HID 私有协议存在、没公开文档，而且官方软件对这个型号也没采到有效值——所以我们不碰它的字节。

## 一、机型与连接

| 项 | 值 |
| --- | --- |
| 系统里的名字 | `crociris T7 GT`（CROCIRIS 系列，即 XIBERIA 西伯利亚 T7 GT） |
| 蓝牙 MAC | `50:C0:F0:30:EA:61` |
| 蓝牙服务 | HFP AG + A2DP（MEDIA） + AVRCP（两个 Transport）全在 |
| USB | `VID_36F9 & PID_F009`，复合设备：HID 4 个集合 + 音频端点 |
| 蓝牙芯片厂商字符串 | `Actions`（炬芯） |
| USB 音频桥 | Savitech LHDC-X（APO 名 `SAVITECH LHDC-X Xiberia GP USB APO`） |
| 同时在线 | 是，蓝牙与 USB 两条连接并存 |

设备名里的 `3-` 是 Windows 给音频端点加的同名序号，不是型号的一部分。

## 二、HID 枚举

`scripts/probes/peripheral-battery.ps1` 用 setupapi + hid.dll 枚举顶层集合（`HidP_GetCaps`），读的是真正的 usage page / usage：

| VID | PID | usage page | usage | 输入报告 | Feature 报告 | 厂商 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 36F9 | F009 | 0x000C | 0x0001 | 3 B | 0 | Actions | Consumer Control（媒体键） |
| 36F9 | F009 | 0x000B | 0x0001 | 3 B | 0 | Actions | Phone（通话控制） |
| 36F9 | F009 | 0xFF90 | 0x0001 | 64 B | 0 | Actions | 厂商自定义 |
| 36F9 | F009 | 0xFF82 | 0x0001 | 64 B | 0 | Actions | 厂商自定义 |

**Battery Strength（usage page 0x0006 / usage 0x0020）集合数：0。** 也没有 Feature 报告，没有 BLE GATT 0x180F。

意思是：HID 这一侧 Windows 没有任何标准电量可读，两个 64 字节的厂商集合就是私有通道。

## 三、Windows 到底发布不发布电量

17 个相关 PnP 节点里，**只有 1 个带电量属性**：

| 节点 | 类 | 名称 | 电量 |
| --- | --- | --- | --- |
| `BTHENUM\{0000111E-…}_LOCALMFG&0002\…50C0F030EA61…` | **System** | crociris T7 GT **Hands-Free AG** | **100** |
| 其余 16 个（BTHENUM\DEV、USB 复合、HID 4 个集合、音频端点、HFP 音频） | — | — | 无 |

属性本身：

```
{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2 = 100          # DEVPKEY_Bluetooth_Battery
{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 7 = 2026-11-15 20:38:59
DEVPKEY_Device_LastArrivalDate = 2026-11-21 15:47:30
DEVPKEY_Device_InstallDate     = 2026-11-15 17:02:34
```

读法一行：

```powershell
Get-PnpDeviceProperty -InstanceId 'BTHENUM\{0000111E-0000-1000-8000-00805F9B34FB}_LOCALMFG&0002\7&21DD79EB&0&50C0F030EA61_C00000000' `
  -KeyName '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2'
```

**这个 100 是设备通过 HFP 上报给 Windows 的值**，就是「设置 › 蓝牙」里显示的那个百分比，不是我们从私有帧里猜的。时间戳早于最近一次到达（11-21），说明它只在连上或电平变化时写一次——当快照用，别当实时表。

同机对照，两个通道一目了然：

| 设备 | 节点类 | 电量 |
| --- | --- | --- |
| ROG AZOTH（BLE 键盘） | Bluetooth（`BTHLE\DEV_…`） | 100 |
| FlyDigi BS2PRO（BLE 手柄） | Bluetooth（`BTHLE\DEV_…`） | 94 |
| **crociris T7 GT（经典蓝牙耳机）** | **System（`BTHENUM\{0000111E…`）** | **100** |

### 现网 `devices.ps1` 的两个缺口（本轮实测发现）

1. **只扫 `-Class Bluetooth`**，而 T7 GT 的电量挂在 `System` 类的 HFP AG 节点上 → 这类蓝牙耳机在岛里永远显示不出电量。要补一次 System 类里 `BTHENUM\{0000111E…}` 的扫描（或按 `BTHENUM\DEV_*` 的 MAC 把兄弟节点并过来）。
2. **批量读属性有静默上限**：`Get-PnpDeviceProperty -InstanceId <数组>` 在本机 341 个节点时返回 **0 条**（15 ms 直接返回），n=200 正常。现在传的是 BT+HID 约 100 个节点，暂时没炸；节点一多就会全空。建议按 100 个一块分批读。

## 四、厂商软件与私有协议

**已安装并且正在运行：XIBERIA HUB v0.3.1.13**（`D:\XIBERIA HUB\`，两个进程）。

| 文件 | 作用 |
| --- | --- |
| `hidapi.dll` | HID 传输 |
| `ActHID.dll` | Actions 的 HID 封装 |
| `LHDCX_XIBERIA_DLL.dll`（42 MB）/ `LHDCX_XIBERIA_CLI.dll` | LHDC-X 编解码 + 设备控制 |
| `DeviceUsb.dll` | USB 侧 |
| `Drivers/Downlink/APO/LhdcXXiberiaGpUsbApo.inf` | Savitech LHDC-X APO |
| `Drivers/Uplink/FMUSBAPO`、`FMUSBService` | Forte Media USB 音频 |
| `Drivers/Uplink/USBEXT_Xiberia/SAMSfpu_36F9A005.dat` 等 | VID 36F9 的固件包 |

**通道 = HID 私有协议。** `hid-worker` 日志给的是实测形态：

- report id **85（0x55）**，64 字节定长帧，写 64 读 64；
- `LoadLib::queryStatus` 每十几秒轮询一次状态；
- 一帧原始字节（照抄，**不解析**）：
  `55 10 01 0b 01 64 30 64 00 00 00 01 01 00 07`

**电量这条通道官方自己也没走通**：主程序日志里「设备连接状态允许电量，仍需有效采样」123 次、「隐藏电量显示」129 次；hid-worker 日志里没有任何 battery 字样；`Resources/images` 里没有电池图标。也就是说该型号的电量 UI 在官方软件里是长期隐藏的。

⇒ **厂商私有协议：存在、无公开文档、且官方尚未采到有效样本。我们不猜字节，不解码。**

## 五、官网与下载

| 站点 | 状态 | 内容 |
| --- | --- | --- |
| `xiberia.net` | 200 | 「X-HUB 驱动合集」「键鼠网页驱动」「键鼠客户端驱动」「电竞耳机驱动」「电竞耳塞网页驱动」「网吧键鼠驱动」「其他驱动下载」 |
| `hub.xiberia.net` | 200 | XIBERIA HUB 入口 |
| `hub.crociris.com/connect` | 200 | CROCIRIS HUB（同一套软件的系列名） |
| `drivers.xiberia.net/login` | 403 | 驱动下载要登录 |

没有公开的协议文档，也没有开放 API。

## 六、GitHub 上的外设电量项目

### 项目清单（许可证用 GitHub API 核过）

| 项目 | 平台 | 许可证 | 覆盖 | 识别方式 | 我们能复用吗 |
| --- | --- | --- | --- | --- | --- |
| `renanleonel/windows-taskbar-battery` | Windows（Rust） | **MIT** | 罗技接收器/耳机 dongle、BLE、经典蓝牙、Xbox、DualSense/DS4 | HID++ / GATT / HFP 上报值 / WinRT Gaming.Input / 手柄输入报告 | **直接复用** |
| `libratbag/libratbag` | Linux | **MIT** | 高端游戏鼠标（罗技、雷蛇、赛睿、冰豹等） | 设备识别表 + HID++ / Razer 协议 | 复用识别表与协议笔记 |
| `Ithilias/logitray` | Windows（Rust） | **MIT** | 罗技鼠标键盘 | HID++ | 可复用 |
| `Ariazonaa/PeripheralBatteryPlugin` | Windows | **MIT** | 蓝牙耳机 + 罗技鼠标 | Windows 上报值 + HID++ | 可复用（TrafficMonitor 插件） |
| `pwr-Solaar/Solaar` | Linux | GPL-2.0 | 罗技全系 | HID++ | 只读参考 |
| `openrazer/openrazer` | Linux | GPL-2.0 | 雷蛇 | Razer 私有 HID | 只读参考 |
| `ckb-next/ckb-next` | Linux | GPL-2.0 | 海盗船 | 私有 HID | 只读参考 |
| `krisgfx9/Wireless-Device-Battery-Monitor`（BatteryHub） | Windows | GPL-3.0 | 罗技/雷蛇/赛睿/海盗船/HyperX/Glorious/PS/Xbox/蓝牙 | 私有协议 + 系统上报 | 不可抄 |
| `lihaoyun6/AirBattery` | macOS | AGPL-3.0 | Apple（AirPods/Beats/iPhone…） | BLE AAP 私有 | 不可抄 |
| `atar-axis/xpadneo` | Linux | GPL-2.0 | Xbox 手柄 | BT HID | 不可抄 |
| `libusb/hidapi` | C | BSD-3 | HID 传输层 | — | 可当依赖 |

### 设备类别 × 品牌 × 型号 × 识别方式

| 类别 | 品牌 / 型号 | 识别方式 | 出处 / 许可证 |
| --- | --- | --- | --- |
| 蓝牙头戴/耳塞 | **XIBERIA CROCIRIS T7 GT**（本机实测） | 经典蓝牙 HFP 上报 → `DEVPKEY_Bluetooth_Battery`（HFP AG 节点） | 本轮实测；Windows 自带 |
| 蓝牙头戴/耳塞 | Sony WH/WF 系列、Bose QC、AirPods、Galaxy Buds | 同上（设备上报给 Windows 的值，等于设置里那个百分比） | `windows-taskbar-battery` MIT |
| BLE 鼠标/键盘/手柄 | 绝大多数 BLE HID（本机实测 ROG AZOTH、FlyDigi BS2PRO） | GATT Battery Service 0x180F / 0x2A19 | Windows 自带 |
| 2.4G 键鼠 | 罗技 MX Master 3 / Anywhere 3 / G Pro / G915 / PRO X Wireless | HID++，走接收器或耳机 dongle | `libratbag` MIT、`windows-taskbar-battery` MIT |
| 2.4G 键鼠 | 雷蛇 DeathAdder V2/V3、Basilisk、BlackWidow、Kraken | Razer 私有 HID 报告 | `openrazer` GPL-2.0 |
| 2.4G 键鼠 | 赛睿 Arctis / Prime，海盗船 Harpoon / Katar / Virtuoso，HyperX，Glorious | 各家私有 HID | BatteryHub GPL-3.0；`ckb-next` GPL-2.0 |
| 手柄 | Sony DualSense / DualSense Edge / DualShock 4 | HID 输入报文字段（USB / BT） | `windows-taskbar-battery` MIT |
| 手柄 | Xbox One / Series（无线适配器 / BT / USB） | `Windows.Gaming.Input` 电池 API | `windows-taskbar-battery` MIT |
| 手柄 | Switch Pro / 8BitDo | 蓝牙 HID 报告 | **未验证**，需要真机 |
| TWS | Apple AirPods 全系 / Beats | BLE AAP 私有 | `AirBattery` AGPL-3.0（不可抄） |
| 无电池属性的 2.4G 接收器 | 杂牌 dongle | 无 | 只能显示「已连接」 |

**需要硬件才能推进的**：雷蛇 / 赛睿 / 海盗船 / HyperX / Glorious / 罗技 HID++ —— 每型一张表，都要真机上手抓协议；罗技还需要一个接收器或支持 HID++ 的设备。

## 七、下一步能支持哪些型号

按**通道**排，不按品牌排（品牌随时在换，通道只有五条）：

| 优先 | 通道 | 现在能不能 | 覆盖举例 | 代价 |
| --- | --- | --- | --- | --- |
| 1 | BLE GATT 0x180F/0x2A19 | **能**，马上 | ROG AZOTH、FlyDigi BS2PRO、绝大多数 BLE 键鼠手柄 | 无 |
| 2 | 经典蓝牙 HFP 上报 | **能**，修一下扫描类 | **T7 GT**、Sony/Bose/漫步者等蓝牙耳机 | 改 `devices.ps1` 一处 |
| 3 | `Windows.Gaming.Input` | 能，照 MIT 项目 | Xbox One / Series 手柄 | 小 |
| 4 | 手柄输入报告 | 能，照 MIT 项目 | DualSense / DualSense Edge / DS4 | 小 |
| 5 | 罗技 HID++ | 要一条 HID 通道 | MX Master 3、G Pro、G915、PRO X Wireless | 中（需设备） |
| 6 | 厂商私有 HID | 不能照搬，只能自己抓 | 雷蛇、赛睿、海盗船、HyperX、Glorious | 高（需设备 + 许可证评估） |
| — | 纯 2.4G 无属性 dongle | 做不了 | 杂牌 | 只能显示「已连接」 |

**这一轮就能落地的是 1 和 2**：修 `devices.ps1` 的两个缺口（补扫 HFP AG、批量读分块），T7 GT 这类蓝牙耳机的电量就会出现在岛里，且不碰任何私有协议。

## 八、复现

```bash
# 目标设备：HID 集合 + 全部 PnP 属性（约 350 KB JSON）
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/probes/peripheral-battery.ps1 `
  -Match "36F9|50C0F030EA61|crociris" -All > t7gt.json

# 换一台设备照样用：-Match 匹配 FriendlyName 或 InstanceId
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/probes/peripheral-battery.ps1 -Match "AZOTH|0B05" -All
```

脚本只读：不改注册表、不写设备、不打开任何写入通道。
