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
#   1. phase "list"    - who is connected, battery null. One
#                        Get-CimInstance Win32_PnPEntity call (~1.0s) is the
#                        only enumeration: it returns the same instance ids and
#                        the same friendly names as the four Get-PnpDevice
#                        calls it replaces (measured: 45/45 Bluetooth, 53/53
#                        HID, 1/1 HFP node, 0 name differences on 178 nodes).
#   2. phase "battery" - the same rows with the batched battery property read.
#
# The reader merges the vendor probe (device-battery.ps1) on top of a null
# level, so a receiver's number can still land between or after these two.
#
# Cost, and why the reads are batched
# -----------------------------------
# Reading one property used to cost ~1.8s per node. Get-PnpDeviceProperty
# accepts an array of instance ids and reads one key for all of them in a single
# pass, so a ~100-node sweep costs ~2.5s instead of three minutes. The sweep
# still runs every five minutes: a battery percentage does not change faster.
#
# One warm-up sweep after start
# -----------------------------
# Right after logon a Bluetooth device is still connecting and its PnP
# properties can be missing, which is exactly when the app starts. The first
# interval is therefore short ($WARMUP_MS) so a second full sweep lands 20s
# later; every later interval is the five-minute clock.
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8

$BATTERY_KEY = '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2'
$SWEEP_MS = 300000
# One catch-up sweep this soon after the child starts, then the five-minute clock.
$WARMUP_MS = 20000

# Bluetooth nodes that describe a protocol service, not a device.
$NOISE = @('Service', 'Enumerator', 'Generic Attribute', 'Generic Access', 'RFCOMM', 'Device Information', 'Bluetooth LE', 'Avrcp', 'Wireless Bluetooth')

# HID nodes that are driver plumbing or a generic driver name. A row called
# "HID-compliant mouse" answers nothing, and listing one per collection column
# buried the device the user actually plugged in.
$HID_NOISE = @(
  'Virtual HID', 'VHF', 'TENCENT', 'I2C HID', 'Microsoft Input Configuration',
  'HID Keyboard Device', 'USB Input Device',
  'Bluetooth LE XINPUT compatible input device',
  'Bluetooth Low Energy GATT compliant HID device'
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

function Test-IsDevice([string]$name) {
  foreach ($word in $NOISE) {
    if ($name -like "*$word*") { return $false }
  }
  return $true
}

function Test-IsHidDevice([string]$name) {
  if (-not $name) { return $false }
  # Every generic driver name starts with this: HID-compliant mouse, keyboard,
  # vendor-defined device, wireless radio controls, phone. None of them names
  # the thing the user plugged in.
  if ($name -like 'HID-compliant*') { return $false }
  foreach ($word in $HID_NOISE) {
    if ($name -like "*$word*") { return $false }
  }
  return $true
}

function Get-SourceKind([string]$name) {
  foreach ($word in $WIRELESS) {
    if ($name -like "*$word*") { return 'hid-wireless' }
  }
  return 'hid'
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
  # ---- enumerate: one WMI call, no property reads --------------------------
  $btNodes = @()
  $hidNodes = @()
  $hfpBattery = @{}
  foreach ($entity in (Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue)) {
    $id = [string]$entity.PNPDeviceID
    if (-not $id) { continue }
    $name = [string]$entity.Name
    if ([string]$entity.PNPClass -eq 'Bluetooth') {
      if (-not $name) { continue }
      if (-not (Test-IsDevice $name)) { continue }
      $btNodes += [pscustomobject]@{ name = $name; status = [string]$entity.Status; id = $id }
      continue
    }
    # Some headsets publish their level on the Hands-Free (HFP) node instead of
    # the Bluetooth one: the T7 GT reports 100% on BTHENUM\{0000111E}, which the
    # Bluetooth class does not list. Collect those and match them by MAC.
    if ($id -match 'BTHENUM\\\{0000111E') {
      $mac = Get-Mac $id
      if ($mac) { $hfpBattery[$mac] = $id }
      continue
    }
    if ([string]$entity.PNPClass -in @('HIDClass', 'Mouse', 'Keyboard')) {
      # Only real HID/USB nodes: BTHLEDEVICE, ACPI, VHF and ROOT ids are driver
      # plumbing and the Bluetooth pass already covers the device they belong to.
      if ($id -notmatch '^(HID|USB)\\') { continue }
      $hidNodes += [pscustomobject]@{ name = $name; status = [string]$entity.Status; id = $id }
    }
  }

  # ---- phase 1: the list, so the page can draw it now ----------------------
  Write-Rows 'list' (Build-List $btNodes $hidNodes $hfpBattery @{})

  # ---- phase 2: one batched battery read for every node --------------------
  $ids = @(@($btNodes) + @($hidNodes) | ForEach-Object { $_.id } | Where-Object { $_ })
  $battery = @{}
  $probe = @($ids) + @($hfpBattery.Values)
  # Get-PnpDeviceProperty silently returns nothing when the array is large
  # (341 ids measured: 0 rows in 15ms), so the reads go in blocks of 100.
  for ($i = 0; $i -lt $probe.Count; $i += 100) {
    $block = $probe[$i..([Math]::Min($i + 99, $probe.Count - 1))]
    foreach ($prop in (Get-PnpDeviceProperty -InstanceId $block -KeyName $BATTERY_KEY -ErrorAction SilentlyContinue)) {
      if ($null -eq $prop.Data -or "$($prop.Data)" -eq '') { continue }
      $parsed = 0
      if ([int]::TryParse("$($prop.Data)", [ref]$parsed)) { $battery[[string]$prop.InstanceId] = $parsed }
    }
  }

  Write-Rows 'battery' (Build-List $btNodes $hidNodes $hfpBattery $battery)

  Start-Sleep -Milliseconds $delay
  $delay = $SWEEP_MS
}
