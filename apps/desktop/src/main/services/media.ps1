# EmojiTot media bridge — Windows SMTC in, one JSON line per second out.
#
#   media.ps1 watch              -> stream now-playing JSON until killed
#   media.ps1 toggle|next|prev   -> one control action, then exit
#   media.ps1 seek <seconds>     -> jump, then exit
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
  if ($s) {
    switch ($Mode) {
      "toggle" { Await ($s.TryTogglePlayPauseAsync()) ([bool]) | Out-Null }
      "next"   { Await ($s.TrySkipNextAsync()) ([bool]) | Out-Null }
      "prev"   { Await ($s.TrySkipPreviousAsync()) ([bool]) | Out-Null }
      "seek"   { Await ($s.TryChangePlaybackPositionAsync([long]($Arg * 10000000))) ([bool]) | Out-Null }
    }
  }
  exit
}

$lastKey = ""
$art = ""

while ($true) {
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
      art      = $art
    }
    Write-Output ($out | ConvertTo-Json -Compress)
  }
  Start-Sleep -Milliseconds 1000
}
