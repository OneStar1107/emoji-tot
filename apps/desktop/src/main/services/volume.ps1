# EmojiTot volume bridge — the Windows master volume, through CoreAudio.
#
#   volume.ps1 -Get          -> {"ok":true,"volume":40,"muted":false}
#   volume.ps1 -Set 40       -> set master volume to 40%, print the new state
#   volume.ps1 -Mute 1       -> mute (0 unmutes), print the new state
#   volume.ps1 -Watch        -> read "get" / "set 40" / "mute 1" lines from
#                               stdin and answer one JSON line each until EOF
#
# The island has no Node-accessible master-volume API, so this talks to the
# same endpoint Windows' own volume flyout uses: the default render device's
# IAudioEndpointVolume. The COM interfaces are declared here as C# because
# PowerShell's COM binder cannot late-bind a non-IDispatch interface; there is
# no package to install and no native dependency to ship.
#
# One-shot calls start PowerShell and compile the class every time, which is
# fine for a read at panel-open. A drag is different: -Watch keeps the process
# (and the compiled class) alive so each step is a line on stdin instead of a
# 600ms spawn, and the caller sends only the latest value of a drag.
param(
  [switch]$Get,
  [switch]$Watch,
  [int]$Set = -1,
  [int]$Mute = -1
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$source = @'
using System;
using System.Runtime.InteropServices;

namespace EmojiTot
{
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    internal class MMDeviceEnumeratorComObject { }

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
    internal interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
        [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
    }

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("D666063F-1587-4E43-81F1-B948E807363F")]
    internal interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
        [PreserveSig] int OpenPropertyStore(int access, out IntPtr store);
        [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig] int GetState(out int state);
    }

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("5CDF2C82-841E-4546-9722-0CF74078229A")]
    internal interface IAudioEndpointVolume
    {
        [PreserveSig] int RegisterControlChangeNotify(IntPtr notify);
        [PreserveSig] int UnregisterControlChangeNotify(IntPtr notify);
        [PreserveSig] int GetChannelCount(out uint count);
        [PreserveSig] int SetMasterVolumeLevel(float level, ref Guid context);
        [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid context);
        [PreserveSig] int GetMasterVolumeLevel(out float level);
        [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
        [PreserveSig] int SetChannelVolumeLevel(uint channel, float level, ref Guid context);
        [PreserveSig] int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context);
        [PreserveSig] int GetChannelVolumeLevel(uint channel, out float level);
        [PreserveSig] int GetChannelVolumeLevelScalar(uint channel, out float level);
        [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
        [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
        [PreserveSig] int GetVolumeStepInfo(out uint step, out uint stepCount);
        [PreserveSig] int VolumeStepUp(ref Guid context);
        [PreserveSig] int VolumeStepDown(ref Guid context);
        [PreserveSig] int QueryHardwareSupport(out uint mask);
        [PreserveSig] int GetVolumeRange(out float min, out float max, out float increment);
    }

    public static class Audio
    {
        private const int Render = 0;
        private const int Multimedia = 1;
        private const int ClsCtxAll = 23;
        private static readonly Guid VolumeIid = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");

        private static IAudioEndpointVolume Open()
        {
            var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
            IMMDevice device;
            Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(Render, Multimedia, out device));
            object native;
            var iid = VolumeIid;
            Marshal.ThrowExceptionForHR(device.Activate(ref iid, ClsCtxAll, IntPtr.Zero, out native));
            return (IAudioEndpointVolume)native;
        }

        /// <summary>Master volume as 0-100, plus mute, in one endpoint read.</summary>
        public static string Snapshot()
        {
            var endpoint = Open();
            float scalar;
            Marshal.ThrowExceptionForHR(endpoint.GetMasterVolumeLevelScalar(out scalar));
            bool muted;
            Marshal.ThrowExceptionForHR(endpoint.GetMute(out muted));
            var level = (int)Math.Round(scalar * 100);
            if (level < 0) level = 0;
            if (level > 100) level = 100;
            return level + "|" + (muted ? "1" : "0");
        }

        public static void SetVolume(int value)
        {
            var endpoint = Open();
            var context = Guid.Empty;
            var level = value < 0 ? 0 : value > 100 ? 100 : value;
            Marshal.ThrowExceptionForHR(endpoint.SetMasterVolumeLevelScalar(level / 100f, ref context));
        }

        public static void SetMute(bool value)
        {
            var endpoint = Open();
            var context = Guid.Empty;
            Marshal.ThrowExceptionForHR(endpoint.SetMute(value, ref context));
        }
    }
}
'@

function Write-State {
  $parts = [EmojiTot.Audio]::Snapshot() -split '\|'
  [ordered]@{ ok = $true; volume = [int]$parts[0]; muted = ($parts[1] -eq '1') } | ConvertTo-Json -Compress
}

try {
  Add-Type -TypeDefinition $source -Language CSharp -ErrorAction Stop
} catch {
  [ordered]@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
  exit 1
}

if ($Watch) {
  while ($null -ne ($line = [Console]::In.ReadLine())) {
    $line = $line.Trim()
    if (-not $line) { continue }
    $parts = $line -split '\s+'
    try {
      switch ($parts[0]) {
        'get'  { }
        'set'  { [EmojiTot.Audio]::SetVolume([int]$parts[1]) }
        'mute' { [EmojiTot.Audio]::SetMute($parts[1] -eq '1') }
        default { throw "unknown command: $($parts[0])" }
      }
      Write-State
    } catch {
      [ordered]@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
    }
  }
  exit
}

try {
  if (-not $Get -and $Set -lt 0 -and $Mute -lt 0) { $Get = $true }
  if ($Set -ge 0) { [EmojiTot.Audio]::SetVolume($Set) }
  if ($Mute -ge 0) { [EmojiTot.Audio]::SetMute($Mute -eq 1) }
  Write-State
} catch {
  [ordered]@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
  exit 1
}
