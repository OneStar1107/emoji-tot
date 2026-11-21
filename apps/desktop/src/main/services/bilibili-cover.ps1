# EmojiTot Bilibili cover bridge - the artwork a live stream never exposes.
#
#   bilibili-cover.ps1 -Title "<SMTC title>"
#     -> {"ok":true,"art":"data:image/jpeg;base64,..."} when a cover was found
#     -> {"ok":false} otherwise; the caller treats that as "no cover"
#
# The Bilibili live page sets no MediaSession artwork, so Windows hands the
# island a title and no thumbnail (measured: thumb=none on the Chrome SMTC
# session). The title still names the broadcast and the anchor:
#
#   "<stream title> - <anchor> - <Bilibili live suffix>"
#
# The public live search endpoint maps that anchor to a room and its cover.
# Nothing is logged in and no page is scraped: one anonymous cookie request,
# one search request, one image request, then the base64 the renderer already
# knows how to draw. Any failure prints {"ok":false} and exits 0.
param([string]$Title = "")

$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Out-Result($dataUrl) {
  if ($dataUrl) {
    $payload = [ordered]@{ ok = $true; art = $dataUrl }
  } else {
    $payload = [ordered]@{ ok = $false }
  }
  Write-Output ($payload | ConvertTo-Json -Compress)
}

$art = ""

try {
  # Bilibili's page-title suffix, written as ASCII escapes so this script is
  # pure ASCII: PowerShell 5.1 reads a BOM-less file as ANSI, and a literal
  # Chinese suffix then fails to match the UTF-8 argument it was given.
  $match = [regex]::Match($Title, '^(?<stream>.*?)\s+-\s+(?<anchor>[^-]+?)\s+-\s+\u54d4\u54e9\u54d4\u54e9\u76f4\u64ad')
  if ($match.Success) {
    $anchor = $match.Groups['anchor'].Value.Trim()
    $userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    # The live search endpoint answers -412 until an anonymous visitor cookie
    # exists; the home request is here only to receive that cookie.
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    try {
      Invoke-WebRequest -Uri "https://www.bilibili.com/" -UseBasicParsing -TimeoutSec 8 -UserAgent $userAgent -WebSession $session | Out-Null
    } catch { }

    $keyword = [uri]::EscapeDataString($anchor)
    $api = "https://api.bilibili.com/x/web-interface/search/type?search_type=live_room&keyword=" + $keyword
    $headers = @{ Referer = "https://www.bilibili.com/" }
    $data = $null
    try {
      $data = Invoke-RestMethod -Uri $api -Headers $headers -UserAgent $userAgent -WebSession $session -TimeoutSec 8
    } catch { }
    if (-not $data -or $data.code -ne 0) {
      # A random buvid3 is enough for the endpoint when the cookie jar did not
      # stick; both attempts are anonymous.
      $uuid = [guid]::NewGuid().ToString()
      $headers.Cookie = "buvid3=" + $uuid + "infoc; b_nut=" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
      try {
        $data = Invoke-RestMethod -Uri $api -Headers $headers -UserAgent $userAgent -TimeoutSec 8
      } catch { }
    }

    if ($data -and $data.code -eq 0 -and $data.data -and $data.data.result) {
      $rooms = @($data.data.result)
      $room = @($rooms | Where-Object { $_.uname -eq $anchor -and $_.live_status -eq 1 }) | Select-Object -First 1
      if (-not $room) { $room = $rooms | Select-Object -First 1 }
      $cover = [string]$room.cover
      if (-not $cover) { $cover = [string]$room.pic }
      if (-not $cover) { $cover = [string]$room.user_cover }
      if ($cover.StartsWith("//")) { $cover = "https:" + $cover }
      if ($cover -match '^https?://') {
        $image = Invoke-WebRequest -Uri $cover -UseBasicParsing -TimeoutSec 10 -UserAgent $userAgent -Headers @{ Referer = "https://live.bilibili.com/" }
        $bytes = $image.Content
        if ($bytes -and $bytes.Length -gt 0) {
          $mime = "image/jpeg"
          if ($image.Headers["Content-Type"] -match "image/(png|webp|gif)") { $mime = "image/" + $Matches[1] }
          $art = "data:" + $mime + ";base64," + [Convert]::ToBase64String($bytes)
        }
      }
    }
  }
} catch { $art = "" }

Out-Result $art
