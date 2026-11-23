# EmojiTot Bilibili live bridge - room title, anchor name, start time and cover.
#
#   bilibili-cover.ps1 -Title "<SMTC title>"
#     -> {"ok":true,"platform":"bilibili","roomId":...,
#         "roomTitle":...,"anchorName":...,"startedAt":...,"art":...}
#     -> {"ok":false} otherwise; playback continues with the title fallback
#
# The Bilibili live page sets no MediaSession artwork, so Windows hands the
# island a title and, depending on the browser, a 300px placeholder thumbnail.
# The title still names the broadcast and the anchor:
#
#   "<stream title> - <anchor> - <Bilibili live suffix>"
#
# The public live search endpoint maps that anchor to a room. The room endpoint
# then supplies the authoritative title, live start and cover.
# Nothing is logged in and no page is scraped. Any failure prints
# {"ok":false} and exits 0.
param([string]$Title = "")

$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Out-Result($payload) {
  if (-not $payload) { $payload = [ordered]@{ ok = $false } }
  Write-Output ($payload | ConvertTo-Json -Compress)
}

function Get-ImageData([string]$Url, [string]$Referer, [string]$UserAgent) {
  if (-not $Url) { return "" }
  try {
    $image = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 12 `
      -UserAgent $UserAgent -Headers @{ Referer = $Referer }
    $bytes = $image.Content
    if (-not $bytes -or $bytes.Length -lt 1000 -or $bytes.Length -gt 8MB) { return "" }
    $mime = "image/jpeg"
    if ($image.Headers["Content-Type"] -match "image/(png|webp|gif)") {
      $mime = "image/" + $Matches[1]
    }
    return "data:" + $mime + ";base64," + [Convert]::ToBase64String($bytes)
  } catch {
    return ""
  }
}

function Get-Utf8Json([string]$Url, [hashtable]$Headers, [string]$UserAgent) {
  try {
    $client = New-Object System.Net.WebClient
    $client.Headers.Add("User-Agent", $UserAgent)
    foreach ($name in $Headers.Keys) {
      $client.Headers.Add([string]$name, [string]$Headers[$name])
    }
    $bytes = $client.DownloadData($Url)
    $text = [System.Text.Encoding]::UTF8.GetString($bytes)
    return ($text | ConvertFrom-Json)
  } catch {
    return $null
  }
}

$result = $null
try {
  # Bilibili's page-title suffix, written as ASCII escapes so this script is
  # pure ASCII: PowerShell 5.1 reads a BOM-less file as ANSI, and a literal
  # Chinese suffix then fails to match the UTF-8 argument it was given.
  $match = [regex]::Match($Title, '^(?<stream>.*?)\s+-\s+(?<anchor>[^-]+?)\s+-\s+\u54d4\u54e9\u54d4\u54e9\u76f4\u64ad')
  if ($match.Success) {
    $anchor = $match.Groups['anchor'].Value.Trim()
    $userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    $keyword = [uri]::EscapeDataString($anchor)
    $api = "https://api.bilibili.com/x/web-interface/search/type?search_type=live_room&keyword=" + $keyword
    $headers = @{
      Referer = "https://www.bilibili.com/"
      Cookie  = "buvid3=" + [guid]::NewGuid().ToString('N').ToUpper() +
        "infoc; b_nut=" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    }
    $data = Get-Utf8Json $api $headers $userAgent
    if (-not $data -or $data.code -ne 0) {
      # The search gate occasionally rejects a freshly minted visitor id;
      # a second anonymous id normally clears it.
      Start-Sleep -Milliseconds 120
      $headers.Cookie = "buvid3=" + [guid]::NewGuid().ToString('N').ToUpper() +
        "infoc; b_nut=" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
      $data = Get-Utf8Json $api $headers $userAgent
    }

    if ($data -and $data.code -eq 0 -and $data.data -and $data.data.result) {
      $rooms = @($data.data.result)
      $room = @($rooms | Where-Object { $_.uname -eq $anchor -and $_.live_status -eq 1 }) | Select-Object -First 1
      if ($room) {
        $roomInfo = Get-Utf8Json (
          "https://api.live.bilibili.com/room/v1/Room/get_info?room_id=" + [string]$room.roomid
        ) @{ Referer = "https://live.bilibili.com/" } $userAgent

        $detail = $null
        if ($roomInfo -and $roomInfo.code -eq 0 -and $roomInfo.data) { $detail = $roomInfo.data }
        if (-not $detail -or $detail.live_status -ne 1) { $detail = $room }

        $roomTitle = [string]$detail.title
        if (-not $roomTitle) { $roomTitle = [string]$room.title }
        $roomTitle = [regex]::Replace($roomTitle, '<[^>]+>', '')
        $roomTitle = [System.Net.WebUtility]::HtmlDecode($roomTitle).Trim()
        $anchorName = [string]$room.uname
        if (-not $anchorName) { $anchorName = [string]$detail.uname }
        if (-not $anchorName) { $anchorName = $anchor }
        $anchorName = [regex]::Replace($anchorName, '<[^>]+>', '')
        $anchorName = [System.Net.WebUtility]::HtmlDecode($anchorName).Trim()
        $roomId = [string]$detail.room_id
        if (-not $roomId) { $roomId = [string]$room.roomid }

        $startedAt = [long]0
        $liveTime = [string]$detail.live_time
        if ($liveTime -match '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$') {
          try {
            $local = [datetime]::ParseExact(
              $liveTime,
              'yyyy-MM-dd HH:mm:ss',
              [System.Globalization.CultureInfo]::InvariantCulture
            )
            $startedAt = (New-Object System.DateTimeOffset($local, [TimeSpan]::FromHours(8))).ToUnixTimeMilliseconds()
          } catch { }
        }

        $coverUrl = [string]$detail.user_cover
        if (-not $coverUrl) { $coverUrl = [string]$detail.cover }
        if (-not $coverUrl) { $coverUrl = [string]$detail.keyframe }
        if (-not $coverUrl) { $coverUrl = [string]$room.user_cover }
        if (-not $coverUrl) { $coverUrl = [string]$room.cover }
        if ($coverUrl.StartsWith("//")) { $coverUrl = "https:" + $coverUrl }
        $art = Get-ImageData $coverUrl "https://live.bilibili.com/" $userAgent

        if ($roomTitle -and $anchorName) {
          $result = [ordered]@{
            ok        = $true
            platform  = "bilibili"
            roomId    = $roomId
            roomTitle = $roomTitle
            anchorName = $anchorName
            startedAt = $startedAt
            art       = $art
          }
        }
      }
    }
  }
} catch { $result = $null }

Out-Result $result
