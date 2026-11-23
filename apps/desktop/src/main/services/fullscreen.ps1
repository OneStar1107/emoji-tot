param(
  [int]$AppPid = 0,
  [string]$Classify = ''
)

# Is a full-screen app in front? One line per two seconds: 1 or 0.
#
# Electron has no API for "another app went full screen". Windows does, but a
# rectangle alone is not enough: a borderless maximised window and the desktop
# shell both cover the monitor. The notification state distinguishes a real
# full-screen app, and the window's class/process excludes Windows' own shell.
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Quns {
  [DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int state);
}
"@
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class FgWin {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassNameW(IntPtr hWnd, StringBuilder text, int max);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hWnd, int attr, out int value, int size);
}
"@

$script:ShellClasses = @(
  'Progman',
  'WorkerW',
  'Shell_TrayWnd',
  'Shell_SecondaryTrayWnd',
  'Windows.UI.Core.CoreWindow',
  'ApplicationManager_DesktopShellWindow',
  'XamlExplorerHostIslandWindow'
)
$script:ShellProcesses = @(
  'explorer',
  'ShellExperienceHost',
  'StartMenuExperienceHost',
  'SearchHost',
  'TextInputHost'
)

function Get-WindowClass($handle) {
  $text = New-Object System.Text.StringBuilder 256
  [void][FgWin]::GetClassNameW($handle, $text, 256)
  return $text.ToString()
}

function Get-WindowProcessId($handle) {
  $processId = [uint32]0
  [void][FgWin]::GetWindowThreadProcessId($handle, [ref]$processId)
  return [int]$processId
}

function Get-FullscreenState($handle, [int]$processId = 0) {
  if ($processId -gt 0 -and $AppPid -gt 0 -and $processId -eq $AppPid) {
    return [pscustomobject]@{ fullscreen = $false; reason = 'self'; processId = $processId; class = '' }
  }
  if ($handle -eq [IntPtr]::Zero) {
    return [pscustomobject]@{ fullscreen = $false; reason = 'no-window'; processId = $processId; class = '' }
  }
  if ($processId -le 0) { $processId = Get-WindowProcessId $handle }
  if ($AppPid -gt 0 -and $processId -eq $AppPid) {
    return [pscustomobject]@{ fullscreen = $false; reason = 'self'; processId = $processId; class = '' }
  }
  if (-not [FgWin]::IsWindowVisible($handle) -or [FgWin]::IsIconic($handle)) {
    return [pscustomobject]@{ fullscreen = $false; reason = 'inactive'; processId = $processId; class = '' }
  }
  $cloaked = 0
  [void][FgWin]::DwmGetWindowAttribute($handle, 14, [ref]$cloaked, 4)
  if ($cloaked -ne 0) {
    return [pscustomobject]@{ fullscreen = $false; reason = 'cloaked'; processId = $processId; class = '' }
  }

  $windowClass = Get-WindowClass $handle
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  $processName = if ($process) { $process.ProcessName } else { '' }
  if (($script:ShellClasses -contains $windowClass) -or ($script:ShellProcesses -contains $processName)) {
    return [pscustomobject]@{ fullscreen = $false; reason = 'shell-window'; processId = $processId; class = $windowClass }
  }

  $rect = New-Object FgWin+RECT
  if (-not [FgWin]::GetWindowRect($handle, [ref]$rect)) {
    return [pscustomobject]@{ fullscreen = $false; reason = 'no-rect'; processId = $processId; class = $windowClass }
  }
  $bounds = [System.Windows.Forms.Screen]::FromHandle($handle).Bounds
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  $covers = (
    $rect.Left -le ($bounds.Left + 2) -and
    $rect.Top -le ($bounds.Top + 2) -and
    $rect.Right -ge ($bounds.Right - 2) -and
    $rect.Bottom -ge ($bounds.Bottom - 2)
  )
  $zoomed = [FgWin]::IsZoomed($handle)
  $notificationState = 0
  $queryResult = [Quns]::SHQueryUserNotificationState([ref]$notificationState)
  $busyFullscreen = ($queryResult -eq 0 -and $notificationState -eq 2)
  $dedicatedFullscreen = ($queryResult -eq 0 -and ($notificationState -eq 3 -or $notificationState -eq 4))

  # A normal maximised window reports IsZoomed. A borderless maximised window
  # does not, so the notification state is the tie-breaker before covering a
  # monitor is allowed to mean full screen.
  if ($zoomed) {
    return [pscustomobject]@{ fullscreen = $false; reason = 'maximized'; processId = $processId; class = $windowClass }
  }
  if ($dedicatedFullscreen) {
    return [pscustomobject]@{ fullscreen = $true; reason = 'dedicated-fullscreen'; processId = $processId; class = $windowClass }
  }
  if ($covers -and $busyFullscreen) {
    return [pscustomobject]@{ fullscreen = $true; reason = 'fullscreen'; processId = $processId; class = $windowClass }
  }
  [pscustomobject]@{ fullscreen = $false; reason = 'windowed'; processId = $processId; class = $windowClass }
}

# Standalone diagnostic: print the classification for a known target without
# waiting for the resident loop. This is also the regression seam for Windows
# shell windows and EmojiTot's own windows.
if ($Classify) {
  if ($Classify -eq 'self') {
    if ($AppPid -le 0) { $AppPid = $PID }
    $state = Get-FullscreenState ([IntPtr]::Zero) $AppPid
  } else {
    if ($Classify -eq 'shell') {
      $handle = [FgWin]::GetShellWindow()
    } elseif ($Classify -eq 'fg') {
      $handle = [FgWin]::GetForegroundWindow()
    } elseif ($Classify -match '^0[xX][0-9a-fA-F]+$') {
      $handle = [IntPtr][Convert]::ToInt64($Classify.Substring(2), 16)
    } elseif ($Classify -match '^[0-9]+$') {
      $handle = [IntPtr][int64]$Classify
    } else {
      [Console]::Error.WriteLine('classify-error: expected fg, shell, self, or a decimal/hex HWND')
      exit 2
    }
    $state = Get-FullscreenState $handle
  }
  Write-Output ($state | ConvertTo-Json -Compress -Depth 3)
  exit 0
}

# The app that started us may be killed hard (taskkill /F during an install,
# a crash); Windows then leaves this loop running forever with a console of its
# own and nothing on screen says where it came from. Watch the parent and leave
# with it. Computed once: ParentProcessId is fixed for our lifetime.
$script:ParentPid = 0
try { $script:ParentPid = [int](Get-CimInstance Win32_Process -Filter "ProcessId=$PID").ParentProcessId } catch { }
function Test-ParentGone() {
  if (-not $script:ParentPid) { return $false }
  return -not (Get-Process -Id $script:ParentPid -ErrorAction SilentlyContinue)
}

while ($true) {
  if (Test-ParentGone) { break }
  $handle = [FgWin]::GetForegroundWindow()
  $fullscreenState = Get-FullscreenState $handle
  if ($fullscreenState.fullscreen) { Write-Output '1' } else { Write-Output '0' }
  Start-Sleep -Milliseconds 2000
}
