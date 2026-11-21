# Battery levels that Windows does not publish: the vendor protocols behind a
# 2.4 GHz receiver. One-shot probe, run when devices.ps1 has nothing to say about a
# device's level; prints one JSON line and exits.
#
# Why PowerShell: the three exchanges are raw HID reads, and PowerShell reaches
# them through P/Invoke with no dependency and no native build. This pair of files
# (device-battery.ps1 + device-battery-hid.cs) is the whole reader: Logitech HID++
# 2.0, Razer's feature report, ASUS ROG's output report. Read-only - the only
# packets sent are battery queries. Protocols and sources: docs/DEVICE-BATTERY.md.
#
# Every failure is silent: an unopenable collection, a sleeping device and a brand
# we do not implement all end the same way - no row, so devices.js keeps battery
# null and the page keeps drawing an em dash.
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8

$HID_SOURCE = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

/* Raw HID access for the three vendor protocols. Read-only by construction: the
 * only entry points are an output-report exchange and a feature-report exchange,
 * and every caller sends a battery query. Nothing here writes device settings. */
public static class DevBattHid {
  [DllImport("cfgmgr32.dll", CharSet=CharSet.Unicode)]
  static extern uint CM_Get_Device_Interface_List_SizeW(out uint len, ref Guid guid, string devId, uint flags);
  [DllImport("cfgmgr32.dll", CharSet=CharSet.Unicode)]
  static extern uint CM_Get_Device_Interface_ListW(ref Guid guid, string devId, [Out] char[] buf, uint len, uint flags);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern SafeFileHandle CreateFileW(string path, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool WriteFile(SafeFileHandle h, byte[] buf, uint n, out uint written, IntPtr ov);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool ReadFile(SafeFileHandle h, byte[] buf, uint n, out uint read, IntPtr ov);
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  static extern IntPtr CreateEventW(IntPtr attrs, bool manual, bool initial, string name);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool GetOverlappedResult(SafeFileHandle h, IntPtr ov, out uint got, bool wait);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool ResetEvent(IntPtr h);
  [DllImport("hid.dll")]
  static extern bool HidD_GetPreparsedData(SafeFileHandle h, out IntPtr pp);
  [DllImport("hid.dll")]
  static extern int HidP_GetCaps(IntPtr pp, byte[] caps);
  [DllImport("hid.dll")]
  static extern bool HidD_FreePreparsedData(IntPtr pp);
  [DllImport("hid.dll")]
  static extern bool HidD_SetFeature(SafeFileHandle h, byte[] buf, uint n);
  [DllImport("hid.dll")]
  static extern bool HidD_GetFeature(SafeFileHandle h, byte[] buf, uint n);

  const uint ERROR_IO_PENDING = 997;
  const uint SHARE_ALL = 3;
  static readonly IntPtr NO_OVERLAP = IntPtr.Zero;

  static SafeFileHandle Open(string path, uint flags) {
    return CreateFileW(path, 0xC0000000u, SHARE_ALL, IntPtr.Zero, 3u, flags, IntPtr.Zero);
  }

  public static string[] Paths() {
    Guid g = new Guid("4D1E55B2-F16F-11CF-88CB-001111000030");
    uint size;
    if (CM_Get_Device_Interface_List_SizeW(out size, ref g, null, 0) != 0) return new string[0];
    char[] buf = new char[size + 2];
    if (CM_Get_Device_Interface_ListW(ref g, null, buf, (uint)buf.Length, 0) != 0) return new string[0];
    return new string(buf).Split(new char[]{ (char)0 }, StringSplitOptions.RemoveEmptyEntries);
  }

  /* usagePage, usage, input length, output length, feature length; null when the
   * collection cannot be opened (another process holds it exclusively). */
  public static int[] Caps(string path) {
    SafeFileHandle h = Open(path, 0);
    if (h.IsInvalid) return null;
    try {
      IntPtr pp;
      if (!HidD_GetPreparsedData(h, out pp) || pp == IntPtr.Zero) return null;
      try {
        byte[] caps = new byte[62];
        if (HidP_GetCaps(pp, caps) != 0x00110000) return null;
        return new int[] {
          BitConverter.ToUInt16(caps, 2), BitConverter.ToUInt16(caps, 0),
          BitConverter.ToUInt16(caps, 4), BitConverter.ToUInt16(caps, 6),
          BitConverter.ToUInt16(caps, 8)
        };
      } finally { HidD_FreePreparsedData(pp); }
    } finally { h.Dispose(); }
  }

  static bool DoRead(SafeFileHandle h, IntPtr ev, IntPtr ov, int length, int timeoutMs, out byte[] data) {
    data = null;
    uint got;
    byte[] buf = new byte[length];
    ResetEvent(ev);
    Marshal.WriteIntPtr(ov, 24, ev);
    bool ok = ReadFile(h, buf, (uint)length, out got, ov);
    uint err = (uint)Marshal.GetLastWin32Error();
    if (!ok && err == ERROR_IO_PENDING) {
      if (WaitForSingleObject(ev, (uint)timeoutMs) != 0) return false;
      if (!GetOverlappedResult(h, ov, out got, false)) return false;
    } else if (!ok) return false;
    if (got == 0) return false;
    data = new byte[got];
    Array.Copy(buf, data, got);
    return true;
  }

  static bool DoWrite(SafeFileHandle h, IntPtr ev, IntPtr ov, byte[] buf, int timeoutMs) {
    uint written;
    ResetEvent(ev);
    Marshal.WriteIntPtr(ov, 24, ev);
    bool ok = WriteFile(h, buf, (uint)buf.Length, out written, ov);
    uint err = (uint)Marshal.GetLastWin32Error();
    if (!ok && err == ERROR_IO_PENDING) {
      if (WaitForSingleObject(ev, (uint)timeoutMs) != 0) return false;
      return GetOverlappedResult(h, ov, out written, false);
    }
    return ok;
  }

  /* Every report the device sends back after the request, up to attempts reads.
   * Stale reports queued before it are drained first, as G-Helper and HaloBattery
   * both do; without that an old button report is taken for the answer. */
  public static byte[][] Output(string path, byte[] request, int length, int timeoutMs, int attempts) {
    var list = new List<byte[]>();
    SafeFileHandle h = Open(path, 0x40000000u);
    if (h.IsInvalid) return list.ToArray();
    IntPtr ev = CreateEventW(IntPtr.Zero, true, false, null);
    IntPtr ov = Marshal.AllocHGlobal(32);
    try {
      byte[] junk;
      for (int i = 0; i < 16; i++) { if (!DoRead(h, ev, ov, length, 0, out junk)) break; }
      if (!DoWrite(h, ev, ov, request, timeoutMs)) return list.ToArray();
      for (int i = 0; i < attempts; i++) {
        byte[] data;
        if (!DoRead(h, ev, ov, length, timeoutMs, out data)) break;
        list.Add(data);
      }
    } finally {
      h.Dispose();
      Marshal.FreeHGlobal(ov);
    }
    return list.ToArray();
  }

  /* A feature-report exchange: SET_FEATURE then GET_FEATURE after the device
   * settles (Razer answers about 60 ms later, not instantly). */
  public static byte[] Feature(string path, byte[] request, int length, int timeoutMs, int settleMs) {
    SafeFileHandle h = Open(path, 0);
    if (h.IsInvalid) return null;
    try {
      byte[] send = new byte[length];
      Array.Copy(request, send, Math.Min(request.Length, length));
      if (!HidD_SetFeature(h, send, (uint)length)) return null;
      System.Threading.Thread.Sleep(settleMs);
      byte[] reply = new byte[length];
      if (!HidD_GetFeature(h, reply, (uint)length)) return null;
      return reply;
    } finally { h.Dispose(); }
  }
}
'@
Add-Type -TypeDefinition $HID_SOURCE -Language CSharp -ErrorAction SilentlyContinue

$script:paths = @([DevBattHid]::Paths())

# One name per VID/PID, from the same PnP source devices.ps1 uses, so the two
# lists join by name. Generic driver names are skipped: a row called
# 'HID-compliant mouse' would not match anything.
$pnp = @{}
foreach ($node in (Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue)) {
  $id = [string]$node.InstanceId
  if ($id -notmatch 'VID_([0-9A-Fa-f]{4})&PID_([0-9A-Fa-f]{4})') { continue }
  $key = ($matches[1] + ':' + $matches[2]).ToUpper()
  $name = [string]$node.FriendlyName
  if (-not $name) { continue }
  if ($name -like 'HID-compliant*') { continue }
  # A composite/input node names the driver, not the device: taking it would
  # file a ROG mouse under 'USB Input Device' and no devices.ps1 row would
  # ever match the answer.
  if ($name -in @('USB Input Device', 'USB Composite Device', 'USB 输入设备', 'USB 复合设备')) { continue }
  if (-not $pnp.ContainsKey($key)) { $pnp[$key] = $name }
}

function Get-Name([string]$key) {
  if ($pnp.ContainsKey($key)) { return $pnp[$key] }
  return $null
}

function Get-PathsFor([string]$vid, [string]$pid) {
  $needle = 'vid_' + $vid.ToLower() + '&pid_' + $pid.ToLower()
  return @($script:paths | Where-Object { $_.ToLower().Contains($needle) })
}

# ---------------------------------------------------------------------------
# ASUS ROG: output report 00 12 07; the echo comes back with the level at +4 and
# the charging flag at +9. G-Helper reads packet[5]/packet[10] of the same frame,
# with the report id still in [0]; HaloBattery drops it and reads 4/9.
# ---------------------------------------------------------------------------
function Get-AsusLevel([string]$vid, [string]$pid) {
  foreach ($path in (Get-PathsFor $vid $pid)) {
    $caps = [DevBattHid]::Caps($path)
    # The battery query lives on the vendor collection with a 65-byte output
    # report. It is 0xFF01/1 on the Gladius III and 0xFF00/1 on the Azoth, so
    # the interface number cannot be the filter (the old mi_00 test skipped the
    # first one); the caps are.
    if (-not $caps -or $caps[0] -lt 0xFF00 -or $caps[3] -lt 65) { continue }
    $length = $caps[3]
    $req = New-Object byte[] $length
    $req[0] = 0x00; $req[1] = 0x12; $req[2] = 0x07
    # A wireless mouse answers only in the short window after it wakes, and an
    # idle one answers 65 zero bytes. Three spaced attempts on the same open
    # collection catch that window far better than one; an all-zero reply then
    # falls through to the next collection instead of being read as a level.
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
      foreach ($reply in [DevBattHid]::Output($path, $req, $length, 300, 8)) {
        $at = -1
        if ($reply.Length -gt 2 -and $reply[0] -eq 0x12 -and $reply[1] -eq 0x07) { $at = 0 }
        elseif ($reply.Length -gt 3 -and $reply[0] -eq 0x00 -and $reply[1] -eq 0x12 -and $reply[2] -eq 0x07) { $at = 1 }
        if ($at -lt 0 -or ($at + 9) -ge $reply.Length) { continue }
        $level = [int]$reply[$at + 4]
        $charging = [int]$reply[$at + 9] -ne 0
        # G-Helper: level 0 without charging means standby, not an empty battery.
        if ($level -le 0 -and -not $charging) { continue }
        if ($level -gt 100) { continue }
        return @{ level = $level; charging = $charging }
      }
      Start-Sleep -Milliseconds 300
    }
  }
  return $null
}

# ---------------------------------------------------------------------------
# Razer: 90-byte feature report, command class 0x07, 0x80 = level, 0x84 =
# charging. OpenRazer builds the same packet in razer_chroma_misc_get_battery_level.
# ---------------------------------------------------------------------------
function Get-RazerLevel([string]$vid, [string]$pid, [int]$tid) {
  foreach ($path in (Get-PathsFor $vid $pid)) {
    $caps = [DevBattHid]::Caps($path)
    if (-not $caps -or $caps[4] -lt 90) { continue }
    $length = $caps[4]
    $req = New-Object byte[] $length
    $req[0] = 0x00
    $req[1] = $tid
    $req[6] = 0x07
    $req[7] = 0x80
    $req[8] = 0x02
    $crc = 0
    for ($i = 2; $i -le 87; $i++) { $crc = $crc -bxor $req[$i] }
    $req[88] = $crc
    $reply = [DevBattHid]::Feature($path, $req, $length, 300, 60)
    if (-not $reply -or $reply.Length -lt 10) { continue }
    if ($reply[0] -ne 0x02) { continue }
    if ($reply[1] -ne $tid -or $reply[6] -ne 0x07 -or $reply[7] -ne 0x80) { continue }
    $level = [int]$reply[9]
    if ($level -gt 100) { continue }
    return @{ level = $level; charging = $false }
  }
  return $null
}

# ---------------------------------------------------------------------------
# Logitech HID++ 2.0: 11 <slot> <feature> <function|swid> <params>, long report.
# Feature 0x1004 is the unified battery, 0x1000 the older status, 0x1001 the
# voltage. Protocol facts from Solaar (GPL) and HaloBattery providers/logitech.py.
# ---------------------------------------------------------------------------
$VOLTAGE_CURVE = @(
  @(4186, 100), @(4067, 90), @(3989, 80), @(3922, 70), @(3859, 60), @(3811, 50),
  @(3778, 40), @(3751, 30), @(3717, 20), @(3671, 10), @(3646, 5), @(3579, 2), @(3500, 0)
)

function Convert-MvToPercent([int]$mv) {
  if ($mv -ge $VOLTAGE_CURVE[0][0]) { return 100 }
  for ($i = 0; $i -lt ($VOLTAGE_CURVE.Count - 1); $i++) {
    $hiMv = $VOLTAGE_CURVE[$i][0]; $hiP = $VOLTAGE_CURVE[$i][1]
    $loMv = $VOLTAGE_CURVE[$i + 1][0]; $loP = $VOLTAGE_CURVE[$i + 1][1]
    if ($mv -ge $loMv) {
      return [int][Math]::Round($loP + ($mv - $loMv) * ($hiP - $loP) / ($hiMv - $loMv))
    }
  }
  return 0
}

# One HID++ request; returns @{ payload = bytes } or @{ error = code }, or null.
function Invoke-Hidpp([string]$path, [int]$length, [int]$slot, [int]$feature, [int]$function, $params) {
  $req = New-Object byte[] $length
  $req[0] = 0x11
  $req[1] = $slot
  $req[2] = $feature
  $req[3] = (($function -band 0x0F) -shl 4) -bor 0x0A
  if ($params) {
    for ($i = 0; $i -lt $params.Length -and (4 + $i) -lt $length; $i++) { $req[4 + $i] = $params[$i] }
  }
  foreach ($reply in [DevBattHid]::Output($path, $req, $length, 150, 4)) {
    if ($reply.Length -lt 4 -or $reply[0] -ne 0x11 -or $reply[1] -ne $slot) { continue }
    # Error reply: 0xFF is the HID++ 2.0 transport, 0x8F the 1.0 style one.
    if (($reply[2] -eq 0xFF -or $reply[2] -eq 0x8F) -and $reply[3] -eq $feature) {
      return @{ error = $(if ($reply.Length -gt 5) { [int]$reply[5] } else { 0xFF }) }
    }
    if ($reply[2] -ne $feature -or $reply[3] -ne $req[3]) { continue }
    $payload = New-Object byte[] ($reply.Length - 4)
    [Array]::Copy($reply, 4, $payload, 0, $payload.Length)
    return @{ payload = $payload }
  }
  return $null
}

function Get-FeatureIndex([string]$path, [int]$length, [int]$slot, [int]$featureId) {
  $params = [byte[]]@((([int]($featureId -shr 8)) -band 0xFF), ($featureId -band 0xFF), 0x00)
  $res = Invoke-Hidpp $path $length $slot 0x00 0x00 $params
  if (-not $res -or -not $res.payload -or $res.payload.Length -lt 1) { return 0 }
  $index = [int]$res.payload[0]
  if ($index -eq 0) { return 0 }
  return $index
}

function Get-LogitechLevel([string]$vid, [string]$pid) {
  foreach ($path in (Get-PathsFor $vid $pid)) {
    $caps = [DevBattHid]::Caps($path)
    if (-not $caps -or $caps[0] -ne 0xFF00) { continue }
    if ($caps[1] -ne 0x0002 -or $caps[2] -lt 20) { continue }
    $length = $caps[2]
    foreach ($slot in @(0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0xFF)) {
      $unified = Get-FeatureIndex $path $length $slot 0x1004
      if ($unified -gt 0) {
        $res = Invoke-Hidpp $path $length $slot $unified 0x01 $null
        if ($res -and $res.payload -and $res.payload.Length -ge 3) {
          $level = [int]$res.payload[0]
          $status = [int]$res.payload[2]
          if ($level -gt 0 -and $level -le 100) {
            return @{ level = $level; charging = ($status -ge 1 -and $status -le 4) }
          }
        }
      }
      $voltage = Get-FeatureIndex $path $length $slot 0x1001
      if ($voltage -gt 0) {
        $res = Invoke-Hidpp $path $length $slot $voltage 0x00 $null
        if ($res -and $res.payload -and $res.payload.Length -ge 3) {
          $mv = ([int]$res.payload[0] -shl 8) -bor [int]$res.payload[1]
          if ($mv -gt 0 -and $mv -lt 5000) {
            $pct = Convert-MvToPercent $mv
            return @{ level = $pct; charging = (([int]$res.payload[2] -band 0x80) -ne 0) }
          }
        }
      }
      $statusIdx = Get-FeatureIndex $path $length $slot 0x1000
      if ($statusIdx -gt 0) {
        $res = Invoke-Hidpp $path $length $slot $statusIdx 0x00 $null
        if ($res -and $res.payload -and $res.payload.Length -ge 3) {
          $level = [int]$res.payload[0]
          $flags = [int]$res.payload[2]
          if ($level -gt 0 -and $level -le 100) {
            return @{ level = $level; charging = ($flags -ge 1 -and $flags -le 4) }
          }
        }
      }
    }
  }
  return $null
}

# ---------------------------------------------------------------------------
# Brand table. ASUS and Logitech product ids come from HaloBattery's providers;
# Razer from OpenRazer's wireless models with the transaction id it uses. An
# unknown pid is skipped - no guessed bytes.
# ---------------------------------------------------------------------------
$ASUS_PIDS = @('1A72','1A70','197F','197D','1B0C','1B0A','1A1A','1A18','1A94','1A92','1A68','1A66','1979','1977','1A83')
$RAZER_PIDS = @{
  '00AA' = 0x1F; '00AB' = 0x1F; '00B6' = 0x1F; '00B7' = 0x1F; '00BE' = 0x1F; '00BF' = 0x1F;
  '00C0' = 0x1F; '00C1' = 0x1F; '00E5' = 0x1F; '00E6' = 0x1F; '0086' = 0x1F; '0088' = 0x1F;
  '0072' = 0x3F; '0073' = 0x3F; '0555' = 0x3F; '0556' = 0x3F; '0557' = 0x3F;
  '0290' = 0x9F; '0292' = 0x1F; '0296' = 0x9F; '0298' = 0x1F
}

$rows = @()

foreach ($pid in $ASUS_PIDS) {
  $read = Get-AsusLevel '0B05' $pid
  if (-not $read) { continue }
  $name = Get-Name ('0B05:' + $pid)
  if (-not $name) { continue }
  $rows += [pscustomobject]@{ name = $name; level = $read.level; charging = $read.charging; protocol = 'asus' }
}

foreach ($pid in $RAZER_PIDS.Keys) {
  $read = Get-RazerLevel '1532' $pid ([int]$RAZER_PIDS[$pid])
  if (-not $read) { continue }
  $name = Get-Name ('1532:' + $pid)
  if (-not $name) { continue }
  $rows += [pscustomobject]@{ name = $name; level = $read.level; charging = $read.charging; protocol = 'razer' }
}

# Logitech has no fixed product id here: the receiver's pid is not the mouse's,
# so the feature table decides. One pass over the 046D nodes is enough.
foreach ($key in @($pnp.Keys | Where-Object { $_ -like '046D:*' })) {
  $read = Get-LogitechLevel '046D' ($key -replace '^046D:', '')
  if (-not $read) { continue }
  $name = Get-Name $key
  if (-not $name) { continue }
  $rows += [pscustomobject]@{ name = $name; level = $read.level; charging = $read.charging; protocol = 'hidpp' }
}

[pscustomobject]@{ devices = $rows } | ConvertTo-Json -Compress -Depth 4
