# Keep NetEase launchable with EmojiTot's loopback-only seek bridge.
#
#   netease-connect.ps1 -Action Check   -> inspect, never write
#   netease-connect.ps1 -Action Ensure  -> repair user-owned shortcuts only
#
# NetEase can only create its local DevTools port when the process starts with
# --remote-debugging-port. Windows shortcuts in ProgramData are commonly
# read-only, so this script creates/repairs a shadowing shortcut under the
# current user's Start menu instead of changing machine-wide files, registry
# autostart entries or file associations.
param([ValidateSet('Check', 'Ensure')][string]$Action = 'Check')

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$connectionPort = 9223
$players = @(Get-CimInstance Win32_Process -Filter "name='cloudmusic.exe'" -ErrorAction SilentlyContinue)
$exe = [string](@($players | ForEach-Object { $_.ExecutablePath } | Where-Object { $_ } | Select-Object -First 1) | Select-Object -First 1)
if (-not $exe) {
  foreach ($key in @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\cloudmusic.exe',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\cloudmusic.exe',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\cloudmusic.exe'
  )) {
    if (Test-Path -LiteralPath $key) {
      $candidate = (Get-Item -LiteralPath $key).GetValue('')
      if ($candidate) { $exe = $candidate; break }
    }
  }
}
if (-not $exe -or -not (Test-Path -LiteralPath $exe -PathType Leaf)) {
  [ordered]@{ ok = $false; note = 'not-found'; runningConnected = $false } |
    ConvertTo-Json -Compress
  exit 0
}

function Get-ConnectionArguments([string]$Arguments) {
  $clean = $Arguments -replace '(^|\s)--remote-debugging-port(?:=|\s+)\d+(?=\s|$)', ' '
  $clean = $clean -replace '(^|\s)--remote-debugging-address(?:=|\s+)\S+', ' '
  return ($clean.Trim() + " --remote-debugging-port=$connectionPort --remote-debugging-address=127.0.0.1").Trim()
}

$shell = New-Object -ComObject WScript.Shell
$startRoot = [Environment]::GetFolderPath('StartMenu')
$desktopRoot = [Environment]::GetFolderPath('Desktop')
$quickLaunch = Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'
$roots = @($startRoot, $desktopRoot, $quickLaunch) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
$links = @()
foreach ($root in $roots) {
  foreach ($file in Get-ChildItem -LiteralPath $root -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue) {
    try {
      $link = $shell.CreateShortcut($file.FullName)
      if ($link.TargetPath -ieq $exe) {
        $links += [pscustomobject]@{ Path = $file.FullName; Link = $link; Root = $root }
      }
    } catch {
      # A broken unrelated shortcut must not block the connection setup.
    }
  }
}

$neteaseName = ([string][char]0x7F51) + ([char]0x6613) + ([char]0x4E91) + ([char]0x97F3) + ([char]0x4E50)
$userStartLink = Join-Path $startRoot ($neteaseName + '.lnk')
$created = $false
if (Test-Path -LiteralPath $userStartLink) {
  $existingEntry = @($links | Where-Object { $_.Path -ieq $userStartLink }) | Select-Object -First 1
  if (-not $existingEntry) {
    $links += [pscustomobject]@{ Path = $userStartLink; Link = $shell.CreateShortcut($userStartLink); Root = $startRoot }
  }
} elseif ($Action -eq 'Ensure') {
  $link = $shell.CreateShortcut($userStartLink)
  $link.TargetPath = $exe
  $link.Arguments = Get-ConnectionArguments ''
  $link.WorkingDirectory = Split-Path -LiteralPath $exe
  $link.IconLocation = "$exe,0"
  $link.Save()
  $links += [pscustomobject]@{ Path = $userStartLink; Link = $link; Root = $startRoot }
  $created = $true
}

$changed = 0
if ($Action -eq 'Ensure') {
  $backupRoot = Join-Path $env:APPDATA 'EmojiTot\netease-shortcuts'
  foreach ($entry in $links) {
    if (-not $entry.Path.StartsWith($env:APPDATA, [StringComparison]::OrdinalIgnoreCase)) {
      continue
    }
    $wanted = Get-ConnectionArguments $entry.Link.Arguments
    if ($entry.Link.Arguments -ceq $wanted) { continue }
    try {
      if (-not (Test-Path -LiteralPath $backupRoot)) {
        $null = New-Item -ItemType Directory -Path $backupRoot -Force
      }
      $backupName = (-join ([Text.Encoding]::UTF8.GetBytes($entry.Path) | ForEach-Object { $_.ToString('X2') })) + '.lnk'
      $backupPath = Join-Path $backupRoot $backupName.Substring(0, [Math]::Min(180, $backupName.Length))
      if (-not (Test-Path -LiteralPath $backupPath)) {
        Copy-Item -LiteralPath $entry.Path -Destination $backupPath
      }
      $entry.Link.Arguments = $wanted
      $entry.Link.Save()
      $changed += 1
    } catch {
      # Keep an unmodified shortcut usable if another process has it locked.
    }
  }
}

$configured = @($links | Where-Object {
  $_.Path.StartsWith($env:APPDATA, [StringComparison]::OrdinalIgnoreCase) -and
  (Get-ConnectionArguments $_.Link.Arguments) -ceq $_.Link.Arguments
}).Count -gt 0
$runningConnected = @($players | Where-Object {
  $_.CommandLine -notmatch '(^|\s)--type(?:=|\s+)' -and
  $_.CommandLine -match '(^|\s)--remote-debugging-port(?:=|\s+)9223(\s|$)'
}).Count -gt 0

[ordered]@{
  ok = $true
  executablePath = $exe
  configured = $configured
  changed = $changed
  created = $created
  shortcutPath = $userStartLink
  running = $players.Count -gt 0
  runningConnected = $runningConnected
} | ConvertTo-Json -Compress
