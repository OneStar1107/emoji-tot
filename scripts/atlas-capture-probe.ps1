$ErrorActionPreference = "Stop"

function Write-ProbeResult {
  param(
    [Nullable[bool]]$Running,
    [string]$Mode = "none",
    [string]$Version = "",
    [Nullable[bool]]$Matches = $null,
    [string]$Reason = "",
    [hashtable]$Details = @{}
  )

  $payload = [ordered]@{
    running = $Running
    mode = $Mode
    version = $Version
    expectedVersion = $script:ExpectedVersion
    matches = $Matches
    source = "win32-process+git+source-mtime"
    reason = $Reason
    gitHead = $script:GitHead
    buildCommit = $script:BuildCommit
    buildVersion = $script:BuildVersion
    builtAt = $script:BuiltAt
    dirty = $script:Dirty
    dirtyFiles = $script:DirtyFiles
    latestSourceAt = $script:LatestSourceAt
    buildCommitMatches = $script:BuildCommitMatches
  }
  foreach ($entry in $Details.GetEnumerator()) {
    $payload[$entry.Key] = $entry.Value
  }
  $payload | ConvertTo-Json -Compress
}

function Invoke-GitText {
  param([string[]]$Arguments)

  try {
    $Output = & git -C $RepoRoot @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return (($Output | Out-String).Trim())
  } catch {
    return $null
  }
}

function Get-ProcessStartUtc {
  param($Value)

  if ($Value -is [datetime]) {
    return ([datetime]$Value).ToUniversalTime()
  }
  try {
    return [Management.ManagementDateTimeConverter]::ToDateTime(
      [string]$Value
    ).ToUniversalTime()
  } catch {
    return $null
  }
}

function Test-BuildCommitMatchesHead {
  param(
    [string]$BuildCommit,
    [string]$GitHead
  )

  if (-not $BuildCommit -or -not $GitHead) { return $false }
  if ($GitHead.StartsWith($BuildCommit, [StringComparison]::OrdinalIgnoreCase)) {
    return $true
  }
  $HeadPrefix = if ($GitHead.Length -ge 7) { $GitHead.Substring(0, 7) } else { $GitHead }
  return $BuildCommit.StartsWith($HeadPrefix, [StringComparison]::OrdinalIgnoreCase)
}

function Test-VersionMatch {
  param(
    [string]$ActualVersion,
    [string]$ExpectedVersion
  )

  if (-not $ActualVersion -or -not $ExpectedVersion) { return $false }
  if ($ActualVersion -eq $ExpectedVersion) { return $true }
  return $ActualVersion.StartsWith(
    $ExpectedVersion + ".",
    [StringComparison]::OrdinalIgnoreCase
  )
}

$script:ExpectedVersion = ""
$script:GitHead = ""
$script:BuildCommit = ""
$script:BuildVersion = ""
$script:BuiltAt = ""
$script:Dirty = $null
$script:DirtyFiles = @()
$script:LatestSourceAt = ""
$script:BuildCommitMatches = $null

try {
  $RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
  $BuildInfoPath = Join-Path $RepoRoot "apps\desktop\build-info.json"
  $PackagePath = Join-Path $RepoRoot "apps\desktop\package.json"

  $PackageInfo = $null
  if (Test-Path -LiteralPath $PackagePath -PathType Leaf) {
    $PackageInfo = Get-Content -LiteralPath $PackagePath -Raw | ConvertFrom-Json
    $script:ExpectedVersion = [string]$PackageInfo.version
  }

  $BuildInfo = $null
  if (Test-Path -LiteralPath $BuildInfoPath -PathType Leaf) {
    $BuildInfo = Get-Content -LiteralPath $BuildInfoPath -Raw | ConvertFrom-Json
    $script:BuildVersion = [string]$BuildInfo.buildVersion
    $script:BuildCommit = [string]$BuildInfo.commit
    $script:BuiltAt = [string]$BuildInfo.builtAt
    if (-not $script:ExpectedVersion) {
      $script:ExpectedVersion = [string]$BuildInfo.version
    }
  }
  if (-not $script:ExpectedVersion) {
    $script:ExpectedVersion = $script:BuildVersion
  }

  $script:GitHead = [string](Invoke-GitText @("rev-parse", "HEAD"))
  $DirtyOutput = [string](Invoke-GitText @(
    "status",
    "--porcelain=v1",
    "--untracked-files=all"
  ))
  $script:Dirty = if ($DirtyOutput) { $true } else { $false }
  $script:DirtyFiles = @(
    $DirtyOutput -split "`r?`n" |
      Where-Object { $_.Trim() } |
      Select-Object -First 80 |
      ForEach-Object { $_.Substring([Math]::Min(2, $_.Length)).Trim() }
  )
  $script:BuildCommitMatches = Test-BuildCommitMatchesHead `
    -BuildCommit $script:BuildCommit `
    -GitHead $script:GitHead

  $BuildTime = $null
  if ($script:BuiltAt) {
    try {
      $BuildTime = [DateTimeOffset]::Parse($script:BuiltAt).UtcDateTime
    } catch {
      $BuildTime = $null
    }
  }

  $SourceRoots = @(
    (Join-Path $RepoRoot "apps\desktop\src"),
    (Join-Path $RepoRoot "apps\desktop\assets"),
    (Join-Path $RepoRoot "packages\core\dist"),
    (Join-Path $RepoRoot "packages\protocol\dist-cjs")
  )
  $LatestSourceWrite = [datetime]::MinValue
  foreach ($SourceRoot in $SourceRoots) {
    if (-not (Test-Path -LiteralPath $SourceRoot)) { continue }
    $Newest = Get-ChildItem -LiteralPath $SourceRoot -Recurse -File -Force -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTimeUtc -Descending |
      Select-Object -First 1
    if ($Newest -and $Newest.LastWriteTimeUtc -gt $LatestSourceWrite) {
      $LatestSourceWrite = $Newest.LastWriteTimeUtc
    }
  }
  if ($LatestSourceWrite -gt [datetime]::MinValue) {
    $script:LatestSourceAt = $LatestSourceWrite.ToString("o")
  }

  $NormalizedRepo = $RepoRoot.TrimEnd("\") + "\"
  $Processes = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
    if ($_.Name -ieq "EmojiTot.exe" -or $_.Name -ieq "emojitot.exe") {
      return $true
    }
    if ($_.Name -ine "electron.exe") {
      return $false
    }
    $CommandLine = [string]$_.CommandLine
    return $CommandLine.IndexOf($NormalizedRepo, [StringComparison]::OrdinalIgnoreCase) -ge 0
  })

  if (-not $Processes.Count) {
    Write-ProbeResult -Running $false -Mode "none" -Version "" -Matches $true `
      -Reason "No running instance of this project was detected. An isolated capture instance can start." `
      -Details @{ processCount = 0 }
    exit 0
  }

  $Versions = New-Object System.Collections.Generic.HashSet[string]
  $Reasons = New-Object System.Collections.Generic.List[string]
  $ProcessDetails = New-Object System.Collections.Generic.List[object]
  $AllMatch = $true
  $HasInstalled = $false
  $HasDevelopment = $false

  foreach ($Process in $Processes) {
    $Name = [string]$Process.Name
    $Version = ""
    $InstanceMatch = $true
    $Mode = "development"
    $ProcessStart = Get-ProcessStartUtc -Value $Process.CreationDate

    if ($Name -ieq "electron.exe") {
      $HasDevelopment = $true
      $Version = if ($script:BuildVersion) { $script:BuildVersion } else { $script:ExpectedVersion }
      if (-not $ProcessStart) {
        $InstanceMatch = $false
        $Reasons.Add("Development process $($Process.ProcessId) has no readable start time, so it cannot be aligned with the current source.")
      } elseif ($LatestSourceWrite -gt [datetime]::MinValue -and
        $LatestSourceWrite -gt $ProcessStart.AddSeconds(1)) {
        $InstanceMatch = $false
        $Reasons.Add("Development process $($Process.ProcessId) started before the latest project source change and may still run old code.")
      }
    } else {
      $HasInstalled = $true
      $Mode = "installed"
      $ExecutablePath = [string]$Process.ExecutablePath
      if ($ExecutablePath -and (Test-Path -LiteralPath $ExecutablePath -PathType Leaf)) {
        $Executable = Get-Item -LiteralPath $ExecutablePath
        $Version = [string]$Executable.VersionInfo.FileVersion
        if (-not $Version) {
          $Version = [string]$Executable.VersionInfo.ProductVersion
        }
        if (-not (Test-VersionMatch -ActualVersion $Version -ExpectedVersion $script:ExpectedVersion)) {
          $InstanceMatch = $false
          $Reasons.Add("Installed app version $Version does not match expected project version $($script:ExpectedVersion).")
        }
        if ($LatestSourceWrite -gt [datetime]::MinValue -and
          $LatestSourceWrite -gt $Executable.LastWriteTimeUtc.AddSeconds(2)) {
          $InstanceMatch = $false
          $Reasons.Add("Project source is newer than the installed app; old screenshots cannot represent the latest code.")
        }
        if ($BuildTime -and $LatestSourceWrite -gt [datetime]::MinValue -and
          $LatestSourceWrite -gt $BuildTime.AddSeconds(2)) {
          $InstanceMatch = $false
          $Reasons.Add("The recorded build timestamp predates the latest project source change.")
        }
        if ($BuildTime -and $Executable.LastWriteTimeUtc.AddSeconds(2) -lt $BuildTime) {
          $InstanceMatch = $false
          $Reasons.Add("The installed executable predates the recorded project build.")
        }
      } else {
        $InstanceMatch = $false
        $Reasons.Add("An EmojiTot process was detected, but its executable version could not be read.")
      }

      if (-not $script:BuildCommitMatches) {
        $InstanceMatch = $false
        $Reasons.Add("The build-info commit does not match the current Git HEAD.")
      }
      if ($script:Dirty -ne $false) {
        $InstanceMatch = $false
        $Reasons.Add("The project working tree has uncommitted changes, so the installed app cannot be proven to contain them.")
      }
    }

    if (-not $InstanceMatch) { $AllMatch = $false }
    if ($Version) { [void]$Versions.Add($Version) }
    $ProcessDetails.Add([ordered]@{
      pid = [int]$Process.ProcessId
      mode = $Mode
      version = $Version
      startedAt = if ($ProcessStart) { $ProcessStart.ToString("o") } else { "" }
      matches = $InstanceMatch
    })
  }

  $VersionText = (@($Versions) | Sort-Object) -join ", "
  if ($AllMatch) {
    if ($HasInstalled) {
      $Reasons.Add("Installed executable version, build commit, Git HEAD, clean working tree, build timestamp, and source timestamps are consistent.")
    }
    if ($HasDevelopment) {
      $Reasons.Add("Development process paths, Git evidence, and process start times are consistent with the current source.")
    }
  }
  $OverallMode = if ($HasInstalled -and $HasDevelopment) {
    "mixed"
  } elseif ($HasInstalled) {
    "installed"
  } else {
    "development"
  }
  Write-ProbeResult -Running $true -Mode $OverallMode -Version $VersionText `
    -Matches $AllMatch `
    -Reason ($Reasons -join " ") `
    -Details @{
      processCount = $Processes.Count
      processes = @($ProcessDetails)
    }
  exit 0
} catch {
  Write-ProbeResult -Running $null -Mode "unknown" -Version "" -Matches $null `
    -Reason ("Runtime probe failed; existing screenshots stay marked unverified. " + $_.Exception.Message) `
    -Details @{ processCount = 0 }
  exit 0
}
