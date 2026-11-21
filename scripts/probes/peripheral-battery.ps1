# Peripheral battery probe - what Windows is willing to say about a device.
#
#   peripheral-battery.ps1 -Match "crociris|T7"        # HID collections + PnP nodes
#   peripheral-battery.ps1 -Match "crociris" -All      # ... plus every PnP property
#
# The island only gets a percentage when Windows publishes one. Two families
# publish it, and they sit in different places:
#
#   * Bluetooth LE nodes (BTHLE) and a few classic nodes carry
#     DEVPKEY_Bluetooth_Battery ({104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2);
#   * a classic headset that reports over HFP publishes the same key on its
#     Hands-Free AG node, whose PnP class is System, not Bluetooth - a scan that
#     only asks for -Class Bluetooth misses it entirely.
#
# HID collections are listed with their top-level usage page/usage, which is
# how a vendor-defined battery report would show up (page 0x06 usage 0x20 is
# the standard Battery Strength usage). A collection that has no such usage and
# no DEVPKEY cannot be read by Windows at all - the level, if the device has
# one, lives behind a vendor protocol that this script does not guess.
param(
  [string]$Match = "",
  [switch]$All
)

$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class HidCollections
{
  [StructLayout(LayoutKind.Sequential)]
  public struct SP_DEVICE_INTERFACE_DATA
  {
    public int cbSize;
    public Guid InterfaceClassGuid;
    public int Flags;
    public IntPtr Reserved;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct HIDD_ATTRIBUTES
  {
    public int Size;
    public ushort VendorID;
    public ushort ProductID;
    public ushort VersionNumber;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct HIDP_CAPS
  {
    public ushort Usage;
    public ushort UsagePage;
    public ushort InputReportByteLength;
    public ushort OutputReportByteLength;
    public ushort FeatureReportByteLength;
    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 17)] public ushort[] Reserved;
    public ushort NumberLinkCollectionNodes;
    public ushort NumberInputButtonCaps;
    public ushort NumberInputValueCaps;
    public ushort NumberInputDataIndices;
    public ushort NumberOutputButtonCaps;
    public ushort NumberOutputValueCaps;
    public ushort NumberOutputDataIndices;
    public ushort NumberFeatureButtonCaps;
    public ushort NumberFeatureValueCaps;
    public ushort NumberFeatureDataIndices;
  }

  [DllImport("setupapi.dll", CharSet = CharSet.Auto, SetLastError = true)]
  static extern IntPtr SetupDiGetClassDevs(ref Guid classGuid, IntPtr enumerator, IntPtr parent, int flags);
  [DllImport("setupapi.dll", CharSet = CharSet.Auto, SetLastError = true)]
  static extern bool SetupDiEnumDeviceInterfaces(IntPtr set, IntPtr info, ref Guid classGuid, int index, ref SP_DEVICE_INTERFACE_DATA data);
  [DllImport("setupapi.dll", CharSet = CharSet.Auto, SetLastError = true)]
  static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr set, ref SP_DEVICE_INTERFACE_DATA data, IntPtr detail, int detailSize, ref int required, IntPtr info);
  [DllImport("setupapi.dll", SetLastError = true)]
  static extern bool SetupDiDestroyDeviceInfoList(IntPtr set);
  [DllImport("hid.dll")]
  static extern void HidD_GetHidGuid(out Guid guid);
  [DllImport("hid.dll", SetLastError = true)]
  static extern bool HidD_GetAttributes(IntPtr device, ref HIDD_ATTRIBUTES attributes);
  [DllImport("hid.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool HidD_GetProductString(IntPtr device, StringBuilder buffer, int length);
  [DllImport("hid.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool HidD_GetManufacturerString(IntPtr device, StringBuilder buffer, int length);
  [DllImport("hid.dll")]
  static extern bool HidD_GetPreparsedData(IntPtr device, ref IntPtr preparsed);
  [DllImport("hid.dll")]
  static extern bool HidD_FreePreparsedData(IntPtr preparsed);
  [DllImport("hid.dll")]
  static extern int HidP_GetCaps(IntPtr preparsed, ref HIDP_CAPS caps);
  [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  static extern IntPtr CreateFile(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
  [DllImport("kernel32.dll")]
  static extern bool CloseHandle(IntPtr handle);

  static IntPtr Open(string path, uint access)
  {
    IntPtr handle = CreateFile(path, access, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
    if (handle.ToInt64() == -1) return IntPtr.Zero;
    return handle;
  }

  public static string[] Enumerate()
  {
    List<string> rows = new List<string>();
    Guid hidGuid;
    HidD_GetHidGuid(out hidGuid);
    IntPtr set = SetupDiGetClassDevs(ref hidGuid, IntPtr.Zero, IntPtr.Zero, 0x12);
    if (set.ToInt64() == -1) return rows.ToArray();
    SP_DEVICE_INTERFACE_DATA data = new SP_DEVICE_INTERFACE_DATA();
    data.cbSize = Marshal.SizeOf(typeof(SP_DEVICE_INTERFACE_DATA));
    for (int index = 0; SetupDiEnumDeviceInterfaces(set, IntPtr.Zero, ref hidGuid, index, ref data); index++)
    {
      int required = 0;
      SetupDiGetDeviceInterfaceDetail(set, ref data, IntPtr.Zero, 0, ref required, IntPtr.Zero);
      if (required <= 0) continue;
      IntPtr buffer = Marshal.AllocHGlobal(required);
      Marshal.WriteInt32(buffer, IntPtr.Size == 8 ? 8 : 6);
      bool ok = SetupDiGetDeviceInterfaceDetail(set, ref data, buffer, required, ref required, IntPtr.Zero);
      string path = ok ? Marshal.PtrToStringUni(new IntPtr(buffer.ToInt64() + 4)) : "";
      Marshal.FreeHGlobal(buffer);
      if (path == "") continue;

      IntPtr handle = Open(path, 0x80000000);
      if (handle == IntPtr.Zero) handle = Open(path, 0);
      if (handle == IntPtr.Zero) continue;

      HIDD_ATTRIBUTES attributes = new HIDD_ATTRIBUTES();
      attributes.Size = Marshal.SizeOf(typeof(HIDD_ATTRIBUTES));
      bool hasAttributes = HidD_GetAttributes(handle, ref attributes);

      IntPtr preparsed = IntPtr.Zero;
      HIDP_CAPS caps = new HIDP_CAPS();
      caps.Reserved = new ushort[17];
      bool hasCaps = false;
      if (HidD_GetPreparsedData(handle, ref preparsed))
      {
        hasCaps = HidP_GetCaps(preparsed, ref caps) >= 0;
        HidD_FreePreparsedData(preparsed);
      }

      StringBuilder product = new StringBuilder(260);
      HidD_GetProductString(handle, product, product.Capacity * 2);
      StringBuilder vendor = new StringBuilder(260);
      HidD_GetManufacturerString(handle, vendor, vendor.Capacity * 2);
      CloseHandle(handle);

      rows.Add(string.Join("|", new string[] {
        hasAttributes ? attributes.VendorID.ToString("X4") : "",
        hasAttributes ? attributes.ProductID.ToString("X4") : "",
        hasAttributes ? attributes.VersionNumber.ToString("X4") : "",
        hasCaps ? caps.UsagePage.ToString("X4") : "",
        hasCaps ? caps.Usage.ToString("X4") : "",
        hasCaps ? caps.InputReportByteLength.ToString() : "",
        hasCaps ? caps.FeatureReportByteLength.ToString() : "",
        product.ToString(),
        vendor.ToString(),
        path
      }));
    }
    SetupDiDestroyDeviceInfoList(set);
    return rows.ToArray();
  }
}
"@

$BATTERY_KEY = "{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2"

function Get-Level([string]$instanceId) {
  $prop = Get-PnpDeviceProperty -InstanceId $instanceId -KeyName $BATTERY_KEY -ErrorAction SilentlyContinue
  if ($null -eq $prop -or $null -eq $prop.Data -or "$($prop.Data)" -eq "") { return $null }
  $value = 0
  if ([int]::TryParse("$($prop.Data)", [ref]$value)) { return $value }
  return $null
}

function Get-HidRows {
  $rows = @()
  foreach ($line in [HidCollections]::Enumerate()) {
    $parts = $line.Split("|")
    if ($parts.Count -lt 10) { continue }
    $rows += [pscustomobject][ordered]@{
      vid          = $parts[0]
      pid          = $parts[1]
      version      = $parts[2]
      usagePage    = $parts[3]
      usage        = $parts[4]
      inputBytes   = $parts[5]
      featureBytes = $parts[6]
      product      = $parts[7]
      vendor       = $parts[8]
      path         = $parts[9]
    }
  }
  return $rows
}

$hid = @(Get-HidRows)
if ($Match) {
  $hid = @($hid | Where-Object { ($_.product + " " + $_.vendor + " " + $_.path) -match $Match })
}

$nodes = @()
if ($Match) {
  $nodes = @(Get-PnpDevice -PresentOnly | Where-Object {
    ($_.FriendlyName + " " + $_.InstanceId) -match $Match
  })
}

$nodeRows = @()
foreach ($node in $nodes) {
  $row = [ordered]@{
    class      = [string]$node.Class
    status     = [string]$node.Status
    name       = [string]$node.FriendlyName
    instance   = [string]$node.InstanceId
    battery    = (Get-Level $node.InstanceId)
  }
  if ($All) {
    $props = @(Get-PnpDeviceProperty -InstanceId $node.InstanceId -ErrorAction SilentlyContinue)
    $row.propertyCount = $props.Count
    $row.properties = @($props | ForEach-Object { [pscustomobject][ordered]@{
      key  = [string]$_.KeyName
      type = [string]$_.TypeName
      data = ("$($_.Data)")
    } })
  }
  $nodeRows += [pscustomobject]$row
}

$batteryUsages = @($hid | Where-Object { $_.usagePage -eq "0006" -and $_.usage -eq "0020" })

[pscustomobject][ordered]@{
  ts            = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  match         = $Match
  hidCollections = $hid
  nodes         = $nodeRows
  batteryUsageCollections = $batteryUsages.Count
} | ConvertTo-Json -Depth 8

