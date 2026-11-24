# EmojiTot NetEase audio-state probe.
#
#   netease-audio.ps1 -Watch  -> one JSON line every 500 ms until killed
#   netease-audio.ps1         -> one JSON line, then exit
#
# Some NetEase clients do not publish a Windows SMTC session. CoreAudio still
# knows whether cloudmusic.exe owns an audio session and whether that session
# is active, so this probe supplies the process/play-pause half of the
# fallback. The precise track, duration and seek position come from the
# MIT-licensed elog reader in netease-elog.js.
param([switch]$Watch)

$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$source = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

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
        [PreserveSig] int Activate(
            ref Guid iid,
            int clsCtx,
            IntPtr activationParams,
            [MarshalAs(UnmanagedType.IUnknown)] out object instance);
        [PreserveSig] int OpenPropertyStore(int access, out IntPtr store);
        [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig] int GetState(out int state);
    }

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F")]
    internal interface IAudioSessionManager2
    {
        [PreserveSig] int GetAudioSessionControl(ref Guid sessionGuid, int streamFlags, out IAudioSessionControl session);
        [PreserveSig] int GetSimpleAudioVolume(ref Guid sessionGuid, int streamFlags, out IntPtr volume);
        [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator sessionEnum);
        [PreserveSig] int RegisterSessionNotification(IntPtr notification);
        [PreserveSig] int UnregisterSessionNotification(IntPtr notification);
        [PreserveSig] int RegisterDuckNotification(
            [MarshalAs(UnmanagedType.LPWStr)] string sessionId,
            IntPtr notification);
        [PreserveSig] int UnregisterDuckNotification(IntPtr notification);
    }

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8")]
    internal interface IAudioSessionEnumerator
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int GetSession(int index, out IAudioSessionControl session);
    }

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD")]
    internal interface IAudioSessionControl
    {
        [PreserveSig] int GetState(out int state);
        [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid context);
        [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
        [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid context);
        [PreserveSig] int GetGroupingParam(out Guid groupingParam);
        [PreserveSig] int SetGroupingParam(ref Guid groupingParam, ref Guid context);
        [PreserveSig] int RegisterAudioSessionNotification(IntPtr notification);
        [PreserveSig] int UnregisterAudioSessionNotification(IntPtr notification);
    }

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D")]
    internal interface IAudioSessionControl2
    {
        [PreserveSig] int GetState(out int state);
        [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid context);
        [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
        [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid context);
        [PreserveSig] int GetGroupingParam(out Guid groupingParam);
        [PreserveSig] int SetGroupingParam(ref Guid groupingParam, ref Guid context);
        [PreserveSig] int RegisterAudioSessionNotification(IntPtr notification);
        [PreserveSig] int UnregisterAudioSessionNotification(IntPtr notification);
        [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig] int GetProcessId(out uint processId);
        [PreserveSig] int IsSystemSoundsSession();
        [PreserveSig] int SetDuckingPreference(bool enable);
    }

    public static class NetEaseAudio
    {
        private const int Render = 0;
        private const int Multimedia = 1;
        private const int Active = 1;
        private const int ClsCtxAll = 23;
        private static readonly Guid SessionManagerIid = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");

        public static string Snapshot()
        {
            var pids = new List<uint>();
            var playing = false;
            try
            {
                var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
                IMMDevice device;
                Marshal.ThrowExceptionForHR(
                    enumerator.GetDefaultAudioEndpoint(Render, Multimedia, out device));
                object native;
                var iid = SessionManagerIid;
                Marshal.ThrowExceptionForHR(
                    device.Activate(ref iid, ClsCtxAll, IntPtr.Zero, out native));
                var manager = (IAudioSessionManager2)native;
                IAudioSessionEnumerator sessions;
                Marshal.ThrowExceptionForHR(manager.GetSessionEnumerator(out sessions));
                int count;
                Marshal.ThrowExceptionForHR(sessions.GetCount(out count));
                for (var index = 0; index < count; index++)
                {
                    IAudioSessionControl control;
                    if (sessions.GetSession(index, out control) < 0 || control == null) continue;
                    var control2 = control as IAudioSessionControl2;
                    if (control2 == null) continue;
                    uint pid;
                    if (control2.GetProcessId(out pid) < 0 || pid == 0) continue;
                    string processName = "";
                    try { processName = Process.GetProcessById((int)pid).ProcessName; }
                    catch { continue; }
                    if (!string.Equals(processName, "cloudmusic", StringComparison.OrdinalIgnoreCase))
                        continue;
                    if (!pids.Contains(pid)) pids.Add(pid);
                    int state;
                    if (control2.GetState(out state) >= 0 && state == Active) playing = true;
                }
            }
            catch
            {
                pids.Clear();
                playing = false;
            }
            var ids = new StringBuilder();
            for (var index = 0; index < pids.Count; index++)
            {
                if (index > 0) ids.Append(",");
                ids.Append(pids[index]);
            }
            return (pids.Count > 0 ? "1" : "0") + "|" + (playing ? "1" : "0") + "|" + ids;
        }
    }
}
'@

try {
  Add-Type -TypeDefinition $source -Language CSharp -ErrorAction Stop
} catch {
  [ordered]@{ session = $false; playing = $false; pids = @(); error = $_.Exception.Message } |
    ConvertTo-Json -Compress
  exit 1
}

function Get-State {
  $parts = [EmojiTot.NetEaseAudio]::Snapshot() -split '\|'
  $pids = @()
  if ($parts[2]) {
    $pids = @($parts[2] -split ',' | ForEach-Object { [int]$_ })
  }
  [ordered]@{
    session = ($parts[0] -eq '1')
    playing = ($parts[1] -eq '1')
    pids = $pids
  } | ConvertTo-Json -Compress
}

if (-not $Watch) {
  Get-State
  exit
}

while ($true) {
  Get-State
  Start-Sleep -Milliseconds 500
}
