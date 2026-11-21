# Battery levels that Windows does not publish: the vendor protocols behind a
# 2.4 GHz receiver. One-shot probe, run when devices.ps1 has nothing to say about
# a device's level; prints one JSON line and exits.
#
# Provenance and licence
# ----------------------
# The first three families (Logitech HID++ 2.0, Razer feature report, ASUS ROG
# output report) were already implemented here. The brands added in this file
# follow the device table and drivers of BatteryHub (formerly Wireless Battery),
# github.com/krisgfx9/Wireless-Device-Battery-Monitor, commit 632f204c50c4.
# IMPORTANT: that repository is licensed GPL-3.0, not MIT, so no source code is
# copied from it. Only protocol facts - report ids, command bytes, reply offsets,
# model ids - are used, the same facts every independent implementation (HaloBattery,
# Solaar, OpenRazer, G-Helper, HeadsetControl, the vendor web drivers) relies on.
# Every function names its upstream file, the bytes it sends and the licence.
# Read-only: only battery/charging status queries are sent.
#
# Why PowerShell: the three exchanges are raw HID reads, and PowerShell reaches
# them through P/Invoke with no dependency and no native build. This pair of files
# (device-battery.ps1) is the whole reader; there is no .cs file on disk. The
# P/Invoke source below is inlined, so asarUnpack only has to carry this .ps1.
# Read-only - the only packets sent are battery queries. Protocols, sources and
# the GPL-3.0 finding: docs/DEVICE-BATTERY.md and NOTICE.
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
  if (-not $pnp.ContainsKey($key)) { $pnp[$key] = $name }
}

function Get-Name([string]$key) {
  if ($pnp.ContainsKey($key)) { return $pnp[$key] }
  return $null
}

function Get-PathsFor([string]$vid, [string]$product) {
  $needle = 'vid_' + $vid.ToLower() + '&pid_' + $product.ToLower()
  return @($script:paths | Where-Object { $_.ToLower().Contains($needle) })
}

# ---------------------------------------------------------------------------
# ASUS ROG: output report 00 12 07; the echo comes back with the level at +4 and
# the charging flag at +9. G-Helper reads packet[5]/packet[10] of the same frame,
# with the report id still in [0]; HaloBattery drops it and reads 4/9.
# ---------------------------------------------------------------------------
function Get-AsusLevel([string]$vid, [string]$product) {
  foreach ($path in (Get-PathsFor $vid $product)) {
    $caps = [DevBattHid]::Caps($path)
    # The battery query lives on the vendor collection with a 65-byte output
    # report. It is 0xFF01/1 on the Gladius III and 0xFF00/1 on the Azoth, so
    # the interface number cannot be the filter (an mi_00-only test skips the
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
function Get-RazerLevel([string]$vid, [string]$product, [int]$tid) {
  foreach ($path in (Get-PathsFor $vid $product)) {
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

function Get-LogitechLevel([string]$vid, [string]$product) {
  foreach ($path in (Get-PathsFor $vid $product)) {
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
$ASUS_PIDS = @('1A72','1A70','197F','197D','1B0C','1B0A','1A1A','1A18','1A94','1A92','1A68','1A66','1979','1977')
$RAZER_PIDS = @{
  '00AA' = 0x1F; '00AB' = 0x1F; '00B6' = 0x1F; '00B7' = 0x1F; '00BE' = 0x1F; '00BF' = 0x1F;
  '00C0' = 0x1F; '00C1' = 0x1F; '00E5' = 0x1F; '00E6' = 0x1F; '0086' = 0x1F; '0088' = 0x1F;
  '0072' = 0x3F; '0073' = 0x3F; '0555' = 0x3F; '0556' = 0x3F; '0557' = 0x3F;
  '0290' = 0x9F; '0292' = 0x1F; '0296' = 0x9F; '0298' = 0x1F
}

# ---------------------------------------------------------------------------
# The second half of the reader: exchanges the first class does not cover.
# A SET_FEATURE followed by input reports (DAREU, Fantech, Endgame WE), a
# write followed by GetInputReport (Audeze), a short multi-request session
# (Finalmouse, AULA, CoolerMaster, Evision) and passive reports (Rapoo).
# Read-only by construction: callers only send the status queries documented
# above each function; nothing here writes device settings.
# ---------------------------------------------------------------------------
$HID_SOURCE2 = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class DevBattHid2 {
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
  static extern bool HidD_SetFeature(SafeFileHandle h, byte[] buf, uint n);
  [DllImport("hid.dll")]
  static extern bool HidD_GetFeature(SafeFileHandle h, byte[] buf, uint n);
  [DllImport("hid.dll")]
  static extern bool HidD_GetInputReport(SafeFileHandle h, byte[] buf, uint n);

  const uint ERROR_IO_PENDING = 997;

  static SafeFileHandle Open(string path, uint access, uint flags) {
    return CreateFileW(path, access, 3u, IntPtr.Zero, 3u, flags, IntPtr.Zero);
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

  /* SET_FEATURE once, then each GET_FEATURE after its own delay. DAREU's A84
   * launcher discards three reads before trusting the reply; the caller gets
   * every read in order. */
  public static byte[][] FeatureReads(string path, byte[] request, int length, int settle, int reads, int gap) {
    var list = new List<byte[]>();
    SafeFileHandle h = Open(path, 0, 0);
    if (h.IsInvalid) return list.ToArray();
    try {
      byte[] send = new byte[length];
      Array.Copy(request, send, Math.Min(request.Length, length));
      if (!HidD_SetFeature(h, send, (uint)length)) return list.ToArray();
      System.Threading.Thread.Sleep(settle);
      for (int i = 0; i < reads; i++) {
        if (gap > 0) System.Threading.Thread.Sleep(gap);
        byte[] reply = new byte[length];
        if (!HidD_GetFeature(h, reply, (uint)length)) break;
        list.Add(reply);
      }
    } finally { h.Dispose(); }
    return list.ToArray();
  }

  /* SET_FEATURE on one collection, answers read as input reports on another.
   * Both handles are opened and the input queue is drained before the request,
   * because the answer can arrive before the caller would otherwise open it. */
  public static byte[][] FeatureThenInputs(string featPath, string inPath, byte[] request, int featLen, int readLen, int timeoutMs, int reads) {
    var list = new List<byte[]>();
    SafeFileHandle fh = Open(featPath, 0, 0);
    if (fh.IsInvalid) return list.ToArray();
    SafeFileHandle ih = Open(inPath, 0xC0000000u, 0x40000000u);
    if (ih.IsInvalid) { fh.Dispose(); return list.ToArray(); }
    IntPtr ev = CreateEventW(IntPtr.Zero, true, false, null);
    IntPtr ov = Marshal.AllocHGlobal(32);
    try {
      byte[] junk;
      for (int i = 0; i < 16; i++) { if (!DoRead(ih, ev, ov, readLen, 0, out junk)) break; }
      byte[] send = new byte[featLen];
      Array.Copy(request, send, Math.Min(request.Length, featLen));
      if (!HidD_SetFeature(fh, send, (uint)featLen)) return list.ToArray();
      for (int i = 0; i < reads; i++) {
        byte[] data;
        if (!DoRead(ih, ev, ov, readLen, timeoutMs, out data)) break;
        list.Add(data);
      }
    } finally {
      fh.Dispose();
      ih.Dispose();
      Marshal.FreeHGlobal(ov);
    }
    return list.ToArray();
  }

  /* A short session on one open handle: one request, then replies until the
   * deadline. Finalmouse needs GET then wake/all and its burst is pushed after
   * the second write, so reopening per request would drop it; CoolerMaster,
   * Evision and Corsair only send one request here. */
  public static byte[][] Session1(string path, byte[] request, int length, int timeoutMs, int reads) {
    return Session2(path, request, null, length, timeoutMs, reads);
  }

  public static byte[][] Session2(string path, byte[] request, byte[] request2, int length, int timeoutMs, int reads) {
    var list = new List<byte[]>();
    SafeFileHandle h = Open(path, 0xC0000000u, 0x40000000u);
    if (h.IsInvalid) return list.ToArray();
    IntPtr ev = CreateEventW(IntPtr.Zero, true, false, null);
    IntPtr ov = Marshal.AllocHGlobal(32);
    try {
      byte[] junk;
      for (int i = 0; i < 16; i++) { if (!DoRead(h, ev, ov, length, 0, out junk)) break; }
      byte[] send = new byte[length];
      Array.Copy(request, send, Math.Min(request.Length, length));
      if (!DoWrite(h, ev, ov, send, 250)) return list.ToArray();
      if (request2 != null) {
        byte[] send2 = new byte[length];
        Array.Copy(request2, send2, Math.Min(request2.Length, length));
        if (!DoWrite(h, ev, ov, send2, 250)) return list.ToArray();
      }
      for (int i = 0; i < reads; i++) {
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

  /* Write one output report, then fetch input reports by report id (Audeze's
   * rolling answer buffer is read this way). */
  public static byte[][] OutputThenInputReports(string path, byte[] request, int outLen, int inReportId, int inLen, int settle, int reads) {
    var list = new List<byte[]>();
    SafeFileHandle h = Open(path, 0xC0000000u, 0x40000000u);
    if (h.IsInvalid) return list.ToArray();
    IntPtr ev = CreateEventW(IntPtr.Zero, true, false, null);
    IntPtr ov = Marshal.AllocHGlobal(32);
    try {
      byte[] send = new byte[outLen];
      Array.Copy(request, send, Math.Min(request.Length, outLen));
      if (!DoWrite(h, ev, ov, send, 250)) return list.ToArray();
      for (int i = 0; i < reads; i++) {
        System.Threading.Thread.Sleep(settle);
        byte[] reply = new byte[inLen];
        reply[0] = (byte)inReportId;
        if (!HidD_GetInputReport(h, reply, (uint)inLen)) continue;
        list.Add(reply);
      }
    } finally {
      h.Dispose();
      Marshal.FreeHGlobal(ov);
    }
    return list.ToArray();
  }

  /* Passive reports: open, drain what Windows buffered, then listen. Rapoo
   * pushes its level every few seconds without any request. */
  public static byte[][] Inputs(string path, int length, int timeoutMs, int reads) {
    var list = new List<byte[]>();
    SafeFileHandle h = Open(path, 0xC0000000u, 0x40000000u);
    if (h.IsInvalid) return list.ToArray();
    IntPtr ev = CreateEventW(IntPtr.Zero, true, false, null);
    IntPtr ov = Marshal.AllocHGlobal(32);
    try {
      for (int i = 0; i < reads; i++) {
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
}
'@
Add-Type -TypeDefinition $HID_SOURCE2 -Language CSharp -ErrorAction SilentlyContinue

# ---------------------------------------------------------------------------
# Shared helpers for the ported families.
# ---------------------------------------------------------------------------

# Every collection of one product, with the four lengths Windows reports. The
# upstream drivers filter on exactly these numbers, so they are read once here
# instead of being guessed from the path.
function Get-Colls([string]$vid, [string]$product) {
  $list = @()
  foreach ($path in (Get-PathsFor $vid $product)) {
    $caps = [DevBattHid]::Caps($path)
    if (-not $caps) { continue }
    $iface = 0
    if ($path -match 'mi_([0-9A-Fa-f]{2})') { $iface = [Convert]::ToInt32($matches[1], 16) }
    $list += [pscustomobject]@{
      path = $path; page = $caps[0]; usage = $caps[1]
      inLen = $caps[2]; outLen = $caps[3]; featLen = $caps[4]; iface = $iface
    }
  }
  return $list
}

# A row is one device name, the same string devices.ps1 already prints. The
# first answer wins: a dongle and a cable can both answer for one mouse and the
# cable one is asked first, so the duplicate carries no new information.
function Add-Row([string]$name, $level, [bool]$charging, [string]$protocol) {
  if (-not $name) { return }
  if ($null -eq $level) { return }
  $n = [int]$level
  # 0 is "not initialised", "asleep" or "off" in nearly every vendor cache;
  # a real 0 % device is not worth a wrong reading for.
  if ($n -lt 1 -or $n -gt 100) { return }
  $key = $name.ToLowerInvariant()
  if ($script:seen.ContainsKey($key)) { return }
  $script:seen[$key] = $true
  $script:rows += [pscustomobject]@{ name = $name; level = $n; charging = $charging; protocol = $protocol }
}

function Get-DeviceName([string]$vid, [string]$product, [string]$fallback) {
  $name = Get-Name ($vid + ':' + $product)
  if ($name) { return $name }
  return $fallback
}

# Every present product id for one vendor, from the same PnP pass devices.ps1
# uses. A brand with a fixed allow-list ignores this and walks its table.
# First present friendly name for a vendor: a whole-brand protocol returns one
# row and the PnP name is what makes it merge with devices.ps1.
function Get-FirstName([string]$vid, [string]$fallback) {
  foreach ($key in @($script:pnp.Keys | Where-Object { $_ -like ($vid + ':*') })) {
    $name = Get-Name $key
    if ($name) { return $name }
  }
  return $fallback
}

function Get-Products([string]$vid) {
  $list = @()
  foreach ($key in @($script:pnp.Keys | Where-Object { $_ -like ($vid + ':*') })) {
    $list += ($key -split ':')[1]
  }
  return $list
}

# A vendor id is not a device identity.
#
# Several brands share one vid with products that speak a different protocol
# (320F: ATK keyboards and a Redragon mouse; 25A7: Fantech and Redragon Areson;
# 260D: three DAREU families), and the call sites below pass an exact pid for
# every one of those. Three families are different: their upstream driver
# addresses a whole vid (LAMZU 373E/37B0, MCHOSE 5253, Jabra 0B0E), so a pid
# list cannot be the whole guard. For those, the collection must also be a
# product whose PnP name names the brand - a pid that merely shares the vid
# never receives that family's bytes.
function Test-ModelName([string]$name, [string[]]$models) {
  if (-not $name) { return $false }
  foreach ($model in $models) {
    if ($name -like ('*' + $model + '*')) { return $true }
  }
  return $false
}

# One request, then input reports for up to timeoutMs. A HID report is at most
# 64 bytes, so the buffer is the collection's own input length. Byte arrays are
# passed one by one because PowerShell flattens a nested array on the way in.
function Send-Session1([string]$path, [byte[]]$request, [int]$length, [int]$timeoutMs, [int]$reads) {
  $out = @()
  $result = [DevBattHid2]::Session1($path, $request, $length, $timeoutMs, $reads)
  if ($result) { $out = @($result) }
  return ,$out
}

function Send-Session2([string]$path, [byte[]]$request, [byte[]]$request2, [int]$length, [int]$timeoutMs, [int]$reads) {
  $out = @()
  $result = [DevBattHid2]::Session2($path, $request, $request2, $length, $timeoutMs, $reads)
  if ($result) { $out = @($result) }
  return ,$out
}

function New-Request([int]$length) {
  return (New-Object byte[] $length)
}

# ---------------------------------------------------------------------------
# LAMZU (373E / 37B0). BatteryHub src/drivers/lamzu.cpp (GPL-3.0; protocol
# facts only, no code copied): LAMZU's own Aurora web driver.
#   65-byte feature report 0: [3]=02 [4]=02 [6]=83.
#   Reply: [1]=A1 [4]=02 [6]=83 [7]=charging [8]=percent, or the same shifted by
#   one when the report id is kept. percent 0 on a dongle = mouse not linked.
# ---------------------------------------------------------------------------
function Get-Lamzu([string]$vid, [string]$product) {
  foreach ($c in (Get-Colls $vid $product)) {
    if ($c.featLen -ne 65) { continue }
    $req = New-Request 65
    $req[3] = 0x02; $req[4] = 0x02; $req[6] = 0x83
    $r = [DevBattHid]::Feature($c.path, $req, 65, 300, 100)
    if (-not $r -or $r.Length -lt 9) { continue }
    $charging = -1; $level = -1
    if ($r[1] -eq 0xA1 -and $r[4] -eq 0x02 -and $r[6] -eq 0x83) {
      $charging = [int]$r[7]; $level = [int]$r[8]
    } elseif ($r[0] -eq 0xA1 -and $r[3] -eq 0x02 -and $r[5] -eq 0x83) {
      $charging = [int]$r[6]; $level = [int]$r[7]
    } else { continue }
    if ($level -lt 1 -or $level -gt 100) { continue }
    return @{ level = $level; charging = ($charging -eq 1) }
  }
  return $null
}

# ---------------------------------------------------------------------------
# Glorious (258A) and G-Wolves (33E4) share the supplier "XVI" feature report.
# BatteryHub src/drivers/glorious.cpp (GPL-3.0; protocol facts only):
#   65-byte feature report: [3]=02 [4]=02 [6]=83.
#   Reply [1] status A1 awake / A4 asleep / A0 waking, [6]=83, [7] charging,
#   [8] percent; ask again after 400 ms while it is waking.
# ---------------------------------------------------------------------------
function Get-Glorious([string]$vid, [string]$product) {
  foreach ($c in (Get-Colls $vid $product)) {
    if ($c.featLen -ne 65) { continue }
    for ($attempt = 0; $attempt -lt 2; $attempt++) {
      $req = New-Request 65
      $req[3] = 0x02; $req[4] = 0x02; $req[6] = 0x83
      $r = [DevBattHid]::Feature($c.path, $req, 65, 250, 50)
      if (-not $r -or $r.Length -lt 9) { break }
      if ($r[6] -ne 0x83 -or (($r[1] -band 0xF0) -ne 0xA0)) { break }
      if ($r[1] -eq 0xA0) { Start-Sleep -Milliseconds 400; continue }
      if ($r[1] -ne 0xA1 -or [int]$r[8] -gt 100) { return $null }
      $level = [int]$r[8]
      if ($level -eq 0) { $level = 1 }
      $charged = [bool]($r[7] -eq 0x01)
      return @{ level = $level; charging = $charged }
    }
  }
  return $null
}

# ---------------------------------------------------------------------------
# Endgame Gear 4K dongle (3367:1970). BatteryHub src/drivers/endgame.cpp
# (GPL-3.0; protocol facts only), from vole's RE/PROTOCOL.md:
#   feature report A1, 64 bytes: [A1][cmd][target][len][00 ...].
#   SET_FEATURE, wait ~150 ms, GET_FEATURE report A1.
#   status byte 1 = ok, 3 = busy, 8 / 11 = asleep or out of range.
#   B4 battery: reply[16] = percent; no charging byte for this family.
# ---------------------------------------------------------------------------
function Get-Endgame4K {
  foreach ($c in (Get-Colls '3367' '1970')) {
    if ($c.page -ne 0xFF01 -or $c.usage -ne 0x0002 -or $c.featLen -lt 64) { continue }
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
      $req = New-Request 64
      $req[0] = 0xA1; $req[1] = 0xB4; $req[2] = 0x00
      $settle = 150 + ($attempt * 100)
      $r = [DevBattHid]::Feature($c.path, $req, 64, 400, $settle)
      if (-not $r -or $r.Length -lt 17 -or $r[0] -ne 0xA1) { break }
      if ($r[1] -eq 0x03) { continue }
      if ($r[1] -ne 0x01) { break }
      if ([int]$r[16] -lt 1 -or [int]$r[16] -gt 100) { break }
      return @{ level = [int]$r[16]; charging = $false }
    }
  }
  return $null
}

# ---------------------------------------------------------------------------
# Endgame Gear XM2we (3367:1961). BatteryHub src/drivers/endgame_we.cpp
# (GPL-3.0; protocol facts only), from HaloBattery / xm2we-linux:
#   17-byte feature report 08: [08][op][00 x14][checksum], all bytes sum 0x55.
#   Reply is a 17-byte input report 09: [09][op][0 0 0][size][payload];
#   op 04 battery -> payload [percent][charging]. No other op is sent.
# ---------------------------------------------------------------------------
function Get-EndgameWe {
  $features = @(Get-Colls '3367' '1961' | Where-Object { $_.page -eq 0xFF02 -and $_.usage -eq 0x0002 -and $_.featLen -ge 17 })
  $inputs = @(Get-Colls '3367' '1961' | Where-Object { $_.page -eq 0xFF01 -and $_.usage -eq 0x0000 -and $_.inLen -ge 17 })
  if ($features.Count -lt 1 -or $inputs.Count -lt 1) { return $null }
  $req = New-Request 17
  $req[0] = 0x08; $req[1] = 0x04
  $sum = 0
  for ($i = 0; $i -lt 16; $i++) { $sum += [int]$req[$i] }
  $req[16] = [byte]((0x55 - $sum) -band 0xFF)
  foreach ($r in [DevBattHid2]::FeatureThenInputs($features[0].path, $inputs[0].path, $req, 17, 17, 500, 12)) {
    if (-not $r -or $r.Length -lt 8 -or $r[0] -ne 0x09 -or $r[1] -ne 0x04) { continue }
    if ($r[2] -ne 0 -or $r[3] -ne 0 -or $r[4] -ne 0) { continue }
    $check = 0
    for ($i = 0; $i -lt 17; $i++) { $check += [int]$r[$i] }
    if (($check -band 0xFF) -ne 0x55) { continue }
    if ([int]$r[6] -lt 1 -or [int]$r[6] -gt 100) { continue }
    return @{ level = [int]$r[6]; charging = ([int]$r[7] -eq 1) }
  }
  return $null
}

# ---------------------------------------------------------------------------
# EWEADN (372E). BatteryHub src/drivers/eweadn.cpp (GPL-3.0; protocol facts
# only), from the official new-hub.eweadn.cn driver:
#   64-byte feature report id 3: [03][sum][50][len][00][cmd][sub]...
#   sum = sum of bytes 1..63 & FF; reply [03][50][ack=0][len][00][sub][data...].
#   47 00 link -> data[0] == 1; 4F 81 battery -> data[0] bit7 charging,
#   bits 0..6 percent. Only those two read commands are sent.
# ---------------------------------------------------------------------------
function Invoke-Eweadn([string]$path, [byte]$cmd, [byte]$sub, [int]$featLen) {
  for ($attempt = 0; $attempt -lt 3; $attempt++) {
    $req = New-Request $featLen
    $req[0] = 0x03
    $req[2] = 0x50
    $req[3] = 0x00
    $req[5] = $cmd
    $req[6] = $sub
    $sum = 0
    for ($i = 1; $i -lt $featLen; $i++) { $sum += [int]$req[$i] }
    $req[1] = [byte]($sum -band 0xFF)
    $r = [DevBattHid]::Feature($path, $req, $featLen, 300, 100)
    if (-not $r -or $r.Length -lt 8 -or $r[0] -ne 0x03) { continue }
    if ($r[2] -ne 0 -or $r[4] -ne 0) { continue }
    $len = [int]$r[3]
    if ($len -lt 1 -or (6 + $len) -gt $r.Length) { continue }
    return @{ data = @($r[6..(6 + $len - 1)]) }
  }
  return $null
}

function Get-Eweadn([string]$vid, [string]$product) {
  $cable = ($product -eq '1027')
  foreach ($c in (Get-Colls $vid $product)) {
    if ($c.page -ne 0xFF00 -or $c.usage -ne 1 -or $c.featLen -ne 64) { continue }
    if (-not $cable) {
      $link = Invoke-Eweadn $c.path 0x47 0x00 $c.featLen
      if (-not $link -or $link.data.Count -lt 1 -or [int]$link.data[0] -ne 1) { return $null }
    }
    $read = Invoke-Eweadn $c.path 0x4F 0x81 $c.featLen
    if (-not $read -or $read.data.Count -lt 1) { continue }
    $raw = [int]$read.data[0]
    $level = $raw -band 0x7F
    if ($level -lt 1 -or $level -gt 100) { continue }
    return @{ level = $level; charging = (($raw -band 0x80) -ne 0) }
  }
  return $null
}

# ---------------------------------------------------------------------------
# Evision output report 04, battery command 1A, on FF1C:0092. BatteryHub
# src/drivers/atk_keyboard.cpp and redragon_evision.cpp (GPL-3.0; protocol
# facts only), from ATK HUB / VGN HUB / a Redragon M999 USB capture:
#   31 payload bytes on report 04: [04][seq lo][seq hi][1A][flag][00 ...].
#   Reply [04][seq lo][seq hi][1A][..][00 00][..][8]=percent [9]=state
#   (0 on battery, 1/2 charging). flag 0x02 on the Redragon receiver, 0x06 for
#   VGN/VXE, 0x00 for ATK/Feker. ATK Z87 (373B:1012) answers the same frame and
#   returns byte 3 == FF while asleep.
# ---------------------------------------------------------------------------
function Invoke-Evision([string]$path, [int]$outLen, [byte]$flag, [int]$timeoutMs) {
  $script:evisionSeq = ($script:evisionSeq % 0xFFFF) + 1
  $seq = $script:evisionSeq
  $req = New-Request ([Math]::Max($outLen, 32))
  $req[0] = 0x04
  $req[1] = [byte]($seq -band 0xFF)
  $req[2] = [byte]($seq -shr 8)
  $req[3] = 0x1A
  $req[4] = $flag
  foreach ($r in (Send-Session1 $path $req ([Math]::Max($outLen, 32)) 120 24)) {
    if (-not $r -or $r.Length -lt 4 -or $r[0] -ne 0x04) { continue }
    if ([int]$r[1] -ne ($seq -band 0xFF) -or [int]$r[2] -ne ($seq -shr 8)) { continue }
    # ATK Z87 answers FF here while the keyboard is asleep; not a level.
    if ($r[3] -eq 0xFF) { return $null }
    if ($r.Length -lt 10 -or $r[3] -ne 0x1A) { continue }
    if ($r[5] -ne 0 -or $r[6] -ne 0) { continue }
    if ([int]$r[8] -lt 1 -or [int]$r[8] -gt 100 -or [int]$r[9] -gt 2) { continue }
    return @{ level = [int]$r[8]; charging = ([int]$r[9] -eq 1 -or [int]$r[9] -eq 2) }
  }
  return $null
}

# ---------------------------------------------------------------------------
# AULA / MCHOSE "BY" keyboards on 3554:FA09 / FB40 and 41E4:2001. BatteryHub
# src/drivers/aula.cpp (GPL-3.0; protocol facts only), from PyFlat's captures
# and the official M HUB driver:
#   20-byte output report 13: [13][4A][01][00 ...][sum of bytes 0..18].
#   Reply 13 with command 4A (top bit ignored): [5]=percent, [6] low nibble
#   full / high nibble charging. MCHOSE firmware leaves the trailer 0, and its
#   reply is accepted only as a single-packet frame (byte 2 = 1, byte 3 = 0).
# ---------------------------------------------------------------------------
function Get-AulaKeyboard([string]$vid, [string]$product) {
  foreach ($c in (Get-Colls $vid $product)) {
    if (($c.page -ne 0xFF02 -and $c.page -ne 0xFF04) -or $c.usage -ne 0x0002) { continue }
    if ($c.outLen -lt 20 -or $c.inLen -lt 20) { continue }
    $req = New-Request $c.outLen
    $req[0] = 0x13; $req[1] = 0x4A; $req[2] = 0x01
    $sum = 0
    for ($i = 0; $i -lt 19; $i++) { $sum += [int]$req[$i] }
    $req[19] = [byte]($sum -band 0xFF)
    foreach ($r in (Send-Session1 $c.path $req $c.outLen 200 30)) {
      if (-not $r -or $r.Length -lt 7 -or $r[0] -ne 0x13) { continue }
      if (($r[1] -band 0x7F) -ne 0x4A) { continue }
      $check = 0
      $limit = [Math]::Min(19, $r.Length)
      for ($i = 0; $i -lt $limit; $i++) { $check += [int]$r[$i] }
      $checksumOk = ($r.Length -ge 20 -and (($check -band 0xFF) -eq [int]$r[19]))
      $single = ($r[2] -eq 1 -and $r[3] -eq 0)
      if (-not $checksumOk -and -not $single) { continue }
      $level = [int]$r[5]
      if ($level -lt 1 -or $level -gt 100) { continue }
      $state = [int]$r[6]
      return @{ level = $level; charging = (($state -band 0xF0) -ne 0) }
    }
  }
  return $null
}

# ---------------------------------------------------------------------------
# Cooler Master MM712 / MM731 (2516:01B7 dongle, 0169 / 0167 cable), interface
# 3, usage page FF0A. BatteryHub src/drivers/coolermaster.cpp (GPL-3.0;
# protocol facts only), from coolermaster-usb-protocol and MM731-Controller:
#   32-byte output report on the dongle, 64 on the cable, no report id:
#   request [46][81][00]; reply [47][81][model]...[10]=percent [11]=charging
#   [12]=link (0 cable, 1 dongle). Only the status request is sent.
# ---------------------------------------------------------------------------
function Get-CoolerMaster([string]$vid, [string]$product) {
  foreach ($c in (Get-Colls $vid $product)) {
    if ($c.iface -ne 3 -or $c.page -ne 0xFF0A -or $c.outLen -lt 4) { continue }
    $req = New-Request $c.outLen
    $req[0] = 0x00; $req[1] = 0x46; $req[2] = 0x81; $req[3] = 0x00
    foreach ($r in (Send-Session1 $c.path $req $c.outLen 120 12)) {
      if (-not $r -or $r.Length -lt 13) { continue }
      if ($r[0] -ne 0x47 -or $r[1] -ne 0x81) { continue }
      $model = [int]$r[2]
      $name = 'Cooler Master wireless mouse'
      if ($product -eq '0169' -or ($product -eq '01B7' -and $model -eq 0x50)) { $name = 'Cooler Master MM712' }
      if ($product -eq '0167' -or ($product -eq '01B7' -and $model -eq 0x70)) { $name = 'Cooler Master MM731' }
      return @{ level = [int]$r[10]; charging = ([int]$r[11] -ne 0); name = $name }
    }
  }
  return $null
}

# ---------------------------------------------------------------------------
# Finalmouse UltralightX / Starlight X (361D). BatteryHub src/drivers/
# finalmouse.cpp (GPL-3.0; protocol facts only), from OpenMouse mouse-protocol
# and FinalmousePollingRateSwitcher, both following xpanel:
#   vendor page FF00, report [report id][2 + n][0x80|cmd][n][payload]; a write
#   with an empty payload is a GET. ULX output 04 / input 05, SLX 01 / 02.
#   GET 21 (ULX) or 57 (SLX), then GET 96 wake/all; the burst carries
#   5 voltage mV, 38 state of charge [percent][mV], 37 charging, 36 link.
#   Percent from voltage uses xpanel's five-segment calibration curve.
# ---------------------------------------------------------------------------
function Convert-FinalmouseMv([int]$mv) {
  $points = @(
    @(3000, 0.2), @(3620, 5), @(3660, 10), @(3740, 25),
    @(3880, 50), @(4170, 75), @(4380, 100)
  )
  if ($mv -le 3000) { return 0 }
  for ($i = 1; $i -lt $points.Count; $i++) {
    if ($mv -gt $points[$i][0]) { continue }
    $lo = $points[$i - 1]; $hi = $points[$i]
    $ratio = ($mv - $lo[0]) / ($hi[0] - $lo[0])
    return [int][Math]::Floor($lo[1] + ($hi[1] - $lo[1]) * $ratio + 0.5)
  }
  return 100
}

function Get-Finalmouse([string]$product) {
  $models = @{
    '0100' = @{ name = 'Finalmouse UltralightX'; out = 0x04; in = 0x05; first = 21; slx = $false }
    '0300' = @{ name = 'Finalmouse Starlight X'; out = 0x01; in = 0x02; first = 57; slx = $true }
    '0301' = @{ name = 'Finalmouse Starlight X'; out = 0x01; in = 0x02; first = 57; slx = $true }
  }
  if (-not $models.ContainsKey($product)) { return $null }
  $model = $models[$product]
  foreach ($c in (Get-Colls '361D' $product)) {
    if ($c.page -ne 0xFF00 -or $c.inLen -lt 4 -or $c.outLen -lt 4) { continue }
    $getFirst = New-Request $c.outLen
    $getFirst[0] = [byte]$model.out; $getFirst[1] = 0x02
    $getFirst[2] = [byte](0x80 -bor $model.first); $getFirst[3] = 0x00
    $wake = New-Request $c.outLen
    $wake[0] = [byte]$model.out; $wake[1] = 0x02
    $wake[2] = [byte](0x80 -bor 96); $wake[3] = 0x00
    $soc = -1; $mv = 0; $charging = -1; $link = -1
    foreach ($r in (Send-Session2 $c.path $getFirst $wake $c.outLen 150 24)) {
      if (-not $r -or $r.Length -lt 4 -or [int]$r[0] -ne [int]$model.in) { continue }
      $inner = [Math]::Min([int]$r[1], $r.Length - 2)
      if ($inner -lt 2) { continue }
      $n = [Math]::Min([int]$r[3], $inner - 2)
      if ($n -lt 1) { continue }
      $p = 4
      switch ([int]$r[2]) {
        5 {
          if ($n -ge 2) { $v = [int]$r[$p] -bor ([int]$r[$p + 1] -shl 8); if ($v -gt 0 -and $v -lt 5000) { $mv = $v } }
        }
        38 {
          if ($n -ge 3 -and [int]$r[$p] -le 100) {
            $soc = [int]$r[$p]
            $v = [int]$r[$p + 1] -bor ([int]$r[$p + 2] -shl 8)
            if ($v -gt 0 -and $v -lt 5000) { $mv = $v }
          }
        }
        37 { if ($n -ge 1) { $charging = [int]$r[$p] } }
        36 { if ($n -ge 1) { $link = [int]$r[$p] } }
      }
    }
    if ($soc -ge 1) { $level = $soc }
    elseif ($mv -gt 0) { $level = Convert-FinalmouseMv $mv }
    elseif ($link -eq 0) { return $null }
    else { continue }
    if ($level -lt 1 -or $level -gt 100) { continue }
    return @{ level = $level; charging = ($charging -eq 1); name = $model.name }
  }
  return $null
}

# ---------------------------------------------------------------------------
# Audeze Maxwell (3329). BatteryHub src/drivers/audeze.cpp (GPL-3.0; protocol
# facts only), from HaloBattery providers/audeze.py and HeadsetControl:
#   vendor FF13:0001, request 62-byte output report 06:
#   06 07 80 05 5A 03 00 D6 0C; answer 62-byte input report 07 scanned for the
#   battery marker D6 0C 00 00 <percent>. Only attribute 0CD6 is read; a cable
#   answer means charging (Maxwell always charges on USB-C).
# ---------------------------------------------------------------------------
function Get-Audeze {
  $models = @{
    '4B1A' = $true; '4B1E' = $true; '4B19' = $false
    '4B18' = $false; '4B29' = $false; '4B28' = $false
  }
  foreach ($product in $models.Keys) {
    foreach ($c in (Get-Colls '3329' $product)) {
      if ($c.page -ne 0xFF13 -or $c.usage -ne 0x0001 -or $c.inLen -lt 1) { continue }
      $name = Get-DeviceName '3329' $product 'Audeze Maxwell'
      if (-not $models[$product] -and $name -match 'Dongle') { break }
      $req = New-Request 62
      $req[0] = 0x06; $req[1] = 0x07; $req[2] = 0x80; $req[3] = 0x05
      $req[4] = 0x5A; $req[5] = 0x03; $req[6] = 0x00; $req[7] = 0xD6; $req[8] = 0x0C
      $level = -1
      foreach ($r in [DevBattHid2]::OutputThenInputReports($c.path, $req, 62, 0x07, 62, 60, 8)) {
        if (-not $r) { continue }
        for ($i = 0; $i + 4 -lt $r.Length; $i++) {
          if ($r[$i] -eq 0xD6 -and $r[$i + 1] -eq 0x0C -and $r[$i + 2] -eq 0 -and $r[$i + 3] -eq 0 -and [int]$r[$i + 4] -le 100) {
            $level = [int]$r[$i + 4]
          }
        }
      }
      if ($level -lt 1 -or $level -gt 100) { continue }
      return @{ level = $level; charging = [bool]$models[$product]; name = ($name -replace ' Dongle$', '') }
    }
  }
  return $null
}

# ---------------------------------------------------------------------------
# Corsair Void / HS family (1B1C). BatteryHub src/drivers/corsair.cpp
# (GPL-3.0; protocol facts only), from HeadsetControl:
#   output report C9 64, reply [2] percent (bit7 = mic up), [4] status
#   (0 offline, 1-2 ok, 4-5 charging). Only that status query is sent.
# ---------------------------------------------------------------------------
function Get-CorsairVoid([string]$product) {
  foreach ($c in (Get-Colls '1B1C' $product)) {
    if (($c.page -ne 0xFFC5 -and $c.page -ne 0xFF00) -or $c.outLen -lt 3) { continue }
    $req = New-Request $c.outLen
    $req[0] = 0xC9; $req[1] = 0x64
    foreach ($r in (Send-Session1 $c.path $req $c.outLen 100 10)) {
      if (-not $r -or $r.Length -lt 5) { continue }
      $status = [int]$r[4]
      if ($status -eq 0) { return $null }
      if ($status -ne 1 -and $status -ne 2 -and $status -ne 4 -and $status -ne 5) { continue }
      $level = [int]$r[2] -band 0x7F
      if ($level -lt 1 -or $level -gt 100) { continue }
      return @{ level = $level; charging = ($status -eq 4 -or $status -eq 5) }
    }
  }
  return $null
}

# ---------------------------------------------------------------------------
# Corsair Compx mice (Sabre V2 Pro, 1B1C:2B2A / 2B34). BatteryHub src/drivers/
# corsair.cpp (GPL-3.0; protocol facts only), from HaloBattery:
#   17-byte report 08 on FF02:0002: [08][cmd][00 x14][checksum = 0x55 - sum].
#   cmd 03 link, cmd 04 battery: [6]=percent [7]=charging [8..9]=millivolts.
# ---------------------------------------------------------------------------
function Get-CorsairCompx([string]$product) {
  foreach ($c in (Get-Colls '1B1C' $product)) {
    if ($c.page -ne 0xFF02 -or $c.usage -ne 0x0002 -or $c.outLen -lt 17 -or $c.inLen -lt 17) { continue }
    $req = New-Request 17
    $req[0] = 0x08; $req[1] = 0x04
    $sum = 0
    for ($i = 0; $i -lt 16; $i++) { $sum += [int]$req[$i] }
    $req[16] = [byte]((0x55 - $sum) -band 0xFF)
    foreach ($r in (Send-Session1 $c.path $req 17 150 16)) {
      if (-not $r -or $r.Length -lt 17 -or $r[0] -ne 0x08 -or $r[1] -ne 0x04) { continue }
      $check = 0
      for ($i = 0; $i -lt 17; $i++) { $check += [int]$r[$i] }
      if (($check -band 0xFF) -ne 0x55) { continue }
      if ([int]$r[6] -lt 1 -or [int]$r[6] -gt 100) { continue }
      return @{ level = [int]$r[6]; charging = ([int]$r[7] -ne 0) }
    }
  }
  return $null
}

# ---------------------------------------------------------------------------
# Corsair "Bragi" devices. BatteryHub src/drivers/corsair.cpp (GPL-3.0;
# protocol facts only), from OpenRGB/HeadsetControl and the vendor's own
# Slipstream captures:
#   GET is [02][target][02][prop] (numbered, 64 bytes) or
#   [00][02][target][02][prop] (unnumbered 65); newer receivers use
#   [00][target][02][prop]. Reply [source][02][status=0][value LE].
#   Property 0F = battery 0..1000, 10 = charge state (1 charging, 3 full).
#   Target 08 is the device itself, 09+ a device behind a receiver. GET only.
# ---------------------------------------------------------------------------
function Get-BragiValue($c, [byte]$target, [byte]$prop) {
  $source = if ($target -eq 0x08) { 0x00 } else { 0x01 }
  foreach ($plain in @($false, $true)) {
    $req = New-Request $c.outLen
    if ($plain) {
      $req[0] = 0x00; $req[1] = $target; $req[2] = 0x02; $req[3] = $prop
    } elseif ($c.outLen -eq 64) {
      $req[0] = 0x02; $req[1] = $target; $req[2] = 0x02; $req[3] = $prop
    } else {
      $req[0] = 0x00; $req[1] = 0x02; $req[2] = $target; $req[3] = 0x02; $req[4] = $prop
    }
    $offset = if ($plain) { 0 } else { 1 }
    foreach ($r in (Send-Session1 $c.path $req $c.outLen 300 12)) {
      if (-not $r -or $r.Length -lt ($offset + 7)) { continue }
      if ($r[$offset + 1] -ne 0x02 -or $r[$offset] -ne $source) { continue }
      if ($r[$offset + 2] -ne 0x00) { continue }
      return ([int]$r[$offset + 3] -bor ([int]$r[$offset + 4] -shl 8) -bor ([int]$r[$offset + 5] -shl 16) -bor ([int]$r[$offset + 6] -shl 24))
    }
  }
  return $null
}

function Get-CorsairBragi([string]$product) {
  foreach ($c in (Get-Colls '1B1C' $product)) {
    $sizes = ($c.outLen -eq 64 -or $c.outLen -eq 65) -and ($c.inLen -eq 64 -or $c.inLen -eq 65)
    if (-not $sizes) { continue }
    if ($c.page -ne 0xFF42 -and -not ($c.page -ge 0xFF00 -or $c.iface -eq 4)) { continue }
    foreach ($target in @(0x09, 0x0A, 0x0B, 0x08)) {
      $value = Get-BragiValue $c ([byte]$target) 0x0F
      if ($null -eq $value) { continue }
      if ($value -le 0) {
        $value = Get-BragiValue $c ([byte]$target) 0x0F
        if ($null -eq $value -or $value -le 0) { continue }
      }
      if ($value -gt 1000) { continue }
      $level = [int][Math]::Floor(($value + 5) / 10)
      if ($level -lt 1 -or $level -gt 100) { continue }
      $charge = Get-BragiValue $c ([byte]$target) 0x10
      return @{ level = $level; charging = ($charge -eq 1 -or $charge -eq 3) }
    }
    break
  }
  return $null
}

# ---------------------------------------------------------------------------
# SteelSeries (1038). BatteryHub src/drivers/steelseries.cpp (GPL-3.0;
# protocol facts only), from HeadsetControl / rivalcfg:
#   Arctis 7: 06 18 -> [2] percent. Arctis 1: 06 12 -> [2]!=1 connected, [3] %.
#   Nova family: 00 B0; Arctis 7+ [2] steps 0..4 / [3] charging, Nova 5 [3] %,
#     Nova 7 [2] % / [3] charging.
#   Aerox / Prime: [92 cable | D2 receiver] -> [1] steps 1..21 or Gen 2
#     [1] charging, [2] percent; receiver 40 FF means the mouse is off.
#   Rival 3 Wireless / Rival 650: 00 AA 01 -> [0] %, [2] charging.
# ---------------------------------------------------------------------------
function Convert-Map100($raw, [int]$lo, [int]$hi) {
  if ($null -eq $raw -or $hi -le $lo) { return $null }
  return [int][Math]::Round(([int]$raw - $lo) * 100.0 / ($hi - $lo))
}

function Get-SteelSeries {
  $heads = @{
    '1260' = 'arctis7'; '12AD' = 'arctis7'; '1252' = 'arctis7'
    '12B3' = 'arctis1'; '12B6' = 'arctis1'; '12D7' = 'arctis1'
  }
  $nova7 = @('220E', '2212', '2216', '2236')
  $nova5 = @('2269', '226D', '2232', '2253')
  $novaDiscrete = @('2202', '2206', '220A', '223A', '227A', '22A4')
  $novaFamily = @('220E', '2212', '2216', '2236', '2269', '226D', '2232', '2253', '230A', '2202', '22A1', '227E', '2206', '2258', '229E', '22AD', '223A', '22A9', '227A', '22A4', '22A5', '220A', '22A7')
  foreach ($product in $heads.Keys) {
    foreach ($c in (Get-Colls '1038' $product)) {
      if ($c.page -ne 0xFF43 -or $c.usage -ne 0x0202) { continue }
      $pidByte = if ($heads[$product] -eq 'arctis7') { 0x18 } else { 0x12 }
      $req = New-Request $c.outLen
      $req[0] = 0x00; $req[1] = 0x06; $req[2] = [byte]$pidByte
      foreach ($r in (Send-Session1 $c.path $req $c.outLen 1000 8)) {
        if (-not $r -or $r.Length -lt 4) { continue }
        if ($heads[$product] -eq 'arctis1') {
          if ([int]$r[2] -eq 1) { break }
          return @{ level = [int]$r[3]; charging = $false; name = (Get-DeviceName '1038' $product 'SteelSeries Arctis 1 Wireless') }
        }
        if ([int]$r[2] -lt 1 -or [int]$r[2] -gt 100) { break }
        return @{ level = [int]$r[2]; charging = $false; name = (Get-DeviceName '1038' $product 'SteelSeries wireless headset') }
      }
    }
  }
  foreach ($product in $novaFamily) {
    foreach ($c in (Get-Colls '1038' $product)) {
      if ($c.page -ne 0xFFC0 -or $c.usage -ne 0x0001) { continue }
      $req = New-Request $c.outLen
      $req[0] = 0x00; $req[1] = 0x00; $req[2] = 0xB0
      foreach ($r in (Send-Session1 $c.path $req $c.outLen 1000 8)) {
        if (-not $r -or $r.Length -lt 7) { continue }
        if ($nova5 -contains $product) {
          if ([int]$r[1] -eq 2) { break }
          return @{ level = [int]$r[3]; charging = ([int]$r[4] -eq 1) }
        }
        if ($nova7 -contains $product) {
          if ([int]$r[1] -eq 1) { break }
          $level = Convert-Map100 $r[2] 0 4
          if ($null -eq $level) { break }
          return @{ level = $level; charging = ([int]$r[3] -eq 1) }
        }
        if ($product -eq '230A') {
          $level = -1
          if ([int]$r[3] -eq 3) { $level = [int]$r[5] }
          if ([int]$r[4] -eq 3) { $level = if ($level -lt 0) { [int]$r[6] } else { [Math]::Min($level, [int]$r[6]) } }
          if ($level -lt 1 -or $level -gt 100) { break }
          return @{ level = $level; charging = $false }
        }
        if ([int]$r[3] -eq 0) { break }
        $level = if ($novaDiscrete -contains $product) { Convert-Map100 $r[2] 0 4 } else { [int]$r[2] }
        if ($null -eq $level -or $level -lt 1 -or $level -gt 100) { break }
        return @{ level = $level; charging = ([int]$r[3] -eq 1 -or [int]$r[3] -eq 2) }
      }
    }
  }
  $aerox = @{
    '1838' = @{ wired = $false; percent = $false }; '183A' = @{ wired = $true; percent = $false }
    '1878' = @{ wired = $false; percent = $false }; '187A' = @{ wired = $true; percent = $false }
    '1890' = @{ wired = $false; percent = $true };  '1892' = @{ wired = $true; percent = $true }
    '1852' = @{ wired = $false; percent = $false }; '1854' = @{ wired = $true; percent = $false }
    '185C' = @{ wired = $false; percent = $false }; '185E' = @{ wired = $true; percent = $false }
    '1858' = @{ wired = $false; percent = $false }; '185A' = @{ wired = $true; percent = $false }
    '1840' = @{ wired = $false; percent = $false }; '1842' = @{ wired = $true; percent = $false }
    '1860' = @{ wired = $false; percent = $false }
  }
  foreach ($product in $aerox.Keys) {
    $model = $aerox[$product]
    foreach ($c in (Get-Colls '1038' $product)) {
      if ($c.iface -ne 3 -or $c.outLen -lt 2) { continue }
      $cmd = if ($model.wired) { 0x92 } else { 0xD2 }
      for ($round = 0; $round -lt 3; $round++) {
        $req = New-Request $c.outLen
        $req[0] = 0x00; $req[1] = [byte]$cmd
        $answered = $false
        foreach ($r in (Send-Session1 $c.path $req $c.outLen 400 4)) {
          if (-not $r -or $r.Length -lt 2) { continue }
          if ($r[0] -eq 0x40 -and $r[1] -eq 0xFF) { return $null }
          if ($r[0] -ne $cmd) { continue }
          if ($model.percent) {
            if ([int]$r[1] -gt 2) { break }
            if (-not $model.wired -and $r[1] -eq 0 -and $r[2] -eq 0) { return $null }
            if ([int]$r[2] -lt 1 -or [int]$r[2] -gt 100) { break }
            return @{ level = [int]$r[2]; charging = ($r[1] -ne 0) }
          }
          $steps = [int]$r[1] -band 0x7F
          if ($steps -eq 0) { return $null }
          if ($steps -le 21) {
            return @{ level = (($steps - 1) * 5); charging = (($r[1] -band 0x80) -ne 0) }
          }
          break
        }
        $answered = $true
      }
    }
  }
  foreach ($product in @('1830', '1872', '172B', '1726')) {
    foreach ($c in (Get-Colls '1038' $product)) {
      if ($c.outLen -lt 3) { continue }
      if ($product -eq '172B' -or $product -eq '1726') { if ($c.iface -ne 0) { continue } }
      elseif ($c.iface -ne 3) { continue }
      $req = New-Request $c.outLen
      $req[0] = 0x00; $req[1] = 0xAA; $req[2] = 0x01
      foreach ($r in (Send-Session1 $c.path $req $c.outLen 300 8)) {
        if (-not $r -or $r.Length -lt 3) { continue }
        if ([int]$r[0] -lt 1 -or [int]$r[0] -gt 100) { continue }
        return @{ level = [int]$r[0]; charging = ([int]$r[2] -ne 0) }
      }
    }
  }
  return $null
}

# ---------------------------------------------------------------------------
# HyperX (03F0 HP, 0951 Kingston). BatteryHub src/drivers/hyperx.cpp (GPL-3.0;
# protocol facts only), from HeadsetControl / HyperXWM / HyperHeadset:
#   Cloud III: 66 <cmd>; 82 connected, 8A charging, 89 mv+percent at [4].
#   Cloud II: 06 FF BB; 02 -> [7] %, 03 -> [4] charging.
#   Haste 2: 52 01 link, 50 02 -> [2] %, [3] charging, [6..7] mV.
#   Cloud Alpha: 21 BB; 03 offline, 0C charging, 0B -> [3] %.
#   Cloud III S: 0C 02 03 01 00 <cmd>; reply [5]=cmd, [6]=value.
# ---------------------------------------------------------------------------
function Get-HyperX {
  $cloud3 = @('0FCC', '05B7', '0C9D', '069F', '0995')
  foreach ($product in $cloud3) {
    foreach ($c in (Get-Colls '03F0' $product)) {
      if ($c.outLen -lt 3) { continue }
      if (($cloud3[0..2] -contains $product) -and ($c.outLen -ne 62 -or $c.inLen -ne 62)) { continue }
      if (($product -eq '069F' -or $product -eq '0995') -and ($c.page -lt 0xFF00 -or $c.outLen -lt 62)) { continue }
      $connected = $false
      foreach ($cmd in @(0x82)) {
        $req = New-Request $c.outLen
        $req[0] = 0x66; $req[1] = [byte]$cmd
        foreach ($r in (Send-Session1 $c.path $req $c.outLen 800 8)) {
          if ($r -and $r.Length -ge 5 -and $r[0] -eq 0x66 -and $r[1] -eq $cmd) { $connected = ([int]$r[2] -ne 0); break }
        }
      }
      if (-not $connected) { continue }
      $charging = $false; $level = -1
      $req = New-Request $c.outLen; $req[0] = 0x66; $req[1] = 0x8A
      foreach ($r in (Send-Session1 $c.path $req $c.outLen 800 8)) {
        if ($r -and $r.Length -ge 5 -and $r[0] -eq 0x66 -and $r[1] -eq 0x8A) { $charging = ([int]$r[2] -eq 1); break }
      }
      $req = New-Request $c.outLen; $req[0] = 0x66; $req[1] = 0x89
      foreach ($r in (Send-Session1 $c.path $req $c.outLen 800 8)) {
        if ($r -and $r.Length -ge 5 -and $r[0] -eq 0x66 -and $r[1] -eq 0x89 -and [int]$r[4] -le 100) { $level = [int]$r[4]; break }
      }
      if ($level -lt 1) { continue }
      return @{ level = $level; charging = $charging }
    }
  }
  foreach ($product in @('0696', '018B', '0D93', '0C8C')) {
    foreach ($c in (Get-Colls '03F0' $product)) {
      if ($c.page -ne 0xFF90 -or $c.usage -ne 0x0303 -or $c.outLen -lt 4) { continue }
      $req = New-Request $c.outLen; $req[0] = 0x06; $req[1] = 0xFF; $req[2] = 0xBB; $req[3] = 0x02
      $level = -1
      foreach ($r in (Send-Session1 $c.path $req $c.outLen 1000 10)) {
        if ($r -and $r.Length -ge 8 -and $r[0] -eq 0x06 -and $r[1] -eq 0xFF -and $r[2] -eq 0xBB -and $r[3] -eq 0x02 -and [int]$r[7] -le 100) { $level = [int]$r[7]; break }
      }
      if ($level -lt 1) { continue }
      $charging = $false
      $req = New-Request $c.outLen; $req[0] = 0x06; $req[1] = 0xFF; $req[2] = 0xBB; $req[3] = 0x03
      foreach ($r in (Send-Session1 $c.path $req $c.outLen 1000 10)) {
        if ($r -and $r.Length -ge 5 -and $r[0] -eq 0x06 -and $r[1] -eq 0xFF -and $r[2] -eq 0xBB -and $r[3] -eq 0x03) { $charging = ([int]$r[4] -eq 1); break }
      }
      return @{ level = $level; charging = $charging }
    }
  }
  foreach ($product in @('098D')) {
    foreach ($c in (Get-Colls '03F0' $product)) {
      if ($c.page -lt 0xFF00 -or $c.outLen -lt 4) { continue }
      $req = New-Request $c.outLen; $req[0] = 0x21; $req[1] = 0xBB; $req[2] = 0x03
      $connected = $false
      foreach ($r in (Send-Session1 $c.path $req $c.outLen 1000 10)) {
        if ($r -and $r.Length -ge 4 -and $r[0] -eq 0x21 -and $r[2] -eq 0x03) { $connected = ([int]$r[3] -ne 1); break }
      }
      if (-not $connected) { continue }
      $charging = $false
      $req = New-Request $c.outLen; $req[0] = 0x21; $req[1] = 0xBB; $req[2] = 0x0C
      foreach ($r in (Send-Session1 $c.path $req $c.outLen 1000 10)) {
        if ($r -and $r.Length -ge 4 -and $r[0] -eq 0x21 -and $r[2] -eq 0x0C) { $charging = ([int]$r[3] -eq 1); break }
      }
      $req = New-Request $c.outLen; $req[0] = 0x21; $req[1] = 0xBB; $req[2] = 0x0B
      foreach ($r in (Send-Session1 $c.path $req $c.outLen 1000 10)) {
        if ($r -and $r.Length -ge 4 -and $r[0] -eq 0x21 -and $r[2] -eq 0x0B -and [int]$r[3] -le 100 -and [int]$r[3] -ge 1) {
          return @{ level = [int]$r[3]; charging = $charging }
        }
      }
    }
  }
  foreach ($product in @('0AB5', '0D97', '0F98', '0DA0')) {
    foreach ($c in (Get-Colls '03F0' $product)) {
      if ($c.page -lt 0xFF00 -or $c.outLen -lt 2 -or $c.inLen -lt 8) { continue }
      $req = New-Request $c.outLen; $req[0] = 0x52; $req[1] = 0x01
      $linked = $true
      foreach ($r in (Send-Session1 $c.path $req $c.outLen 1000 8)) {
        if ($r -and $r.Length -ge 8 -and $r[0] -eq 0x53 -and $r[1] -eq 0x01) { $linked = ([int]$r[2] -ne 0); break }
      }
      if (-not $linked) { continue }
      $req = New-Request $c.outLen; $req[0] = 0x50; $req[1] = 0x02
      foreach ($r in (Send-Session1 $c.path $req $c.outLen 1000 8)) {
        if (-not $r -or $r.Length -lt 8 -or $r[0] -ne 0x51 -or $r[1] -ne 0x02) { continue }
        if ([int]$r[2] -lt 1 -or [int]$r[2] -gt 100) { continue }
        return @{ level = [int]$r[2]; charging = ([int]$r[3] -eq 1 -or [int]$r[3] -eq 2) }
      }
    }
  }
  foreach ($product in @('06BE', '02CC')) {
    foreach ($c in (Get-Colls '03F0' $product)) {
      if ($c.outLen -ne 64 -or $c.inLen -ne 64) { continue }
      $req = New-Request $c.outLen
      $req[0] = 0x0C; $req[1] = 0x02; $req[2] = 0x03; $req[3] = 0x01; $req[4] = 0x00; $req[5] = 0x02
      $connected = $false
      foreach ($r in (Send-Session1 $c.path $req $c.outLen 1000 8)) {
        if ($r -and $r.Length -ge 7 -and $r[0] -eq 0x0C -and $r[5] -eq 0x02 -and $r[6] -ne 0xFF) { $connected = ([int]$r[6] -eq 2); break }
      }
      if (-not $connected) { continue }
      $charging = $false
      $req = New-Request $c.outLen; $req[0] = 0x0C; $req[1] = 0x02; $req[2] = 0x03; $req[3] = 0x01; $req[4] = 0x00; $req[5] = 0x48
      foreach ($r in (Send-Session1 $c.path $req $c.outLen 1000 8)) {
        if ($r -and $r.Length -ge 7 -and $r[0] -eq 0x0C -and $r[5] -eq 0x48 -and $r[6] -ne 0xFF) { $charging = ([int]$r[6] -eq 1 -or [int]$r[6] -eq 2); break }
      }
      $req = New-Request $c.outLen; $req[0] = 0x0C; $req[1] = 0x02; $req[2] = 0x03; $req[3] = 0x01; $req[4] = 0x00; $req[5] = 0x06
      foreach ($r in (Send-Session1 $c.path $req $c.outLen 1000 8)) {
        if ($r -and $r.Length -ge 7 -and $r[0] -eq 0x0C -and $r[5] -eq 0x06 -and [int]$r[6] -ge 1 -and [int]$r[6] -le 100) {
          return @{ level = [int]$r[6]; charging = $charging }
        }
      }
    }
  }
  return $null
}

# ---------------------------------------------------------------------------
# Jabra GNP headsets (0B0E). BatteryHub src/drivers/jabra.cpp (GPL-3.0;
# protocol facts only), from jabridge and HeadsetControl:
#   query [05][dst][00][seq][46][class][op]; reply [05][00][dst][seq][C0|len]
#   [class][op][payload]; class 12 / 02 battery -> payload [flags][level],
#   flags bit 0 charging; class FE = NAK (F3 = headset offline behind a dongle).
#   Address 08 = USB cable, 04 = headset behind a Jabra Link dongle.
#   DECT bases are skipped (their base answers at 08, headset at 10).
# ---------------------------------------------------------------------------
$JABRA_DECT = @(
  0x1000, 0x1016, 0x1017, 0x1018, 0x1021, 0x1022, 0x1023, 0x1037, 0x1038, 0x1039, 0x1041, 0x1042,
  0x1043, 0x1110, 0x1112, 0x1113, 0x1118, 0x111A, 0x111B, 0x111D, 0x111E, 0x111F, 0x1120, 0x1121,
  0x1122, 0x1123, 0x1124, 0x1126, 0x1131, 0x1132, 0x1133, 0x1134, 0x1135, 0x1136, 0x1140, 0x1141,
  0x1142, 0x1146, 0x1147, 0x1148, 0x114A, 0x114B, 0x114C, 0x114D, 0x114E, 0x114F, 0x1150, 0x1151,
  0xA700, 0xA701, 0xA702, 0xA703, 0xA704, 0xA705, 0xA706, 0xAE60, 0xAE62, 0xAE63
)

function Invoke-Jabra($c, [byte]$dst, [byte]$cls, [byte]$op, [int]$timeoutMs) {
  $script:jabraSeq = (($script:jabraSeq + 1) -band 0xFF)
  $seq = $script:jabraSeq
  $req = New-Request $c.outLen
  $req[0] = 0x05; $req[1] = $dst; $req[2] = 0x00; $req[3] = [byte]$seq
  $req[4] = 0x46; $req[5] = $cls; $req[6] = $op
  foreach ($r in (Send-Session1 $c.path $req $c.outLen $timeoutMs 10)) {
    if (-not $r -or $r.Length -lt 7) { continue }
    if ($r[0] -ne 0x05 -or $r[1] -ne 0x00 -or $r[2] -ne $dst -or $r[3] -ne $seq) { continue }
    if (($r[4] -band 0xC0) -ne 0xC0) { continue }
    if ($r[5] -eq 0xFE) { return @{ nak = [int]$r[6] } }
    $len = [int]$r[4] -band 0x3F
    if ($r[5] -ne $cls -or $r[6] -ne $op -or $len -lt 6 -or ($len + 1) -gt $r.Length) { continue }
    return @{ payload = @($r[7..$len]) }
  }
  return $null
}

function Get-Jabra {
  $script:jabraSeq = 0x20
  foreach ($key in @($pnp.Keys | Where-Object { $_ -like '0B0E:*' })) {
    $product = ($key -split ':')[1]
    $pidNum = [Convert]::ToInt32($product, 16)
    if ($JABRA_DECT -contains $pidNum) { continue }
    # GNP is a whole-vid protocol; only a node named Jabra may receive it.
    if (-not (Test-ModelName (Get-Name $key) @('Jabra'))) { continue }
    foreach ($c in (Get-Colls '0B0E' $product)) {
      if ($c.page -ne 0xFF00 -or ($c.usage -ne 0x05 -and $c.usage -ne 0x01)) { continue }
      if ($c.outLen -lt 64 -or $c.inLen -lt 64) { continue }
      $name = Get-DeviceName '0B0E' $product 'Jabra headset'
      $dongle = ($name -match 'Link')
      $order = if ($dongle) { @(0x04, 0x08) } else { @(0x08, 0x04) }
      foreach ($address in $order) {
        $reply = Invoke-Jabra $c ([byte]$address) 0x12 0x02 700
        if (-not $reply) { continue }
        if ($reply.ContainsKey('nak')) {
          if ($dongle -and $reply.nak -eq 0xF3) { return $null }
          continue
        }
        if ($reply.payload.Count -lt 2) { continue }
        $flags = [int]$reply.payload[0]
        $level = [int]$reply.payload[1]
        if ($level -lt 1 -or $level -gt 100) { continue }
        return @{ level = $level; charging = (($flags -band 0x01) -ne 0) }
      }
    }
  }
  return $null
}

# ---------------------------------------------------------------------------
# MCHOSE mice on 5253 and the Realtek 3837 dongles. BatteryHub
# src/drivers/mchose.cpp (GPL-3.0; protocol facts only), from
# alexfrih/mchose-linux and the M HUB driver:
#   feature report 0x12 on FF01:0001, payload [06 00 ...] with EVERY payload
#   byte inverted (^ FF); reply [12][F9][inverted payload].
#   payload: vid u16, model u16, firmware u32, flags, level, charging.
#   An all-zero payload is the receiver echoing while the mouse sleeps.
# ---------------------------------------------------------------------------
function Get-Mchose([string]$vid, [string]$product) {
  foreach ($c in (Get-Colls $vid $product)) {
    if ($c.page -ne 0xFF01 -or $c.usage -ne 0x0001 -or $c.featLen -lt 65) { continue }
    $best = -1
    $bestLevel = -1; $bestCharging = -1
    for ($attempt = 0; $attempt -lt 5; $attempt++) {
      if ($attempt -gt 0) { Start-Sleep -Milliseconds 100 }
      $req = New-Request $c.featLen
      for ($i = 0; $i -lt $req.Length; $i++) { $req[$i] = 0xFF }
      $req[0] = 0x12
      $req[1] = 0xF9
      $r = [DevBattHid]::Feature($c.path, $req, $c.featLen, 400, 120)
      if (-not $r -or $r.Length -lt 13 -or $r[0] -ne 0x12 -or $r[1] -ne 0xF9) { continue }
      $p = @()
      for ($i = 0; $i -lt 11; $i++) { $p += ([int]$r[2 + $i] -bxor 0xFF) }
      $allZero = $true
      foreach ($b in $p) { if ($b -ne 0) { $allZero = $false; break } }
      if ($allZero) { $best = [Math]::Max($best, 0); continue }
      $field = $p[0] -bor ($p[1] -shl 8)
      if ($field -ne 0x5253 -and $field -ne 0x41E4 -and $field -ne 0x3837) { continue }
      if ($p[9] -gt 100) { continue }
      $best = 1; $bestLevel = $p[9]; $bestCharging = $p[10]
      break
    }
    if ($best -lt 0) { continue }
    if ($best -eq 0 -or $bestLevel -lt 1) { return $null }
    return @{ level = $bestLevel; charging = ($bestCharging -ne 0) }
  }
  return $null
}

# ---------------------------------------------------------------------------
# Rapoo VT mice (24AE). BatteryHub src/drivers/rapoo.cpp and rapoo_protocol.h
# (GPL-3.0; protocol facts only), from Rapoo Hub and PyFlat's decoder:
#   passive reports on FF00:0002, no request: Nordic 54L frame 07 with
#   [7] state [8] percent; legacy VT3 Pro frame BB B0 with [5] state [6]
#   percent. State 1 battery / 2 charging; 0 is a transition.
# ---------------------------------------------------------------------------
function Get-Rapoo([string]$product) {
  $legacy = @('1215', '4415', '1233', '4433', '1244')
  $inLen = 16
  if ($product -eq '1417') { $inLen = 13 }
  if ($legacy -contains $product) { $inLen = 7 }
  foreach ($c in (Get-Colls '24AE' $product)) {
    if ($c.page -ne 0xFF00 -or $c.usage -ne 0x0002) { continue }
    if ($c.inLen -ne $inLen -and -not ($legacy -contains $product -and $c.inLen -eq 7)) { continue }
    foreach ($r in [DevBattHid2]::Inputs($c.path, $c.inLen, 3500, 3)) {
      if (-not $r -or $r.Length -lt 7) { continue }
      $state = -1; $level = -1
      if ($r[0] -eq 0x07 -and $r.Length -ge 9 -and ($r[1] -band 0x0F) -le 2) {
        $state = [int]$r[7]; $level = [int]$r[8]
      } elseif ($r[0] -eq 0xBB -and $r[1] -eq 0xB0) {
        $state = [int]$r[5]; $level = [int]$r[6]
      } else { continue }
      if ($state -ne 1 -and $state -ne 2) { continue }
      if ($level -lt 1 -or $level -gt 100) { continue }
      return @{ level = $level; charging = ($state -eq 2) }
    }
    return $null
  }
  return $null
}

# ---------------------------------------------------------------------------
# DAREU (260D). BatteryHub src/drivers/dareu.cpp (GPL-3.0; protocol facts only):
#   EM901X: feature 08 on FF02:0002 and input 09 on FF01:0000 of the same
#     product: [08][04][00 x14][49]; input [09][04][0]...[6]=percent [7]=on
#     cable. Only command 04 is sent.
#   A84: feature 0 on interface 0: [00][04 F6 00 ...] (65 bytes); three reads
#     discarded, then byte 15 non-zero and byte 5 = percent. No charging flag.
#   A980 Pro Togran: feature 0A on consumer page 000C: [0A][slot<<4][len][class]
#     [cmd]; reply [1]&0F == 2 matches class/cmd. class 07/80 gives [7] status
#     (1 charging), [8] level, [9] max.
# ---------------------------------------------------------------------------
function Get-DareuEm901x([string]$product) {
  $inputs = @(Get-Colls '260D' $product | Where-Object { $_.iface -eq 1 -and $_.page -eq 0xFF01 -and $_.usage -eq 0 -and $_.inLen -eq 17 })
  $features = @(Get-Colls '260D' $product | Where-Object { $_.iface -eq 1 -and $_.page -eq 0xFF02 -and $_.usage -eq 2 -and $_.featLen -eq 17 })
  if ($inputs.Count -ne 1 -or $features.Count -ne 1) { return $null }
  $req = New-Request 17
  $req[0] = 0x08; $req[1] = 0x04; $req[16] = 0x49
  foreach ($r in [DevBattHid2]::FeatureThenInputs($features[0].path, $inputs[0].path, $req, 17, 17, 500, 32)) {
    if (-not $r -or $r.Length -lt 17 -or $r[0] -ne 0x09 -or $r[1] -ne 0x04 -or $r[2] -ne 0) { continue }
    if ([int]$r[6] -lt 1 -or [int]$r[6] -gt 100) { continue }
    return @{ level = [int]$r[6]; charging = ([int]$r[7] -ne 0) }
  }
  return $null
}

function Get-DareuA84 {
  foreach ($c in (Get-Colls '260D' '0022')) {
    if ($c.iface -ne 0 -or $c.page -ne 0x01 -or $c.usage -ne 0x06 -or $c.featLen -ne 65) { continue }
    $req = New-Request 65
    $req[1] = 0x04; $req[2] = 0xF6
    $reads = @([DevBattHid2]::FeatureReads($c.path, $req, 65, 10, 6, 10))
    if ($reads.Count -lt 4) { continue }
    for ($i = 3; $i -lt $reads.Count; $i++) {
      $r = $reads[$i]
      if (-not $r -or $r.Length -lt 16 -or $r[15] -eq 0) { continue }
      if ([int]$r[5] -lt 1 -or [int]$r[5] -gt 100) { continue }
      return @{ level = [int]$r[5]; charging = $false }
    }
  }
  return $null
}

function Invoke-Togran($c, [byte]$slot, [byte]$len, [byte]$cls, [byte]$cmd) {
  $req = New-Request 65
  $req[0] = 0x0A; $req[1] = [byte](($slot -shl 4) -band 0xF0); $req[2] = $len; $req[3] = $cls; $req[4] = $cmd
  $reads = @([DevBattHid2]::FeatureReads($c.path, $req, 65, 30, 15, 30))
  foreach ($r in $reads) {
    if (-not $r -or $r.Length -lt 11) { continue }
    if (($r[1] -band 0x0F) -eq 2 -and $r[3] -eq $cls -and $r[4] -eq $cmd) { return $r }
  }
  return $null
}

function Get-DareuTogran {
  foreach ($product in @('1131', '1148')) {
    $colls = @(Get-Colls '260D' $product | Where-Object { $_.page -eq 0x000C -and $_.usage -eq 1 -and $_.featLen -eq 65 })
    if ($colls.Count -ne 1) { continue }
    $c = $colls[0]
    if ($product -eq '1148') {
      $r = Invoke-Togran $c 0 4 0x07 0x80
      if (-not $r) { continue }
      $max = if ($r[9] -ne 0) { [int]$r[9] } else { 100 }
      if ([int]$r[8] -gt $max) { continue }
      $level = [int][Math]::Floor([int]$r[8] * 100 / $max)
      if ($level -lt 1) { continue }
      return @{ level = $level; charging = ([int]$r[7] -eq 1) }
    }
    $list = Invoke-Togran $c 0 6 0x00 0xA0
    if (-not $list) { continue }
    $count = [int]$list[7]
    for ($slot = 1; $slot -le $count -and $slot -le 5; $slot++) {
      $at = 8 + ($slot - 1) * 3
      if ($at + 2 -ge $list.Length -or $list[$at] -eq 0) { continue }
      $r = Invoke-Togran $c ([byte]$slot) 4 0x07 0x80
      if (-not $r) { continue }
      $max = if ($r[9] -ne 0) { [int]$r[9] } else { 100 }
      if ([int]$r[8] -gt $max) { continue }
      $level = [int][Math]::Floor([int]$r[8] * 100 / $max)
      if ($level -lt 1) { continue }
      $mouse = (([int]$list[$at + 1] -shl 8) -bor [int]$list[$at + 2])
      return @{ level = $level; charging = ([int]$r[7] -eq 1); name = ('DAREU ' + $mouse.ToString('X4')) }
    }
  }
  return $null
}

# ---------------------------------------------------------------------------
# Fantech / Redragon Areson (25A7). BatteryHub src/drivers/fantech.cpp
# (GPL-3.0; protocol facts only), from xd5-go-web and libratbag #1893:
#   17-byte feature report 08 on the vendor collection:
#   [08][cmd][00 x14][checksum], sum of all 17 = 0x55.
#   cmd 04 battery; reply [6] percent [7] charging (also accepted at the two
#   WebHID layouts 5/6 or 4/5 when the report id is kept). 25A7:FA7E reports
#   the level in 10 % steps and is multiplied.
# ---------------------------------------------------------------------------
function Convert-FantechReply($r, [int]$multiplier) {
  if (-not $r -or $r.Length -lt 6) { return $null }
  $pairs = @()
  if ($r.Length -ge 8 -and $r[0] -eq 0x04) { $pairs += ,@(5, 6); $pairs += ,@(4, 5) }
  if ($r.Length -ge 8 -and $r[1] -eq 0x04) { $pairs += ,@(6, 7) }
  foreach ($pair in $pairs) {
    $p = $pair[0]; $ch = $pair[1]
    if ($p -ge $r.Length -or $ch -ge $r.Length) { continue }
    $level = [int]$r[$p] * $multiplier
    if ($level -lt 1 -or $level -gt 100) { continue }
    if ([int]$r[$ch] -gt 1) { continue }
    return @{ level = $level; charging = ([int]$r[$ch] -eq 1) }
  }
  return $null
}

function Get-Fantech([string]$product) {
  $colls = @(Get-Colls '25A7' $product)
  if ($colls.Count -eq 0) { return $null }
  $feat = $null
  foreach ($c in $colls) { if ($c.featLen -ge 17) { $feat = $c; break } }
  if (-not $feat) { return $null }
  $req = New-Request 17
  $req[0] = 0x08; $req[1] = 0x04
  $sum = 0
  for ($i = 0; $i -lt 16; $i++) { $sum += [int]$req[$i] }
  $req[16] = [byte]((0x55 - $sum) -band 0xFF)
  $multiplier = 1
  if ($product -eq 'FA7E') { $multiplier = 10 }
  $readers = @($colls | Where-Object { $_.inLen -ge 6 })
  if ($readers.Count -eq 0) { return $null }
  foreach ($reader in $readers) {
    foreach ($r in [DevBattHid2]::FeatureThenInputs($feat.path, $reader.path, $req, 17, $reader.inLen, 500, 12)) {
      $read = Convert-FantechReply $r $multiplier
      if ($read) { return $read }
    }
  }
  return $null
}


# ---------------------------------------------------------------------------
# ASUS ROG keyboards (0B05). BatteryHub src/drivers/rog.cpp (GPL-3.0;
# protocol facts only), from rog-battery / G-Helper:
#   query [report id][12][sub], sub 01 = keyboard battery; reply keyboard
#   [6] = percent, [9] = 1 charging (Falchion [11]). Offsets count the report
#   id byte, which Windows omits on an unnumbered report, so raw = offset - 1.
#   [1..2] == FF AA means the keyboard behind the receiver did not answer.
# Only the keyboard query is added here; the mouse query already exists above.
# ---------------------------------------------------------------------------
function Get-AsusKeyboard([string]$product) {
  $falchion = @('193E', '193C', '1B04', '1B06')
  $offset = 6
  if ($falchion -contains $product) { $offset = 11 }
  foreach ($c in (Get-Colls '0B05' $product)) {
    if ($c.iface -ne 1 -or $c.outLen -lt 3) { continue }
    $req = New-Request $c.outLen
    $req[0] = 0x00; $req[1] = 0x12; $req[2] = 0x01
    foreach ($r in (Send-Session1 $c.path $req $c.outLen 400 8)) {
      if (-not $r -or $r.Length -lt 10) { continue }
      if ($r[0] -eq 0xFF -and $r[1] -eq 0xAA) { return $null }
      if ($r[0] -ne 0x12 -or $r[1] -ne 0x01) { continue }
      $at = $offset - 1
      if ($at -ge $r.Length) { continue }
      $level = [int]$r[$at]
      if ($level -lt 1 -or $level -gt 100) { continue }
      return @{ level = $level; charging = ([int]$r[8] -eq 1) }
    }
  }
  return $null
}

# ---------------------------------------------------------------------------
# The probe itself. Every brand is attempted only when its vendor id is
# present; a brand that does not answer leaves no row and the device page keeps
# its em dash. Read-only: the packets below are the status queries documented
# above, and nothing else is sent.
# ---------------------------------------------------------------------------
$script:rows = @()
$script:seen = @{}
$script:evisionSeq = 0

# Logitech HID++ 2.0 (046D): unchanged from the first reader.
foreach ($key in @($pnp.Keys | Where-Object { $_ -like '046D:*' })) {
  $read = Get-LogitechLevel '046D' ($key -replace '^046D:', '')
  if (-not $read) { continue }
  Add-Row (Get-Name $key) $read.level $read.charging 'hidpp'
}

# Razer feature report, class 07 / id 80 (1532).
foreach ($product in $RAZER_PIDS.Keys) {
  $read = Get-RazerLevel '1532' $product ([int]$RAZER_PIDS[$product])
  if (-not $read) { continue }
  Add-Row (Get-Name ('1532:' + $product)) $read.level $read.charging 'razer'
}

# ASUS ROG output report 00 12 07 (0B05).
foreach ($product in $ASUS_PIDS) {
  $read = Get-AsusLevel '0B05' $product
  if (-not $read) { continue }
  Add-Row (Get-Name ('0B05:' + $product)) $read.level $read.charging 'asus'
}

# ASUS ROG keyboards, query 12 01 (0B05).
foreach ($product in @('1A83', '1A85', '1B42', '1B3F', '1CF1', '1CEF', '1C25', '1C24', '193E', '193C', '1B04', '1B06', '1AB0', '1AAE', '1B7A', '1B78', '1A07')) {
  $read = Get-AsusKeyboard $product
  if (-not $read) { continue }
  Add-Row (Get-Name ('0B05:' + $product)) $read.level $read.charging 'asus-kb'
}

# LAMZU. A whole-vid protocol, so each pid has to name a LAMZU model before its
# 65-byte feature frame is sent; an unrelated product on 373E/37B0 is skipped.
$LAMZU_MODELS = @('LAMZU', 'Maya', 'Tachi', 'Inca', 'Paro', 'Thorn', 'Atlantis', 'Orcus')
foreach ($vid in @('373E', '37B0')) {
  foreach ($product in (Get-Products $vid)) {
    $name = Get-Name ($vid + ':' + $product)
    if (-not (Test-ModelName $name $LAMZU_MODELS)) { continue }
    $read = Get-Lamzu $vid $product
    if (-not $read) { continue }
    Add-Row (Get-DeviceName $vid $product 'LAMZU wireless mouse') $read.level $read.charging 'lamzu'
  }
}

# Glorious / G-Wolves (258A, 33E4)
foreach ($pair in @(@('258A', '2022'), @('258A', '2011'), @('258A', '2023'), @('258A', '2012'), @('258A', '2024'), @('258A', '2013'), @('258A', '2025'), @('258A', '2014'), @('258A', '2033'), @('258A', '2034'), @('258A', '2036'), @('258A', '201A'), @('33E4', '3854'))) {
  $read = Get-Glorious $pair[0] $pair[1]
  if (-not $read) { continue }
  Add-Row (Get-DeviceName $pair[0] $pair[1] 'Glorious wireless mouse') $read.level $read.charging 'xvi'
}

# Endgame Gear
$read = Get-Endgame4K
if ($read) { Add-Row (Get-DeviceName '3367' '1970' 'Endgame Gear 4k wireless mouse') $read.level $read.charging 'endgame-4k' }
$read = Get-EndgameWe
if ($read) { Add-Row (Get-DeviceName '3367' '1961' 'Endgame Gear XM2we') $read.level $read.charging 'endgame-we' }

# EWEADN
foreach ($product in @('103D', '1027')) {
  $read = Get-Eweadn '372E' $product
  if (-not $read) { continue }
  Add-Row (Get-DeviceName '372E' $product 'EWEADN wireless mouse') $read.level $read.charging 'eweadn'
}

# ATK / VGN / VXE keyboards and Redragon M999 (Evision 04 / 1A)
foreach ($product in @('5088', '5055')) {
  $name = Get-DeviceName '320F' $product 'ATK / VGN wireless keyboard'
  $flag = if ($name -match 'VGN|VXE') { 0x06 } else { 0x00 }
  foreach ($c in (Get-Colls '320F' $product)) {
    if ($c.page -ne 0xFF1C -or $c.usage -ne 0x0092) { continue }
    $read = Invoke-Evision $c.path $c.outLen ([byte]$flag) 2500
    if (-not $read) { continue }
    Add-Row $name $read.level $read.charging 'evision'
    break
  }
}
foreach ($pair in @(@('320F', '226F', 0x02), @('320F', '50C3', 0x00), @('373B', '1012', 0x00))) {
  $vid = $pair[0]; $product = $pair[1]; $flag = [byte]$pair[2]
  foreach ($c in (Get-Colls $vid $product)) {
    if ($c.page -ne 0xFF1C -or $c.usage -ne 0x0092) { continue }
    $read = Invoke-Evision $c.path $c.outLen $flag 2500
    if (-not $read) { continue }
    $fallback = if ($product -eq '226F') { 'Redragon wireless mouse' } elseif ($product -eq '1012') { 'ATK Z87' } else { 'AJAZZ AK992' }
    Add-Row (Get-DeviceName $vid $product $fallback) $read.level $read.charging 'evision'
    break
  }
}

# AULA / MCHOSE BY keyboards
foreach ($pair in @(@('3554', 'FA09'), @('3554', 'FB40'), @('41E4', '2001'))) {
  $read = Get-AulaKeyboard $pair[0] $pair[1]
  if (-not $read) { continue }
  Add-Row (Get-DeviceName $pair[0] $pair[1] 'AULA / MCHOSE wireless keyboard') $read.level $read.charging 'aula-keyboard'
}

# Cooler Master
$read = Get-CoolerMaster '2516' '01B7'
if ($read) { Add-Row (Get-DeviceName '2516' '01B7' $read.name) $read.level $read.charging 'coolermaster' }
foreach ($product in @('0169', '0167')) {
  $read = Get-CoolerMaster '2516' $product
  if (-not $read) { continue }
  Add-Row (Get-DeviceName '2516' $product $read.name) $read.level $read.charging 'coolermaster'
}

# Finalmouse
foreach ($product in @('0100', '0300', '0301')) {
  $read = Get-Finalmouse $product
  if (-not $read) { continue }
  Add-Row (Get-DeviceName '361D' $product $read.name) $read.level $read.charging 'finalmouse'
}

# Audeze
$read = Get-Audeze
if ($read) { Add-Row $read.name $read.level $read.charging 'audeze' }

# Corsair
foreach ($product in @('1B1C', '1B27', '0A14', '0A16', '0A17', '0A1D', '0A1A', '1B2A', '1B23', '1B29', '0A55', '0A51', '0A52', '0A38', '0A4F', '0A2B', '0A75', '0A56')) {
  $read = Get-CorsairVoid $product
  if (-not $read) { continue }
  Add-Row (Get-DeviceName '1B1C' $product 'Corsair wireless headset') $read.level $read.charging 'corsair-void'
}
foreach ($product in @('2B2A', '2B34')) {
  $read = Get-CorsairCompx $product
  if (-not $read) { continue }
  Add-Row (Get-DeviceName '1B1C' $product 'Corsair wireless mouse') $read.level $read.charging 'corsair-compx'
}
foreach ($product in @('2A08', '2A02', '0A97', '0A64', '0A62', '0A3E', '0A3D', '2B00')) {
  $read = Get-CorsairBragi $product
  if (-not $read) { continue }
  Add-Row (Get-DeviceName '1B1C' $product 'Corsair wireless device') $read.level $read.charging 'corsair-bragi'
}

# SteelSeries
$read = Get-SteelSeries
if ($read) { Add-Row (Get-FirstName '1038' 'SteelSeries wireless device') $read.level $read.charging 'steelseries' }

# HyperX
$read = Get-HyperX
if ($read) { Add-Row (Get-FirstName '03F0' 'HyperX wireless device') $read.level $read.charging 'hyperx' }

# Jabra
$read = Get-Jabra
if ($read) { Add-Row (Get-FirstName '0B0E' 'Jabra headset') $read.level $read.charging 'jabra' }

# MCHOSE. 5253 is the brand's own vid (whole-vid protocol, name guard); the 3837
# dongle is a Realtek part shared with other vendors, so the pid list is exact
# and the name guard keeps its bytes from reaching another vendor's device.
$MCHOSE_MODELS = @('MCHOSE')
foreach ($pair in @(@('5253', ''), @('3837', '100C'), @('3837', '100B'), @('3837', '100A'), @('3837', '1001'), @('3837', '1012'))) {
  $pids = if ($pair[1]) { @($pair[1]) } else { (Get-Products $pair[0]) }
  foreach ($product in $pids) {
    $name = Get-Name ($pair[0] + ':' + $product)
    if (-not (Test-ModelName $name $MCHOSE_MODELS)) { continue }
    $read = Get-Mchose $pair[0] $product
    if (-not $read) { continue }
    Add-Row (Get-DeviceName $pair[0] $product 'MCHOSE wireless mouse') $read.level $read.charging 'mchose'
  }
}

# Rapoo
foreach ($product in @('1410','1420','1415','1444','1422','1423','1412','1417','1B06','1411','1421','1413','1416','1414','1418','1215','1233','1244','4610','4620','4615','4644','4622','4623','4612','4617','4B06','4611','4621','4613','4616','4614','4618','4415','4433')) {
  $read = Get-Rapoo $product
  if (-not $read) { continue }
  Add-Row (Get-DeviceName '24AE' $product 'Rapoo wireless mouse') $read.level $read.charging 'rapoo'
}

# DAREU
foreach ($product in @('1090', '1074', '1125')) {
  $read = Get-DareuEm901x $product
  if (-not $read) { continue }
  $fallback = if ($product -eq '1125') { 'Sharkoon Skiller SGM50W' } else { 'DAREU EM901X' }
  Add-Row (Get-DeviceName '260D' $product $fallback) $read.level $read.charging 'dareu-compx'
}
$read = Get-DareuA84
if ($read) { Add-Row (Get-DeviceName '260D' '0022' 'DAREU A84') $read.level $read.charging 'dareu-sonix' }
$read = Get-DareuTogran
if ($read) { Add-Row (Get-DeviceName '260D' '1131' $read.name) $read.level $read.charging 'dareu-togran' }

# Fantech / Redragon Areson
foreach ($product in @('FA7B', 'FA7C', 'FA7E')) {
  $read = Get-Fantech $product
  if (-not $read) { continue }
  $fallback = if ($product -eq 'FA7E') { 'Redragon Invader Pro' } else { 'Fantech Helios Go XD5' }
  Add-Row (Get-DeviceName '25A7' $product $fallback) $read.level $read.charging 'fantech'
}

[pscustomobject]@{ devices = $script:rows } | ConvertTo-Json -Compress -Depth 4
