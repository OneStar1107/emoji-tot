# Paired Bluetooth devices and HID / 2.4G peripherals, with whatever battery
# level Windows is willing to publish.
#
# Why the list is bigger than "Bluetooth"
# ---------------------------------------
# Windows has no "connected devices" API for a desktop app, but PnP does: every
# paired device and every HID collection is a node. Two families publish a
# level:
#
#   * Bluetooth (BTHLE nodes) - DEVPKEY_Bluetooth_Battery;
#   * some HID collections - the standard HID "Battery Strength" usage, when a
#     driver forwards it as a device property.
#
# A 2.4G receiver (Logitech Unifying/Lightspeed, SteelSeries, Razer, Corsair)
# usually publishes neither: its level lives behind a vendor HID++ or feature
# report that is not part of the Windows property model. Those devices are
# still listed - "the receiver is here" is a real answer - with battery null and
# a source that says why the number is missing. The page draws an em dash and
# puts the source in the row's title.
#
# Two lines per sweep, and why
# ----------------------------
# Cold start used to show an empty devices page until the first line arrived,
# and that line was the whole sweep: enumeration (~4s, three Get-PnpDevice
# calls) plus a batched property read (~2.5s) plus WMI status (~1.2s) measured
# ~10s warm and ~25s on the first run after boot. The page cannot wait that
# long for a list it could already draw.
#
# So one sweep prints twice, and the reader replaces its list per line:
#
#   1. phase "list"    - who is connected, battery null. Four class-filtered
#                        `pnputil /enum-devices /connected` calls cost ~0.7s
#                        combined, compared with a cold WMI sweep that can stall
#                        for a minute while the service starts.
#   2. phase "battery" - the same rows with the batched battery property read.
#
# The reader merges the vendor probe (device-battery.ps1) on top of a null
# level, so a receiver's number can still land between or after these two.
#
# Cost, and why the reads are batched
# -----------------------------------
# `pnputil /properties` includes the Bluetooth battery value in the same native
# class query. The old PowerShell property cmdlet could spend 30-40s setting up
# its provider on a cold child, even with only five device ids. The resident HFP
# node uses the direct Config Manager property API in devices-pnp.ps1; both
# paths finish in about a second on the reference machine.
#
# One warm-up sweep after start
# -----------------------------
# Right after logon a Bluetooth device is still connecting and its PnP
# properties can be missing, which is exactly when the app starts. The first
# interval is therefore short ($WARMUP_MS) so a second full sweep lands 20s
# later; every later interval is the five-minute clock.
param([switch]$Once)

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8
. (Join-Path $PSScriptRoot 'devices-pnp.ps1')

$SWEEP_MS = 300000
# One catch-up sweep this soon after the child starts, then the five-minute clock.
$WARMUP_MS = 20000

# Windows exposes a paired device as a top-level BTHLE\Dev_* or BTHENUM\Dev_*
# node. The same Bluetooth class also contains every GATT service, protocol
# transport, enumerator and the local radio adapter. Those nodes are plumbing,
# not peripherals, so only the top-level paired-device nodes become rows.
$BLUETOOTH_NOISE = @(
  '^Bluetooth Device$', '^Bluetooth LE Device$',
  '^\u84DD\u7259\u8BBE\u5907$', '^\u84DD\u7259 LE \u8BBE\u5907$',
  # Smart speakers are paired audio endpoints, not computer peripherals.
  'Speaker', '\u97F3\u7BB1', '\u97F3\u54CD', '\u626C\u58F0\u5668', '\u56DE\u97F3\u58C1',
  # Phones are paired endpoints too. Word boundaries keep "Headphone" visible.
  '(?<![A-Za-z])Phone(?![A-Za-z])', 'iPhone', 'Smartphone', '\u624B\u673A'
)

# HID nodes that are driver plumbing or a generic driver name. A row called
# "HID-compliant mouse" answers nothing, and listing one per collection column
# buried the device the user actually plugged in.
$HID_GENERIC_PREFIX = @('^HID-compliant', '^\u7B26\u5408 HID \u6807\u51C6')
$HID_NOISE = @(
  'Virtual HID', 'VHF', 'TENCENT', 'I2C HID', 'Microsoft Input Configuration',
  'HID Keyboard Device', 'USB Input Device',
  '^USB \u8F93\u5165\u8BBE\u5907$',
  'Bluetooth LE XINPUT compatible input device',
  '^\u84DD\u7259 LE XINPUT \u517C\u5BB9\u7684\u8F93\u5165\u8BBE\u5907$',
  'Bluetooth Low Energy GATT compliant HID device',
  '^\u7B26\u5408\u84DD\u7259\u4F4E\u80FD\u8017 GATT \u7684 HID \u8BBE\u5907$'
)

# A vendor whose receiver has no named node of its own still deserves a row.
$VENDORS = @{
  '046D' = 'Logitech'
  '0B05' = 'ASUS'
  '1038' = 'SteelSeries'
  '1532' = 'Razer'
  '1B1C' = 'Corsair'
  '1E7D' = 'ROCCAT'
  '045E' = 'Microsoft'
  '258A' = 'SINO WEALTH'
}

$WIRELESS = @('Receiver', 'Wireless', 'WIRELESS', '2.4G', 'Lightspeed', 'LIGHTSPEED', 'Unifying', 'Bolt', 'Dongle', 'DONGLE')

function Test-IsBluetoothPeripheral([string]$id, [string]$name) {
  if ($id -notmatch '^(BTHLE|BTHENUM)\\Dev_') { return $false }
  foreach ($pattern in $BLUETOOTH_NOISE) {
    if ($name -match $pattern) { return $false }
  }
  return $true
}

function Test-IsHidDevice([string]$name) {
  if (-not $name) { return $false }
  # Every generic driver name starts with this: HID-compliant mouse, keyboard,
  # vendor-defined device, wireless radio controls, phone. None of them names
  # the thing the user plugged in.
  foreach ($prefix in $HID_GENERIC_PREFIX) {
    if ($name -match $prefix) { return $false }
  }
  foreach ($word in $HID_NOISE) {
    if ($name -match $word) { return $false }
  }
  return $true
}

function Get-SourceKind([string]$name) {
  foreach ($word in $WIRELESS) {
    if ($name -like "*$word*") { return 'hid-wireless' }
  }
  return 'hid'
}

# Fast, class-filtered PnP enumeration.
#
# `pnputil` writes XML in the Windows OEM code page. Reading it through the
# PowerShell pipeline decodes that as UTF-8 and turns Chinese device names into
# replacement characters, so the child is started with the OEM encoding
# explicitly. The class filter also avoids building the 300+ node WMI list.
function Get-PnpDevices([string]$className, [switch]$WithProperties) {
  $info = [Diagnostics.ProcessStartInfo]::new()
  $info.FileName = 'pnputil.exe'
  $info.Arguments = "/enum-devices /connected /class $className"
  if ($WithProperties) { $info.Arguments += ' /properties' }
  $info.Arguments += ' /format xml'
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.StandardOutputEncoding = [Text.Encoding]::GetEncoding(
    [Globalization.CultureInfo]::CurrentCulture.TextInfo.OEMCodePage
  )
  $info.StandardErrorEncoding = $info.StandardOutputEncoding

  $process = [Diagnostics.Process]::Start($info)
  $xmlText = $process.StandardOutput.ReadToEnd()
  $process.WaitForExit()
  if (-not $xmlText.Trim()) { return @() }

  try { $xml = [xml]$xmlText } catch { return @() }
  foreach ($device in @($xml.PnpUtil.Device)) {
    $status = [string]$device.Status
    if ($status -eq 'Started') { $status = 'OK' }
    [pscustomobject]@{
      id = [string]$device.InstanceId
      name = [string]$device.DeviceDescription
      status = $status
      class = [string]$device.ClassName
      battery = Get-PnpBatteryLevel $device
    }
  }
}

# The Bluetooth MAC a BTHENUM instance id encodes, or '' when there is none.
function Get-Mac([string]$id) {
  if ($id -match '([0-9A-F]{12})(?:_|$)') { return $matches[1].ToUpper() }
  return ''
}

# One row per device, in the order the page reads: Bluetooth first, then the
# HFP-only headsets, then the HID / 2.4G groups. $battery is empty on the first
# pass, which is what keeps every level null there and drops the HFP-only rows
# (a row that exists only because it has a level must not appear without one).
function Build-List($btNodes, $hidNodes, $hfpBattery, $battery) {
  $list = @()
  $seen = @{}

  foreach ($node in $btNodes) {
    if ($seen.ContainsKey($node.name)) { continue }
    $seen[$node.name] = $true
    $level = $null
    if ($battery.ContainsKey($node.id)) { $level = $battery[$node.id] }
    if ($null -eq $level) {
      # The HFP node carries the level for headsets like the T7 GT; match on MAC.
      $mac = Get-Mac $node.id
      if ($mac -and $hfpBattery.ContainsKey($mac)) {
        $hfpId = $hfpBattery[$mac]
        if ($battery.ContainsKey($hfpId)) { $level = $battery[$hfpId] }
      }
    }
    $list += [pscustomobject]@{ name = $node.name; status = $node.status; battery = $level; source = 'bluetooth' }
  }

  # Headsets whose level only lives on the HFP node: give them a row of their
  # own, named after the Bluetooth device with the same MAC when there is one.
  foreach ($mac in $hfpBattery.Keys) {
    $hfpId = $hfpBattery[$mac]
    if (-not $battery.ContainsKey($hfpId)) { continue }
    $name = ''
    foreach ($node in $btNodes) { if ($node.id -match ($mac + '(?:_|$)')) { $name = $node.name; break } }
    if (-not $name) { $name = 'Bluetooth headset' }
    if ($seen.ContainsKey($name)) { continue }
    $seen[$name] = $true
    $list += [pscustomobject]@{ name = $name; status = 'OK'; battery = $battery[$hfpId]; source = 'bluetooth' }
  }

  # A peripheral is one VID/PID: it answers as several collections (mouse,
  # keyboard, vendor page), and listing each would show the same device four
  # times under four generic driver names.
  $groups = @{}
  foreach ($node in $hidNodes) {
    $vid = ''
    if ($node.id -match 'VID_([0-9A-Fa-f]{4})&PID_([0-9A-Fa-f]{4})') {
      $vid = ($matches[1] + '&' + $matches[2]).ToUpper()
    }
    if (-not $vid) { continue }
    if (-not $groups.ContainsKey($vid)) {
      $groups[$vid] = [pscustomobject]@{ name = ''; status = ''; ids = @() }
    }
    $group = $groups[$vid]
    $group.ids += $node.id
    if (-not $group.status) { $group.status = $node.status }
    if (-not $group.name -and (Test-IsHidDevice $node.name)) { $group.name = $node.name }
  }

  foreach ($vid in $groups.Keys) {
    $group = $groups[$vid]
    $name = $group.name
    if (-not $name) {
      # No named node: keep it only if the vendor is a known peripheral maker,
      # so the row still means something ("Logitech").
      if (-not $VENDORS.ContainsKey($vid.Substring(0, 4))) { continue }
      $name = $VENDORS[$vid.Substring(0, 4)]
    }
    if ($seen.ContainsKey($name)) { continue }
    $seen[$name] = $true
    $level = $null
    foreach ($id in $group.ids) {
      if ($battery.ContainsKey($id)) { $level = $battery[$id]; break }
    }
    $list += [pscustomobject]@{ name = $name; status = $group.status; battery = $level; source = (Get-SourceKind $name) }
  }

  return , $list
}

# One JSON line per phase. The reader replaces its whole list per line, so this
# is a complete answer, not a delta.
function Write-Rows([string]$phase, $list) {
  $rows = @()
  foreach ($row in $list) {
    $rows += [pscustomobject]@{ name = $row.name; status = $row.status; battery = $row.battery; source = $row.source }
  }
  [pscustomobject]@{
    phase   = $phase
    ts      = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    devices = @($rows)
  } | ConvertTo-Json -Compress -Depth 4
}

# The first wait is the catch-up sweep; every wait after it is the clock.
$delay = $WARMUP_MS

while ($true) {
  # ---- enumerate: native pnputil properties, no PowerShell WMI provider ---
  $btNodes = @()
  $hidNodes = @()
  $hfpBattery = @{}
  $battery = @{}
  $nodes = @()
  foreach ($className in @('Bluetooth', 'HIDClass', 'Mouse', 'Keyboard')) {
    $nodes += @(Get-PnpDevices $className -WithProperties)
  }
  $systemNodes = @(Get-PnpDevices 'System')
  $seenIds = @{}
  foreach ($entity in $nodes) {
    $id = [string]$entity.id
    if (-not $id) { continue }
    if ($seenIds.ContainsKey($id)) { continue }
    $seenIds[$id] = $true
    $name = [string]$entity.Name
    if ([string]$entity.class -eq 'Bluetooth') {
      if (-not $name) { continue }
      if (-not (Test-IsBluetoothPeripheral $id $name)) { continue }
      $btNodes += [pscustomobject]@{ name = $name; status = [string]$entity.Status; id = $id }
      if ($null -ne $entity.battery) { $battery[$id] = [int]$entity.battery }
      continue
    }
    if ([string]$entity.class -in @('HIDClass', 'Mouse', 'Keyboard')) {
      # Only real HID/USB nodes: BTHLEDEVICE, ACPI, VHF and ROOT ids are driver
      # plumbing and the Bluetooth pass already covers the device they belong to.
      if ($id -notmatch '^(HID|USB)\\') { continue }
      $hidNodes += [pscustomobject]@{ name = $name; status = [string]$entity.Status; id = $id }
      if ($null -ne $entity.battery) { $battery[$id] = [int]$entity.battery }
    }
  }

  # Some headsets publish their level on the Hands-Free (HFP) node in the
  # System class instead of their Bluetooth node. pnputil omits this property,
  # so the single HFP node gets one direct property read; all other levels were
  # already collected in the native class sweep above.
  foreach ($entity in $systemNodes) {
    $id = [string]$entity.id
    if ($id -match 'BTHENUM\\\{0000111E') {
      $mac = Get-Mac $id
      if ($mac) { $hfpBattery[$mac] = $id }
    }
  }

  # Phase 1 paints immediately with every native PnP level. It is still named
  # "list" so the renderer can retain the last known HFP level while that one
  # targeted read completes.
  Write-Rows 'list' (Build-List $btNodes $hidNodes $hfpBattery $battery)

  foreach ($hfpId in $hfpBattery.Values) {
    $level = Get-PnpDevNodeBattery $hfpId
    if ($null -ne $level) { $battery[[string]$hfpId] = [int]$level }
  }

  Write-Rows 'battery' (Build-List $btNodes $hidNodes $hfpBattery $battery)

  if ($Once) { break }
  Start-Sleep -Milliseconds $delay
  $delay = $SWEEP_MS
}
