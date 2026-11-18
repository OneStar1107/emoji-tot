# Is a full-screen app in front? One line per two seconds: 1 or 0.
#
# Electron has no API for "another app went full screen". Windows does: the
# foreground window's rect either covers the screen or it does not. A resident
# child keeps the polling cheap — spawning PowerShell every time would cost
# more than the feature is worth.
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Quns {
  [DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int state);
}
"@
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class FgWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@

$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds

while ($true) {
  $handle = [FgWin]::GetForegroundWindow()
  $rect = New-Object FgWin+RECT
  [FgWin]::GetWindowRect($handle, [ref]$rect) | Out-Null
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  $full = $false
  if ($width -ge $screen.Width -and $height -ge $screen.Height) { $full = $true }

  # A foreground rect can cover the screen without the shell considering it
  # full screen (borderless maximised windows do). QUNS knows the difference:
  # 2 = busy/full-screen app, 3 = D3D full screen, 4 = presentation mode.
  if (-not $full) {
    $state = 0
    $hr = [Quns]::SHQueryUserNotificationState([ref]$state)
    if ($hr -eq 0 -and ($state -eq 2 -or $state -eq 3 -or $state -eq 4)) { $full = $true }
  }

  if ($full) { Write-Output '1' } else { Write-Output '0' }
  Start-Sleep -Milliseconds 2000
}
