# Native pnputil XML helpers.
#
# `Get-PnpDeviceProperty` can spend tens of seconds initialising its PowerShell
# property provider. `pnputil /properties` returns the same Bluetooth battery
# property in a few hundred milliseconds, so the hot path parses its XML here.

$script:BATTERY_PROPERTY_KEY = '{104ea319-6ee2-4701-bd47-8ddbf425bbe5}[2]'

function Get-PnpBatteryLevel($device) {
  if ($null -eq $device) { return $null }
  $property = @(
    $device.Properties.Property |
      Where-Object { [string]$_.Key -eq $script:BATTERY_PROPERTY_KEY } |
      Select-Object -First 1
  )
  if (-not $property.Count) { return $null }

  $raw = [string]$property[0].Value
  if (-not $raw) { return $null }

  $level = $null
  if ($raw -match '^0x([0-9A-Fa-f]{1,2})$') {
    $level = [Convert]::ToInt32($matches[1], 16)
  } elseif (-not [int]::TryParse($raw, [ref]$level)) {
    return $null
  }
  if ($level -lt 0 -or $level -gt 100) { return $null }
  return $level
}

if (-not ('EmojiTot.DeviceProperties' -as [type])) {
  Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace EmojiTot {
  public static class DeviceProperties {
    [StructLayout(LayoutKind.Sequential)]
    struct DevicePropertyKey {
      public Guid FormatId;
      public uint PropertyId;
    }

    [DllImport("cfgmgr32.dll", CharSet = CharSet.Unicode)]
    static extern int CM_Locate_DevNodeW(out uint deviceInstance, string deviceId, uint flags);

    [DllImport("cfgmgr32.dll")]
    static extern int CM_Get_DevNode_PropertyW(
      uint deviceInstance,
      ref DevicePropertyKey propertyKey,
      out uint propertyType,
      byte[] buffer,
      ref uint size,
      uint flags
    );

    public static int? ReadBattery(string deviceId) {
      if (String.IsNullOrEmpty(deviceId)) return null;

      uint deviceInstance;
      if (CM_Locate_DevNodeW(out deviceInstance, deviceId, 0) != 0) return null;

      var propertyKey = new DevicePropertyKey();
      propertyKey.FormatId = new Guid("104EA319-6EE2-4701-BD47-8DDBF425BBE5");
      propertyKey.PropertyId = 2;

      uint propertyType = 0;
      uint size = 16;
      var buffer = new byte[16];
      if (CM_Get_DevNode_PropertyW(deviceInstance, ref propertyKey, out propertyType, buffer, ref size, 0) != 0) {
        return null;
      }

      int level;
      if (propertyType == 3 && size >= 1) level = buffer[0];
      else if (propertyType == 4 && size >= 2) level = BitConverter.ToUInt16(buffer, 0);
      else if (propertyType == 5 && size >= 4) level = (int)BitConverter.ToUInt32(buffer, 0);
      else return null;

      return level >= 0 && level <= 100 ? level : (int?)null;
    }
  }
}
'@
}

function Get-PnpDevNodeBattery([string]$deviceId) {
  if (-not $deviceId) { return $null }
  return [EmojiTot.DeviceProperties]::ReadBattery($deviceId)
}
