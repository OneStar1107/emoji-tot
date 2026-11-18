# Bluetooth devices and their battery level.
#
# Windows exposes no "connected devices" API to a desktop app, but PnP does:
# every paired device is a node, and most publish a battery level through
# DEVPKEY_Bluetooth_Battery. Two costs shape this script:
#
#   * enumerating the class takes ~2s and returns ~45 nodes, mostly services;
#   * reading one battery property takes ~1.8s.
#
# So services are filtered out before any property is read, and the whole sweep
# runs every five minutes — a battery percentage does not change faster.
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8

$BATTERY_KEY = '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2'
$SWEEP_MS = 300000

function Test-IsDevice([string]$name) {
  $noise = @('Service', 'Enumerator', 'Generic Attribute', 'Generic Access', 'RFCOMM', 'Device Information', 'Bluetooth LE', 'Avrcp', 'Wireless Bluetooth')
  foreach ($word in $noise) {
    if ($name -like "*$word*") { return $false }
  }
  return $true
}

while ($true) {
  $list = @()
  $nodes = Get-PnpDevice -Class Bluetooth -PresentOnly -ErrorAction SilentlyContinue
  foreach ($node in $nodes) {
    $name = [string]$node.FriendlyName
    if (-not $name) { continue }
    if (-not (Test-IsDevice $name)) { continue }
    $level = $null
    $prop = Get-PnpDeviceProperty -InstanceId $node.InstanceId -KeyName $BATTERY_KEY -ErrorAction SilentlyContinue
    if ($prop -and $null -ne $prop.Data -and "$($prop.Data)" -ne '') {
      $parsed = 0
      if ([int]::TryParse("$($prop.Data)", [ref]$parsed)) { $level = $parsed }
    }
    $list += [pscustomobject]@{
      name    = $name
      status  = [string]$node.Status
      battery = $level
    }
  }
  [pscustomobject]@{
    ts      = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    devices = $list
  } | ConvertTo-Json -Compress -Depth 4
  Start-Sleep -Milliseconds $SWEEP_MS
}
