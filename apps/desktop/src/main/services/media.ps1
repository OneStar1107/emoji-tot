# EmojiTot media bridge — Windows SMTC in, one JSON line per second out.
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
param([string]$Mode = "watch", [double]$Arg = 0)

$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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

# Prefer whatever is actually playing; fall back to the session Windows picked.
function Get-Player {
  $all = @($mgr.GetSessions())
  if (-not $all -or $all.Count -eq 0) { return $null }
  $playing = $all | Where-Object { $_.GetPlaybackInfo().PlaybackStatus -eq 4 } | Select-Object -First 1
  if ($playing) { return $playing }
  return $mgr.GetCurrentSession()
}

if ($Mode -ne "watch") {
  $s = Get-Player
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
$lastKey = ""
$art = ""

while ($true) {
  if (((Get-Date) - $audioOutAt).TotalSeconds -ge 10) {
    $audioOut = Get-DefaultAudioOutput
    $audioOutAt = Get-Date
  }
  $s = Get-Player
  if (-not $s) {
    Write-Output '{"active":false}'
  } else {
    $p = Await ($s.TryGetMediaPropertiesAsync()) $PropsType
    $key = "$($p.Title)|$($p.Artist)|$($p.AlbumTitle)"
    if ($key -ne $lastKey) {
      $lastKey = $key
      $art = ""
      if ($p.Thumbnail) {
        $rs = Await ($p.Thumbnail.OpenReadAsync()) $StreamType
        if ($rs) {
          $stream = $AsStreamForRead.Invoke($null, @($rs))
          $ms = New-Object System.IO.MemoryStream
          $stream.CopyTo($ms)
          $stream.Dispose()
          if ($ms.Length -gt 0) {
            $art = "data:image/png;base64," + [Convert]::ToBase64String($ms.ToArray())
          }
        }
      }
    }
    $tl = $s.GetTimelineProperties()
    $info = $s.GetPlaybackInfo()
    $out = [ordered]@{
      active   = $true
      title    = $p.Title
      artist   = $p.Artist
      album    = $p.AlbumTitle
      playing  = ($info.PlaybackStatus -eq 4)
      position = [math]::Round($tl.Position.TotalSeconds, 1)
      duration = [math]::Round($tl.EndTime.TotalSeconds, 1)
      updated  = $tl.LastUpdatedTime.ToUnixTimeMilliseconds()
      source   = $s.SourceAppUserModelId
      output   = $audioOut
      art      = $art
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
    Write-Output ($out | ConvertTo-Json -Compress)
  }
  Start-Sleep -Milliseconds 1000
}
