param()
# Which executable owns the foreground window? One line per second, lowercased,
# empty when there is no window. The main process matches this against its game
# list; the script deliberately knows nothing about games, for the same reason
# avoidance.ps1 knows nothing about the island: the list is the app's data.
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class GameWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool QueryFullProcessImageNameW(IntPtr hProc, uint flags, StringBuilder name, ref uint size);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
}
"@

while ($true) {
  $handle = [GameWin]::GetForegroundWindow()
  $procId = 0
  [void][GameWin]::GetWindowThreadProcessId($handle, [ref]$procId)
  $name = ''
  if ($procId -gt 0) {
    $proc = [GameWin]::OpenProcess(0x1000, $false, $procId)
    if ($proc -ne [IntPtr]::Zero) {
      try {
        $sb = New-Object System.Text.StringBuilder 1024
        $size = [uint32]1024
        if ([GameWin]::QueryFullProcessImageNameW($proc, 0, $sb, [ref]$size)) {
          $name = [System.IO.Path]::GetFileName($sb.ToString()).ToLowerInvariant()
        }
      } finally {
        [void][GameWin]::CloseHandle($proc)
      }
    }
  }
  Write-Output $name
  Start-Sleep -Milliseconds 1000
}
