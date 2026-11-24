# EmojiTot media bridge - Windows SMTC in, one JSON line four times per second.
#
#   media.ps1 watch                      -> stream now-playing JSON until killed
#   media.ps1 toggle|next|prev           -> one control action, then exit
#   media.ps1 seek <seconds>             -> jump, then exit
#   media.ps1 rate <factor>              -> playback speed, then exit
#   media.ps1 repeat <0 none|1 track|2 list> -> auto-repeat, then exit
#   media.ps1 shuffle <0|1>              -> shuffle, then exit
#
# Every non-watch run prints one {"kind":..,"ok":bool} line so the caller can
# tell a refused command from an accepted one.
#
# Windows has no Node-accessible now-playing API, so the island talks to the
# same session Windows uses for its own media keys. The architecture (a
# long-lived child streaming lines) follows the MIT-licensed Islet project;
# this script is written for EmojiTot and carries the fields we render.
param(
  [string]$Mode = "watch",
  [double]$Arg = 0,
  [string]$TargetSource = "",
  [string]$TargetTitle = ""
)

$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]

function Await($op, [Type]$type) {
  $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
  $t.Result
}

$MgrType   = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$PropsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$StreamType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$AsStreamForRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsStreamForRead' -and $_.GetParameters().Count -eq 1 }

$mgr = Await ($MgrType::RequestAsync()) $MgrType

# A live video and music can both own an audio session. Music is the preferred
# owner while paused, but the watcher also carries the best active non-music
# session. media.js releases the paused track after its resume window, then
# promotes that alternate player without waiting for a new launch.
$MusicSourcePattern = '(?i)(cloudmusic|netease|spotify|qqmusic|kugou|kuwo|foobar|aimp|musicbee|winamp|itunes|apple[ ._-]*music|tidal|youtube[ ._-]*music|deezer|soundcloud|amazon[ ._-]*music|zune(?:music)?)'
$LiveProviderNames = @(
  (-join @([char]0x54D4, [char]0x54E9, [char]0x54D4, [char]0x54E9)),
  (-join @([char]0x6597, [char]0x9C7C)),
  (-join @([char]0x76F4, [char]0x64AD))
)
$LiveSourcePattern = '(?i)(bilibili|bililive|douyu|' + ($LiveProviderNames -join '|') + ')'

function Test-LiveSession($source, $title) {
  return [bool]((([string]$source) + " " + ([string]$title)) -match $LiveSourcePattern)
}

function Test-MusicSession($props, $source, $title) {
  # Some browsers publish a live room as PlaybackType=Music. Explicit live
  # evidence must win before that misleading type can enter the music tier.
  if (Test-LiveSession $source $title) { return $false }
  $type = ""
  try { $type = [string]$props.PlaybackType } catch { }
  $musicType = $type -match '^(Music|1)$'
  $musicName = [string]$source -match $MusicSourcePattern
  return [bool]($musicType -or $musicName)
}

function Get-SessionPriority($props, $source, $title, [double]$duration) {
  $type = ""
  try { $type = [string]$props.PlaybackType } catch { }
  $videoType = $type -match '^(Video|2)$'
  $liveName = Test-LiveSession $source $title

  if ($liveName) { return 200 }
  if (Test-MusicSession $props $source $title) {
    # Some clients (notably this NetEase build) still report EndTime=0.
    return 400
  }
  if ($duration -gt 0) { return 300 }
  if ($videoType) { return 200 }
  return 100
}

function New-SessionSnapshot($session, [bool]$isCurrent = $false) {
  if (-not $session) { return $null }
  $props = $null
  try { $props = Await ($session.TryGetMediaPropertiesAsync()) $PropsType } catch { }
  $info = $null
  try { $info = $session.GetPlaybackInfo() } catch { }
  $tl = $null
  try { $tl = $session.GetTimelineProperties() } catch { }
  $duration = 0
  if ($tl) {
    try { $duration = [math]::Max(0, [double]$tl.EndTime.TotalSeconds) } catch { }
  }
  $source = [string]$session.SourceAppUserModelId
  $title = if ($props) { [string]$props.Title } else { "" }
  $isMusic = Test-MusicSession $props $source $title
  $isPlaying = [bool]($info -and $info.PlaybackStatus -eq 4)
  $priority = Get-SessionPriority $props $source $title $duration
  if ($isCurrent) { $priority += 5 }
  # Music is the first bit, playback state the second. Priority breaks ties
  # inside those groups, so launch order and Windows' "current" pick never win.
  $rank = ([int]$isMusic * 1000) + ([int]$isPlaying * 100) + $priority
  [pscustomobject]@{
    Session  = $session
    Properties = $props
    Info     = $info
    Timeline = $tl
    Priority = $priority
    IsMusic  = $isMusic
    IsPlaying = $isPlaying
    Rank     = $rank
  }
}

function Get-PlayerSnapshots {
  $all = @($mgr.GetSessions())
  if (-not $all -or $all.Count -eq 0) { return @() }
  $current = $mgr.GetCurrentSession()
  $currentSource = ""
  if ($current) {
    try { $currentSource = [string]$current.SourceAppUserModelId } catch { }
  }

  $snapshots = @()
  foreach ($session in $all) {
    $info = $null
    try { $info = $session.GetPlaybackInfo() } catch { }
    $source = ""
    try { $source = [string]$session.SourceAppUserModelId } catch { }
    $snapshot = New-SessionSnapshot $session ($source -ne "" -and $source -eq $currentSource)
    if (-not $snapshot) { continue }
    if (-not $snapshot.IsMusic -and -not $snapshot.IsPlaying) { continue }
    $snapshots += $snapshot
  }

  if ($snapshots.Count -gt 0) {
    return @($snapshots | Sort-Object -Property Rank -Descending)
  }
  if ($current) { return @(New-SessionSnapshot $current $true) }
  return @()
}

function Get-PlayerSnapshot([string]$targetSource = "", [string]$targetTitle = "") {
  $snapshots = @(Get-PlayerSnapshots)
  if ($targetSource) {
    foreach ($snapshot in $snapshots) {
      $source = ""
      $title = ""
      try { $source = [string]$snapshot.Session.SourceAppUserModelId } catch { }
      if ($snapshot.Properties) { try { $title = [string]$snapshot.Properties.Title } catch { } }
      if ($source -ieq $targetSource -and $title -eq $targetTitle) { return $snapshot }
    }
    foreach ($snapshot in $snapshots) {
      $source = ""
      try { $source = [string]$snapshot.Session.SourceAppUserModelId } catch { }
      if ($source -ieq $targetSource) { return $snapshot }
    }
  }
  if ($snapshots.Count -gt 0) { return $snapshots[0] }
  return $null
}

if ($Mode -ne "watch") {
  $snapshot = Get-PlayerSnapshot $TargetSource $TargetTitle
  $s = if ($snapshot) { $snapshot.Session } else { $null }
  $ok = $false
  $note = ""
  if (-not $s) {
    $note = "no-session"
  } else {
    switch ($Mode) {
      "toggle"  { $ok = [bool](Await ($s.TryTogglePlayPauseAsync()) ([bool])) }
      "next"    { $ok = [bool](Await ($s.TrySkipNextAsync()) ([bool])) }
      "prev"    { $ok = [bool](Await ($s.TrySkipPreviousAsync()) ([bool])) }
      "seek"    { $ok = [bool](Await ($s.TryChangePlaybackPositionAsync([long]($Arg * 10000000))) ([bool])) }
      # The three below only exist where the player implements them. The Try*
      # call answers true only for "accepted"; a player can accept and then
      # do nothing, so the island also reads the Controls flags the watch
      # branch forwards and hides the row a player never claimed.
      "rate"    { $ok = [bool](Await ($s.TryChangePlaybackRateAsync([double]$Arg)) ([bool])) }
      "repeat"  { $ok = [bool](Await ($s.TryChangeAutoRepeatModeAsync([int]$Arg)) ([bool])) }
      "shuffle" { $ok = [bool](Await ($s.TryChangeShuffleActiveAsync($Arg -ne 0)) ([bool])) }
      default   { $note = "unknown" }
    }
  }
  # One JSON line back, the same shape the watcher speaks: media.js turns the
  # boolean into the page's answer instead of moving the button and hoping.
  $result = [ordered]@{ kind = $Mode; ok = $ok }
  if ($note) { $result.note = $note }
  Write-Output ($result | ConvertTo-Json -Compress)
  exit
}


# ------------------------------------------------------------------ output
#
# The playback endpoint the sound leaves through. Get-AudioDevice is the
# clean answer when the AudioDeviceCmdlets module is installed; it usually
# is not, so the fallback reads the policy record Windows keeps for the
# default endpoint (HKCU DefaultEndpoint names the interface the user plays
# through) and maps its GUID to the MMDevices Render FriendlyName. Cached:
# this is a registry walk on a one-second loop.
$audioOut = ""
$audioOutAt = [datetime]::MinValue

function Get-DefaultAudioOutput {
  $name = ""
  try {
    if (Get-Command Get-AudioDevice -ErrorAction Stop) {
      $dev = Get-AudioDevice -Playback -ErrorAction Stop | Select-Object -First 1
      if ($dev) { $name = [string]$dev.Name }
    }
  } catch { }
  if (-not $name) {
    try {
      $render = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render"
      # The GUID used by most per-app policy records is the endpoint the user
      # actually plays through; ties keep the first one seen.
      $wanted = ""
      $best = 0
      $counts = @{}
      Get-ChildItem "HKCU:\Software\Microsoft\Multimedia\Audio\DefaultEndpoint" -ErrorAction SilentlyContinue | ForEach-Object {
        $value = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue)."000_000"
        if ($value) {
          $match = [regex]::Match([string]$value, '\{0\.0\.0\.00000000\}\.\{([0-9a-fA-F-]+)\}')
          if ($match.Success) {
            $guid = $match.Groups[1].Value
            $counts[$guid] = 1 + [int]$counts[$guid]
            if ($counts[$guid] -gt $best) { $best = $counts[$guid]; $wanted = $guid }
          }
        }
      }
      $fallback = ""
      foreach ($key in @(Get-ChildItem $render -ErrorAction SilentlyContinue)) {
        $state = (Get-ItemProperty $key.PSPath -ErrorAction SilentlyContinue).DeviceState
        if (($state -band 1) -ne 1) { continue }   # DEVICE_STATE_ACTIVE
        $props = Get-ItemProperty ($key.PSPath + "\Properties") -ErrorAction SilentlyContinue
        $friendly = [string]$props.'{a45c254e-df1c-4efd-8020-67d146a850e0},2'
        if (-not $friendly) { continue }
        if (-not $fallback) { $fallback = $friendly }
        if ($wanted -and $key.PSChildName -ieq ("{" + $wanted + "}")) { $name = $friendly; break }
      }
      if (-not $name) { $name = $fallback }
    } catch { }
  }
  return $name
}
$artCache = @{}

function New-SessionFrame($snapshot, [hashtable]$cache) {
  $s = $snapshot.Session
  $p = $snapshot.Properties
  $info = $snapshot.Info
  $tl = $snapshot.Timeline
  if (-not $p) {
    try { $p = Await ($s.TryGetMediaPropertiesAsync()) $PropsType } catch { }
  }
  if (-not $info) {
    try { $info = $s.GetPlaybackInfo() } catch { }
  }
  if (-not $tl) {
    try { $tl = $s.GetTimelineProperties() } catch { }
  }

  $source = ""
  try { $source = [string]$s.SourceAppUserModelId } catch { }
  $title = if ($p) { [string]$p.Title } else { "" }
  $artist = if ($p) { [string]$p.Artist } else { "" }
  $album = if ($p) { [string]$p.AlbumTitle } else { "" }
  $key = "$source|$title|$artist|$album"
  $entry = $cache[$key]
  if (-not $entry) {
    $entry = @{ art = ""; checkedAt = [datetime]::MinValue }
    $cache[$key] = $entry
  }

  # Windows can publish the new title before its SMTC thumbnail catches up.
  # A per-frame retry clock keeps the old cover from freezing for a full song.
  $now = Get-Date
  $thumbnailDue =
    $entry.checkedAt -eq [datetime]::MinValue -or
    ($now - $entry.checkedAt).TotalMilliseconds -ge 500
  if ($thumbnailDue -and $p -and $p.Thumbnail) {
    $entry.checkedAt = $now
    $rs = Await ($p.Thumbnail.OpenReadAsync()) $StreamType
    if ($rs) {
      $stream = $AsStreamForRead.Invoke($null, @($rs))
      $ms = New-Object System.IO.MemoryStream
      $stream.CopyTo($ms)
      $stream.Dispose()
      if ($ms.Length -gt 0) {
        $entry.art = "data:image/png;base64," + [Convert]::ToBase64String($ms.ToArray())
      }
    }
  }

  $position = 0
  $duration = 0
  $updated = 0
  if ($tl) {
    try { $position = [math]::Round($tl.Position.TotalSeconds, 1) } catch { }
    try { $duration = [math]::Round($tl.EndTime.TotalSeconds, 1) } catch { }
    try { $updated = [long]$tl.LastUpdatedTime.ToUnixTimeMilliseconds() } catch { }
  }
  $out = [ordered]@{
    active   = $true
    title    = $title
    artist   = $artist
    album    = $album
    type     = if ($p) { [string]$p.PlaybackType } else { "" }
    playing  = [bool]($info -and $info.PlaybackStatus -eq 4)
    position = $position
    duration = $duration
    updated  = $updated
    source   = $source
    output   = $audioOut
    art      = [string]$entry.art
  }
  # What this session claims to implement. `Controls` is the only honest
  # answer: TryChangePlaybackRateAsync returns true for a browser tab that
  # then keeps playing at 1x. The three flags decide which rows the page
  # draws, so a player without them gets no dead buttons.
  try { $ctl = $info.Controls } catch { $ctl = $null }
  if ($ctl) {
    $out.controls = [ordered]@{
      rate    = [bool]$ctl.IsPlaybackRateEnabled
      repeat  = [bool]$ctl.IsRepeatEnabled
      shuffle = [bool]$ctl.IsShuffleEnabled
    }
  }
  # Current values, and only when the session reports them: most players
  # leave these null, and an invented "1x" would draw a state nobody set.
  try { $v = $info.PlaybackRate; if ($null -ne $v) { $out.rate = [double]$v } } catch { }
  try { $v = $info.AutoRepeatMode; if ($null -ne $v) { $out.autoRepeatMode = [int]$v } } catch { }
  try { $v = $info.IsShuffleActive; if ($null -ne $v) { $out.shuffleActive = [bool]$v } } catch { }
  return $out
}

while ($true) {
  if (((Get-Date) - $audioOutAt).TotalSeconds -ge 10) {
    $audioOut = Get-DefaultAudioOutput
    $audioOutAt = Get-Date
  }
  $snapshots = @(Get-PlayerSnapshots)
  if ($snapshots.Count -eq 0) {
    Write-Output '{"active":false}'
  } else {
    $snapshot = $snapshots[0]
    $out = New-SessionFrame $snapshot $artCache
    if ($snapshot.IsMusic -and -not $snapshot.IsPlaying) {
      $alternate = $snapshots | Where-Object { -not $_.IsMusic -and $_.IsPlaying } | Select-Object -First 1
      if ($alternate) { $out.alternate = New-SessionFrame $alternate $artCache }
    }
    if ($artCache.Count -gt 32) { $artCache.Clear() }
    Write-Output ($out | ConvertTo-Json -Compress)
  }
  # A seek made in the player must reach the Island promptly. Reading these
  # COM properties is local and cheap; four samples per second keeps external
  # seeking responsive without the overhead of a UI Automation tree walk.
  Start-Sleep -Milliseconds 250
}
