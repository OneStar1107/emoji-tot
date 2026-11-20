param(
  [string]$Config = '',
  [switch]$ListApps,
  [switch]$Probe,
  [string]$Classify = '',
  [int]$AppPid = 0,
  [string]$Icons = '',
  [string]$IconPath = ''
)
# Passing these on the command line is unreliable once PowerShell re-parses
# -File arguments, so the resident child also accepts the environment.
if (-not $Config -and $env:EMOJITOT_AVOID_CONFIG) { $Config = $env:EMOJITOT_AVOID_CONFIG }
# Last resort: the app renames itself to EmojiTot, so its userData is fixed.
if (-not $Config -and $env:APPDATA) { $Config = Join-Path $env:APPDATA 'EmojiTot\avoidance.json' }
if ((-not $AppPid -or $AppPid -eq 0) -and $env:EMOJITOT_APP_PID) { $AppPid = [int]$env:EMOJITOT_APP_PID }
# Auto-avoid: is a listed app covering the island?
#
# One line per 100ms: 1 = collapse the island to a strip, 0 = leave it alone.
# A resident child keeps the polling cheap; spawning PowerShell per tick would
# cost more than the feature is worth.
#
#   -Island <hwnd> -Config <json>   poll (resident)
#   -ListApps                       print the running apps as JSON and exit
#   -IconPath <exe>                 print a PNG data URL for the exe and exit
#   -Classify <hwnd|fg>             print why a window is (not) a browser and exit
#
# The rules are a port of xiaotang-daozai's system.rs (browser_overlaps_island
# and avoidance_for_window): a window counts as covering the island when it
# overlaps the island's centre band at the top edge, and the window's process
# path has to be in the browser list or the custom list. Owner chains are walked
# so a plugin panel keeps the host window's avoidance.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class AvoidWin {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint cmd);
  [DllImport("user32.dll")] public static extern int GetWindowTextLengthW(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc proc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc proc, IntPtr lParam);
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassNameW(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hWnd, int attr, out int value, int size);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool QueryFullProcessImageNameW(IntPtr hProc, uint flags, StringBuilder name, ref uint size);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentProcessId();
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtrW(IntPtr hWnd, int nIndex);
}
"@

$script:Browsers = @(
  'chrome.exe','msedge.exe','firefox.exe','brave.exe','vivaldi.exe','opera.exe',
  'arc.exe','zen.exe','chromium.exe','librewolf.exe','floorp.exe','waterfox.exe',
  'duckduckgo.exe','360se.exe','360chrome.exe','qqbrowser.exe','sogouexplorer.exe','quark.exe'
)

# The pill sits inside a padded window (32px to each side, 36px above and
# below), so the band a window has to cover is the pill, not the transparent box.
$script:PadX = 32
$script:PadY = 36
# Fixed half-width for the overlap test: reading it from the live window would
# make the island un-collapse and re-collapse as its own width changed.
$script:HalfW = 140
$script:BarH = 44

function Get-Rect($h) {
  $r = New-Object AvoidWin+RECT
  if (-not [AvoidWin]::GetWindowRect($h, [ref]$r)) { return $null }
  return $r
}

function Test-Visible($h) {
  if ($h -eq [IntPtr]::Zero) { return $false }
  if (-not [AvoidWin]::IsWindowVisible($h)) { return $false }
  if ([AvoidWin]::IsIconic($h)) { return $false }
  $cloaked = 0
  [void][AvoidWin]::DwmGetWindowAttribute($h, 14, [ref]$cloaked, 4)
  return $cloaked -eq 0
}

function Get-ProcessImage($procId) {
  $h = [AvoidWin]::OpenProcess(0x1000, $false, $procId)
  if ($h -eq [IntPtr]::Zero) { return $null }
  try {
    $sb = New-Object System.Text.StringBuilder 32768
    $size = [uint32]32768
    if (-not [AvoidWin]::QueryFullProcessImageNameW($h, 0, $sb, [ref]$size)) { return $null }
    return $sb.ToString()
  } finally {
    [void][AvoidWin]::CloseHandle($h)
  }
}

function Same-App($a, $b) {
  if (-not $a -or -not $b) { return $false }
  return ($a -replace '/', '\').ToLowerInvariant() -eq ($b -replace '/', '\').ToLowerInvariant()
}

function Test-Listed($p, $apps) {
  if (-not $p) { return $false }
  foreach ($app in $apps) { if (Same-App $app $p) { return $true } }
  return $false
}

# The name people recognise is the executable's file description, not its file
# name: DeepSeek Harness ships as electron.exe, ego as ego.exe.
function Get-AppName($p) {
  try {
    $vi = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($p)
    if ($vi.FileDescription) { return $vi.FileDescription }
    if ($vi.ProductName) { return $vi.ProductName }
  } catch { }
  return [System.IO.Path]::GetFileNameWithoutExtension($p)
}

# Chromium browser runtimes ship chrome.dll next to the executable. Browsers
# built from Chromium keep it beside the versioned exe; ego lite launches from
# Application\ego.exe and keeps the runtime one level down
# (Application\0.6.3.17\chrome.dll), so one extra directory level is enough.
# Electron apps bundle their runtime into their own executable: no chrome.dll.
function Test-ChromiumRuntime($p) {
  if (-not $p) { return $false }
  $dir = [System.IO.Path]::GetDirectoryName($p)
  if (-not $dir -or -not [System.IO.Directory]::Exists($dir)) { return $false }
  if ([System.IO.File]::Exists((Join-Path $dir 'chrome.dll'))) { return $true }
  try {
    foreach ($sub in [System.IO.Directory]::GetDirectories($dir)) {
      if ([System.IO.File]::Exists((Join-Path $sub 'chrome.dll'))) { return $true }
    }
  } catch { }
  return $false
}

# Packaged Electron apps leave resources\app.asar (or an unpacked app folder)
# next to the executable. Checked before chrome.dll so an Electron app can never
# be auto-detected as a browser, even if a stray chrome.dll ever sat beside it.
function Test-ElectronApp($p) {
  if (-not $p) { return $false }
  $dir = [System.IO.Path]::GetDirectoryName($p)
  if (-not $dir) { return $false }
  return ([System.IO.File]::Exists((Join-Path $dir 'resources\app.asar')) -or [System.IO.Directory]::Exists((Join-Path $dir 'resources\app')))
}

function Get-WindowClass($h) {
  $sb = New-Object System.Text.StringBuilder 256
  [void][AvoidWin]::GetClassNameW($h, $sb, 256)
  return $sb.ToString()
}

# The native browser UI's address bar. Chrome/Chromium browser windows have it;
# Electron apps have no address bar at all. ego's UI is drawn in web content, so
# it has none either -- this only proves "browser" when present, never the
# reverse. A full-screen window may drop it too, which is fine: the runtime check
# below still holds.
function Test-Omnibox($h) {
  $script:OmniHit = $false
  $cb = [AvoidWin+EnumProc]{
    param($child, $lparam)
    $sb = New-Object System.Text.StringBuilder 256
    [void][AvoidWin]::GetClassNameW($child, $sb, 256)
    if ($sb.ToString() -eq 'Chrome_OmniboxView') { $script:OmniHit = $true; return $false }
    return $true
  }
  [void][AvoidWin]::EnumChildWindows($h, $cb, [IntPtr]::Zero)
  return $script:OmniHit
}

# Is this window a browser, and what proves it?
#
# Chrome_WidgetWin_1 alone is not enough: every Electron app uses it too
# (DeepSeek Harness, Slack, VS Code). The discriminator is the Chromium browser
# runtime (chrome.dll) in the install directory, with the address-bar control as
# a fast confirm. Electron apps fail both:
#   DeepSeek Harness  -> Chrome_WidgetWin_1, no Chrome_OmniboxView, no chrome.dll
#   ego lite          -> Chrome_WidgetWin_1, no Chrome_OmniboxView, chrome.dll
# Keeping the reason in the verdict is what makes -Probe / -Classify useful when
# a new browser shows up.
function Get-BrowserVerdict($h, $p) {
  if (-not $p) { return [pscustomobject]@{ browser = $false; reason = 'no-path' } }
  $leaf = [System.IO.Path]::GetFileName($p)
  foreach ($b in $script:Browsers) {
    if ($leaf -ieq $b) { return [pscustomobject]@{ browser = $true; reason = 'listed' } }
  }
  # Auto-detection touches the disk, so remember it per executable: the resident
  # loop asks about the same foreground process every 100ms.
  $key = ($p -replace '/', '\').ToLowerInvariant()
  if ($script:BrowserCache.ContainsKey($key)) {
    $cached = $script:BrowserCache[$key]
    return [pscustomobject]@{ browser = $cached.browser; reason = 'cached-' + $cached.reason }
  }
  if ($h -eq [IntPtr]::Zero) { return [pscustomobject]@{ browser = $false; reason = 'no-window' } }
  $cls = Get-WindowClass $h
  if ($cls -ne 'Chrome_WidgetWin_1') {
    return [pscustomobject]@{ browser = $false; reason = 'window-class=' + $cls }
  }
  if (Test-ElectronApp $p) {
    $verdict = [pscustomobject]@{ browser = $false; reason = 'electron' }
  } elseif (Test-Omnibox $h) {
    $verdict = [pscustomobject]@{ browser = $true; reason = 'omnibox' }
  } elseif (Test-ChromiumRuntime $p) {
    $verdict = [pscustomobject]@{ browser = $true; reason = 'chromium-runtime' }
  } else {
    $verdict = [pscustomobject]@{ browser = $false; reason = 'no-chromium-runtime' }
  }
  $script:BrowserCache[$key] = $verdict
  return $verdict
}

# The boolean the call sites want; Get-BrowserVerdict keeps the reason for -Probe
# and -Classify. A missing window skips only the auto-detection, never the list.
function Test-Browser($p, $h) {
  if (-not $h) { $h = [IntPtr]::Zero }
  return (Get-BrowserVerdict $h $p).browser
}

# Does this window cover the island's centre band at the top edge?
function Test-Overlap($rect, $island) {
  $center = ($island.Left + $island.Right) / 2.0
  $top = [double]$island.Top
  $horizontal = ([double]$rect.Left -lt ($center + $script:HalfW)) -and ([double]$rect.Right -gt ($center - $script:HalfW))
  $vertical = ([double]$rect.Top -lt ($top + $script:BarH)) -and ([double]$rect.Bottom -gt $top)
  return ($horizontal -and $vertical)
}

function Read-AvoidConfig($path) {
  try {
    if (-not $path -or -not (Test-Path -LiteralPath $path)) { return $null }
    $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    $j = $raw | ConvertFrom-Json
    $apps = @()
    if ($j.apps) { $apps = @($j.apps) }
    return [pscustomobject]@{
      enabled = [bool]$j.enabled
      browsers = [bool]$j.browsers
      apps = $apps
      island = $j.island
    }
  } catch {
    [Console]::Error.WriteLine('cfg-error: ' + $_.Exception.Message)
    return $null
  }
}

# Is this a normal program window (taskbar button) rather than a tool window,
# dialog or floating panel? Mirrors foreground_info().
function Test-AppWindow($h) {
  if ($h -eq [IntPtr]::Zero) { return $false }
  $owned = [AvoidWin]::GetWindow($h, 4) -ne [IntPtr]::Zero
  $ex = [AvoidWin]::GetWindowLongPtrW($h, -20).ToInt64()
  return (($ex -band 0x40000) -ne 0) -or ((-not $owned) -and (($ex -band 0x80) -eq 0))
}

# The only visible app window of a process. Tool panels without an owner (some
# plugin overlays) still belong to a host window; when the process has exactly
# one, that is it.
function Get-UniqueMainWindow($procId) {
  $script:UniquePid = $procId
  $script:UniqueFound = [IntPtr]::Zero
  $script:UniqueCount = 0
  $cb = [AvoidWin+EnumProc]{
    param($hwnd, $lparam)
    $ownerPid = [uint32]0
    [void][AvoidWin]::GetWindowThreadProcessId($hwnd, [ref]$ownerPid)
    if ($ownerPid -ne $script:UniquePid) { return $true }
    if (-not (Test-Visible $hwnd)) { return $true }
    if ([AvoidWin]::GetWindowTextLengthW($hwnd) -le 0) { return $true }
    if (-not (Test-AppWindow $hwnd)) { return $true }
    $script:UniqueCount++
    $script:UniqueFound = $hwnd
    return ($script:UniqueCount -le 1)
  }
  [void][AvoidWin]::EnumWindows($cb, [IntPtr]::Zero)
  if ($script:UniqueCount -eq 1) { return $script:UniqueFound }
  return [IntPtr]::Zero
}

# Mirrors avoidance_for_window(). -1 means "our own window is in front, keep the
# previous answer" so opening settings does not flap the island.
function Get-AvoidState($config) {
  if (-not $config -or -not $config.enabled) { return 0 }
  # The island rectangle comes from the main process: it already knows where it
  # put the window, and passing it avoids a Win32 round trip every tick.
  $island = $null
  if ($config.island) {
    $ix = [double]$config.island.x
    $iy = [double]$config.island.y
    $i = [pscustomobject]@{
      Left = [int]$ix
      Top = [int]$iy
      Right = [int]($ix + [double]$config.island.w)
      Bottom = [int]($iy + [double]$config.island.h)
    }
    $island = $i
  }
  if (-not $island) { return 0 }
  $apps = @()
  if ($config.apps) { $apps = @($config.apps) }

  $fg = [AvoidWin]::GetForegroundWindow()
  if ($fg -eq [IntPtr]::Zero) { return 0 }
  $procId = [uint32]0
  [void][AvoidWin]::GetWindowThreadProcessId($fg, [ref]$procId)
  if ($procId -eq 0) { return 0 }
  if ($script:AvoidSelf -gt 0 -and $procId -eq $script:AvoidSelf) { return -1 }

  $rootOwner = [AvoidWin]::GetAncestor($fg, 2)
  if ($rootOwner -ne [IntPtr]::Zero -and [AvoidWin]::IsIconic($rootOwner)) { return 0 }

  if (-not (Test-Visible $fg)) { return 0 }
  $rect = Get-Rect $fg
  if (-not $rect) { return 0 }

  $p = Get-ProcessImage $procId
  $browserHit = ($config.browsers -and (Test-Browser $p $fg))
  $listedHit = Test-Listed $p $apps

  # Remember the process's normal window so a later ownerless panel can be
  # attributed to it; a different process drops the memory, same as the
  # reference's last-main cell.
  $owner = [AvoidWin]::GetWindow($fg, 4)
  $appWindow = Test-AppWindow $fg
  if ($owner -eq [IntPtr]::Zero -and $appWindow) {
    $script:AvoidLastMain = @{ pid = $procId; hwnd = $fg }
  } elseif ($script:AvoidLastMain -and $script:AvoidLastMain.pid -ne $procId) {
    $script:AvoidLastMain = $null
  }

  if ((Test-Overlap $rect $island) -and ($browserHit -or $listedHit)) { return 1 }

  if ($apps.Count -eq 0) { return 0 }

  # Walk the owner chain: a plugin panel is its own window, but the host window
  # behind it is the one the user added to the list.
  $parent = $owner
  while ($parent -ne [IntPtr]::Zero) {
    if ([AvoidWin]::IsIconic($parent)) { return 0 }
    if (Test-Visible $parent) {
      $prect = Get-Rect $parent
      if ($prect -and (Test-Overlap $prect $island)) {
        $ownerPid = [uint32]0
        [void][AvoidWin]::GetWindowThreadProcessId($parent, [ref]$ownerPid)
        $ownerPath = if ($ownerPid -eq $procId) { $p } else { Get-ProcessImage $ownerPid }
        if (Test-Listed $ownerPath $apps) { return 1 }
      }
    }
    $parent = [AvoidWin]::GetWindow($parent, 4)
  }
  # An owned window, a normal program window, or an unlisted process ends here.
  if ($owner -ne [IntPtr]::Zero -or $appWindow -or -not $listedHit) { return 0 }

  # Some plugin overlays never register an owner. Follow the host window of the
  # same process: the one we just saw in front, or the process's only app window.
  $host = [IntPtr]::Zero
  if ($script:AvoidLastMain -and $script:AvoidLastMain.pid -eq $procId -and (Test-Visible $script:AvoidLastMain.hwnd)) {
    $host = $script:AvoidLastMain.hwnd
  }
  if ($host -eq [IntPtr]::Zero) { $host = Get-UniqueMainWindow $procId }
  if ($host -eq [IntPtr]::Zero) { return 0 }
  $hostRect = Get-Rect $host
  if ($hostRect -and (Test-Overlap $hostRect $island)) { return 1 }
  return 0
}

# The Electron pid, not ours: this script is a child process, so
# GetCurrentProcessId() would only ever name PowerShell itself.
$script:AvoidSelf = $AppPid
$script:AvoidSeen = @{}
# exe path -> verdict; the 100ms loop asks about the same foreground process.
$script:BrowserCache = @{}
$script:AvoidOut = New-Object System.Collections.ArrayList

$script:Collector = [AvoidWin+EnumProc]{
  param($hwnd, $lparam)
  if (-not [AvoidWin]::IsWindowVisible($hwnd)) { return $true }
  $len = [AvoidWin]::GetWindowTextLengthW($hwnd)
  if ($len -le 0) { return $true }
  # Windows shell hosts (settings, the input bubble, the frame host) are not
  # apps anyone wants to add: the list stays about programs the user runs.
  $root = $env:WINDIR
  if ($root) { $root = $root.TrimEnd('\') }
  $procId = [uint32]0
  [void][AvoidWin]::GetWindowThreadProcessId($hwnd, [ref]$procId)
  if ($procId -eq 0 -or $procId -eq $script:AvoidSelf) { return $true }
  $p = Get-ProcessImage $procId
  if (-not $p) { return $true }
  if ($root -and $p.StartsWith($root + '\', [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
  $key = ($p -replace '/', '\').ToLowerInvariant()
  if ($script:AvoidSeen.ContainsKey($key)) { return $true }
  $script:AvoidSeen[$key] = $true
  $sb = New-Object System.Text.StringBuilder ($len + 2)
  [void][AvoidWin]::GetWindowTextW($hwnd, $sb, $sb.Capacity)
  [void]$script:AvoidOut.Add([pscustomobject]@{
    path = $p
    name = (Get-AppName $p)
    title = $sb.ToString()
    browser = (Test-Browser $p $hwnd)
  })
  return $true
}

function Get-RunningApps {
  [void][AvoidWin]::EnumWindows($script:Collector, [IntPtr]::Zero)
  return $script:AvoidOut
}

function Get-IconDataUrl($p) {
  Add-Type -AssemblyName System.Drawing
  # Some installers ship a stub exe with no icon resource. Falling back to the
  # shell's generic application icon beats sending nothing: the settings grid
  # then shows the default app glyph instead of a first letter.
  $icon = $null
  try { $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($p) } catch { $icon = $null }
  if (-not $icon) { $icon = [System.Drawing.SystemIcons]::Application }
  try {
    $bmp = $icon.ToBitmap()
    try {
      $ms = New-Object System.IO.MemoryStream
      $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
      return 'data:image/png;base64,' + [Convert]::ToBase64String($ms.ToArray())
    } finally { $bmp.Dispose() }
  } finally { $icon.Dispose() }
}

# Standalone regression probe: print the verdict and the evidence for one
# window. Pass a decimal/0x HWND, or "fg" for whatever is in front right now.
if ($Classify) {
  $target = [IntPtr]::Zero
  if ($Classify -eq 'fg') {
    $target = [AvoidWin]::GetForegroundWindow()
  } elseif ($Classify -match '^0[xX][0-9a-fA-F]+$') {
    $target = [IntPtr][Convert]::ToInt64($Classify.Substring(2), 16)
  } elseif ($Classify -match '^[0-9]+$') {
    $target = [IntPtr][int64]$Classify
  } else {
    [Console]::Error.WriteLine('classify-error: expected a decimal/0x HWND or "fg"')
    exit 2
  }
  if ($target -eq [IntPtr]::Zero -or -not [AvoidWin]::IsWindow($target)) {
    [Console]::Error.WriteLine('classify-error: no such window')
    exit 2
  }
  $cpid = [uint32]0
  [void][AvoidWin]::GetWindowThreadProcessId($target, [ref]$cpid)
  $cpath = Get-ProcessImage $cpid
  $cverdict = Get-BrowserVerdict $target $cpath
  Write-Output ('hwnd=' + $target.ToInt64())
  Write-Output ('class=' + (Get-WindowClass $target))
  Write-Output ('pid=' + $cpid)
  Write-Output ('path=' + $cpath)
  Write-Output ('electron=' + (Test-ElectronApp $cpath))
  Write-Output ('omnibox=' + (Test-Omnibox $target))
  Write-Output ('chromiumRuntime=' + (Test-ChromiumRuntime $cpath))
  Write-Output ('browser=' + $cverdict.browser)
  Write-Output ('reason=' + $cverdict.reason)
  exit 0
}

if ($Probe) {
  $cfg = Read-AvoidConfig $Config
  Write-Output ("cfg=" + ($cfg | ConvertTo-Json -Compress -Depth 5))
  $fgw = [AvoidWin]::GetForegroundWindow()
  $fgpid = [uint32]0
  [void][AvoidWin]::GetWindowThreadProcessId($fgw, [ref]$fgpid)
  Write-Output ("fgpid=" + $fgpid)
  $fgpath = Get-ProcessImage $fgpid
  Write-Output ("fgpath=" + $fgpath)
  Write-Output ("fgclass=" + (Get-WindowClass $fgw))
  $vg = Get-BrowserVerdict $fgw $fgpath
  Write-Output ("fgbrowser=" + $vg.browser)
  Write-Output ("fgreason=" + $vg.reason)
  $fgr = Get-Rect $fgw
  if ($fgr) { Write-Output ("fgrect=" + $fgr.Left + "," + $fgr.Top + "," + $fgr.Right + "," + $fgr.Bottom) }
  Write-Output ("fgvisible=" + (Test-Visible $fgw))
  $one = Get-AvoidState $cfg
  Write-Output ("state=" + $one)
  exit 0
}

if ($ListApps) {
  [Console]::Out.WriteLine((ConvertTo-Json -InputObject @(Get-RunningApps) -Compress -Depth 4))
  [Console]::Out.Flush()
  exit 0
}

if ($Icons) {
  $rows = New-Object System.Collections.ArrayList
  foreach ($one in ($Icons -split '\|')) {
    if (-not $one) { continue }
    $icon = ''
    try { $icon = Get-IconDataUrl $one } catch { $icon = '' }
    [void]$rows.Add([pscustomobject]@{ path = $one; icon = $icon })
  }
  [Console]::Out.WriteLine((ConvertTo-Json -InputObject @($rows) -Compress -Depth 4))
  [Console]::Out.Flush()
  exit 0
}

if ($IconPath) {
  try { [Console]::Out.WriteLine((Get-IconDataUrl $IconPath)) } catch { [Console]::Out.WriteLine('') }
  [Console]::Out.Flush()
  exit 0
}

if (-not $Config -and $env:APPDATA) { $Config = Join-Path $env:APPDATA 'EmojiTot\avoidance.json' }
if (-not $Config) { exit 0 }
$loaded = $null
$last = -2
while ($true) {
  try {
    $fresh = Read-AvoidConfig $Config
    if ($fresh) {
      $loaded = $fresh
    }
    $value = Get-AvoidState $loaded
    if ($value -eq -1) { if ($last -lt 0) { $value = 0 } else { $value = $last } }
    if ($value -ne $last) {
      [Console]::Out.WriteLine($value)
      [Console]::Out.Flush()
      $last = $value
    }
  } catch {
    if ($last -ne 0) { [Console]::Out.WriteLine(0); [Console]::Out.Flush(); $last = 0 }
  }
  Start-Sleep -Milliseconds 100
}
