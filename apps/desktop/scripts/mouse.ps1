param([string]$cmd, [int]$x = 0, [int]$y = 0, [int]$steps = 1)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseCtl {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, int e);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
}
"@
$p = New-Object MouseCtl+POINT
[MouseCtl]::GetCursorPos([ref]$p) | Out-Null
switch ($cmd) {
  'move' { [MouseCtl]::SetCursorPos($x, $y) | Out-Null }
  'down' { [MouseCtl]::mouse_event(0x0002, 0, 0, 0, 0) }
  'up'   { [MouseCtl]::mouse_event(0x0004, 0, 0, 0, 0) }
  'drag' {
    for ($i = 1; $i -le $steps; $i++) {
      $nx = [int]($p.X + ($x - $p.X) * $i / $steps)
      $ny = [int]($p.Y + ($y - $p.Y) * $i / $steps)
      [MouseCtl]::SetCursorPos($nx, $ny) | Out-Null
      Start-Sleep -Milliseconds 40
    }
  }
  'pos'  { Write-Output "$($p.X),$($p.Y)" }
}
