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
  if ($width -ge $screen.Width -and $height -ge $screen.Height) {
    Write-Output '1'
  } else {
    Write-Output '0'
  }
  Start-Sleep -Milliseconds 2000
}
