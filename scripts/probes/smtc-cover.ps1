# SMTC cover probe - what Windows actually hands a now-playing consumer.
#
#   smtc-cover.ps1                 -> JSON: every live session, its app id,
#                                     playback state, metadata and whether a
#                                     thumbnail exists plus its byte count
#   smtc-cover.ps1 -SaveThumbs <d>  -> also write each thumbnail to <d>
#   smtc-cover.ps1 -Pretty          -> indented JSON (default is one line)
#
# This is the measurement half of docs/LIVE-COVERAGE.md: the island sees
# exactly one GlobalSystemMediaTransportControlsSession per app that registered
# with the Windows media session, and the only artwork it can read is that
# session's thumbnail. A page can publish the richest MediaSession metadata
# there is; if the app never forwards it into SMTC, Windows shows nothing.
#
# Measured on Windows with the stock WinRT projection, no native module.
param(
  [string]$SaveThumbs = '',
  [switch]$Pretty
)

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]

function Await($op, [Type]$type) {
  $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
  $t.Result
}

$MgrType    = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$PropsType  = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$StreamType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$AsStreamForRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsStreamForRead' -and $_.GetParameters().Count -eq 1 }

function Get-Mime([byte[]]$bytes) {
  if ($bytes.Length -ge 8 -and $bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50) { return 'image/png' }
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8) { return 'image/jpeg' }
  if ($bytes.Length -ge 12 -and $bytes[0] -eq 0x52 -and $bytes[8] -eq 0x57) { return 'image/webp' }
  if ($bytes.Length -ge 6 -and $bytes[0] -eq 0x47 -and $bytes[1] -eq 0x49) { return 'image/gif' }
  return ''
}

$mgr = Await ($MgrType::RequestAsync()) $MgrType
$sessions = @()

foreach ($s in @($mgr.GetSessions())) {
  $p = Await ($s.TryGetMediaPropertiesAsync()) $PropsType
  $info = $s.GetPlaybackInfo()
  $tl = $s.GetTimelineProperties()

  $thumbBytes = 0
  $thumbMime = ''
  $thumbPath = ''
  if ($p -and $p.Thumbnail) {
    $rs = Await ($p.Thumbnail.OpenReadAsync()) $StreamType
    if ($rs) {
      $stream = $AsStreamForRead.Invoke($null, @($rs))
      $ms = New-Object System.IO.MemoryStream
      $stream.CopyTo($ms)
      $stream.Dispose()
      $bytes = $ms.ToArray()
      $thumbBytes = $bytes.Length
      $thumbMime = Get-Mime $bytes
      if ($SaveThumbs -and $bytes.Length -gt 0) {
        $safe = ($s.SourceAppUserModelId -replace '[^A-Za-z0-9._-]', '_')
        if ($safe.Length -gt 60) { $safe = $safe.Substring(0, 60) }
        $ext = 'bin'
        if ($thumbMime -eq 'image/png') { $ext = 'png' }
        elseif ($thumbMime -eq 'image/jpeg') { $ext = 'jpg' }
        elseif ($thumbMime -eq 'image/webp') { $ext = 'webp' }
        $thumbPath = Join-Path $SaveThumbs ($safe + '.' + $ext)
        [System.IO.File]::WriteAllBytes($thumbPath, $bytes)
      }
    }
  }

  $sessions += [pscustomobject][ordered]@{
    app          = [string]$s.SourceAppUserModelId
    title        = [string]$p.Title
    artist       = [string]$p.Artist
    album        = [string]$p.AlbumTitle
    subtitle     = [string]$p.SubTitle
    status       = [string]$info.PlaybackStatus
    playing      = ($info.PlaybackStatus -eq 4)
    controls     = [string]$info.Controls
    position     = [math]::Round($tl.Position.TotalSeconds, 1)
    duration     = [math]::Round($tl.EndTime.TotalSeconds, 1)
    thumb        = ($thumbBytes -gt 0)
    thumbBytes   = $thumbBytes
    thumbMime    = $thumbMime
    thumbPath    = $thumbPath
  }
}

$out = [ordered]@{
  ts        = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  sessions  = $sessions
  count     = $sessions.Count
  withThumb = @($sessions | Where-Object { $_.thumb }).Count
}

if ($Pretty) { $out | ConvertTo-Json -Depth 6 } else { $out | ConvertTo-Json -Depth 6 -Compress }
