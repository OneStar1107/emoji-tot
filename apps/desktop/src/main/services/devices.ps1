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
# Cost, and why the reads are batched
# -----------------------------------
# Enumerating four classes costs ~1s and reading one property used to cost
# ~1.8s per node. Get-PnpDeviceProperty accepts an array of instance ids and
# reads one key for all of them in a single pass, so a ~100-node sweep now
# costs ~1.3s instead of three minutes. The sweep still runs every five
# minutes: a battery percentage does not change faster.
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8

$BATTERY_KEY = '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2'
$SWEEP_MS = 300000

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

while ($true) {
  # ---- enumerate -----------------------------------------------------------
  $btNodes = @()
  foreach ($node in (Get-PnpDevice -Class Bluetooth -PresentOnly -ErrorAction SilentlyContinue)) {
    $name = [string]$node.FriendlyName
    if (-not $name) { continue }
    if (-not (Test-IsDevice $name)) { continue }
    $btNodes += [pscustomobject]@{ name = $name; status = [string]$node.Status; id = [string]$node.InstanceId }
  }

  $hidNodes = @()
  foreach ($node in (Get-PnpDevice -Class HIDClass, Mouse, Keyboard -PresentOnly -ErrorAction SilentlyContinue)) {
    $id = [string]$node.InstanceId
    # Only real HID/USB nodes: BTHLEDEVICE, ACPI, VHF and ROOT ids are driver
    # plumbing and the Bluetooth pass already covers the device they belong to.
    if ($id -notmatch '^(HID|USB)\\') { continue }
    $hidNodes += [pscustomobject]@{ name = [string]$node.FriendlyName; status = [string]$node.Status; id = $id }
  }

  # ---- one batched battery read for every node -----------------------------
  $ids = @(@($btNodes) + @($hidNodes) | ForEach-Object { $_.id } | Where-Object { $_ })
  $battery = @{}
  if ($ids.Count -gt 0) {
    foreach ($prop in (Get-PnpDeviceProperty -InstanceId $ids -KeyName $BATTERY_KEY -ErrorAction SilentlyContinue)) {
      if ($null -eq $prop.Data -or "$($prop.Data)" -eq '') { continue }
      $parsed = 0
      if ([int]::TryParse("$($prop.Data)", [ref]$parsed)) { $battery[[string]$prop.InstanceId] = $parsed }
    }
  }

  # ---- WMI is the fallback name/status source ------------------------------
  $wmiStatus = @{}
  foreach ($entity in (Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue)) {
    $pnp = [string]$entity.PNPDeviceID
    if ($pnp) { $wmiStatus[$pnp] = [string]$entity.Status }
  }

  # ---- one row per device -------------------------------------------------
  $list = @()
  $seen = @{}

  foreach ($node in $btNodes) {
    if ($seen.ContainsKey($node.name)) { continue }
    $seen[$node.name] = $true
    $level = $null
    if ($battery.ContainsKey($node.id)) { $level = $battery[$node.id] }
    $status = $node.status
    if (-not $status -and $wmiStatus.ContainsKey($node.id)) { $status = $wmiStatus[$node.id] }
    $list += [pscustomobject]@{ name = $node.name; status = $status; battery = $level; source = 'bluetooth' }
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
    $status = $group.status
    if (-not $status -and $group.ids.Count -gt 0 -and $wmiStatus.ContainsKey($group.ids[0])) {
      $status = $wmiStatus[$group.ids[0]]
    }
    $list += [pscustomobject]@{ name = $name; status = $status; battery = $level; source = (Get-SourceKind $name) }
  }

  [pscustomobject]@{
    ts      = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    devices = $list
  } | ConvertTo-Json -Compress -Depth 4
  Start-Sleep -Milliseconds $SWEEP_MS
}
