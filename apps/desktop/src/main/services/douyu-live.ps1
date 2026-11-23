# EmojiTot Douyu live bridge - room metadata and the real room cover.
#
#   douyu-live.ps1 -Title "<SMTC title>" -Artist "<SMTC artist>"
#     -> {"ok":true,"platform":"douyu","roomId":...,"roomTitle":...,
#         "anchorName":...,"startedAt":...,"art":...}
#     -> {"ok":false} otherwise
#
# Windows reports Douyu's room name as the media title and the anchor name as
# the artist, but there is no room id in the media session. The public search
# endpoint maps those exact names to a room. Its betard payload then supplies
# the stable cover, owner name and broadcast start time.
param(
  [string]$Title = "",
  [string]$Artist = ""
)

$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Out-Result($payload) {
  if (-not $payload) { $payload = [ordered]@{ ok = $false } }
  Write-Output ($payload | ConvertTo-Json -Compress)
}

function Get-ImageData([string]$Url, [string]$UserAgent) {
  if (-not $Url) { return "" }
  try {
    $image = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 12 `
      -UserAgent $UserAgent -Headers @{ Referer = "https://www.douyu.com/" }
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

function Find-Room([string]$Keyword, [string]$Title, [string]$Artist, [string]$UserAgent) {
  if (-not $Keyword) { return $null }
  try {
    $api = "https://www.douyu.com/japi/search/api/searchShow?kw=" +
      [uri]::EscapeDataString($Keyword) + "&page=1&pageSize=10"
    $data = Invoke-RestMethod -Uri $api -TimeoutSec 10 -UserAgent $UserAgent `
      -Headers @{ Referer = "https://www.douyu.com/" }
    if (-not $data -or $data.error -ne 0 -or -not $data.data) { return $null }
    $rooms = @($data.data.relateShow)
    $byRoomTitle = @($rooms | Where-Object {
      $_.isLive -eq 1 -and
      ([string]$_.roomName).Trim() -ieq $Title -and
      (-not $Artist -or ([string]$_.nickName).Trim() -ieq $Artist)
    }) | Select-Object -First 1
    if ($byRoomTitle) { return $byRoomTitle }
    $byAnchor = @($rooms | Where-Object {
      $_.isLive -eq 1 -and
      ([string]$_.nickName).Trim() -ieq $Title -and
      (-not $Artist -or ([string]$_.roomName).Trim() -ieq $Artist)
    }) | Select-Object -First 1
    return $byAnchor
  } catch {
    return $null
  }
}

$result = $null
try {
  $title = ([string]$Title).Trim()
  $artist = ([string]$Artist).Trim()
  if (-not $title -and -not $artist) {
    Out-Result $result
    exit 0
  }

  $userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  $room = Find-Room $title $title $artist $userAgent
  if (-not $room -and $artist -and $artist -ine $title) {
    $room = Find-Room $artist $title $artist $userAgent
  }

  if ($room -and $room.rid) {
    $detail = Invoke-RestMethod -Uri ("https://www.douyu.com/betard/" + [string]$room.rid) `
      -TimeoutSec 12 -UserAgent $userAgent -Headers @{ Referer = "https://www.douyu.com/" }
    $info = $detail.room
    if ($info -and ($info.show_status -eq 1 -or $info.status -eq 1)) {
      $roomTitle = ([string]$info.room_name).Trim()
      if (-not $roomTitle) { $roomTitle = ([string]$room.roomName).Trim() }
      $anchorName = [string]$info.owner_name
      if (-not $anchorName) { $anchorName = [string]$info.nickname }
      if (-not $anchorName) { $anchorName = [string]$room.nickName }
      if (-not $anchorName) { $anchorName = $artist }
      $anchorName = [regex]::Replace($anchorName, '<[^>]+>', '')
      $anchorName = [System.Net.WebUtility]::HtmlDecode($anchorName).Trim()
      $roomId = [string]$info.room_id
      if (-not $roomId) { $roomId = [string]$room.rid }

      $startedAt = [long]0
      if ([double]$info.show_time -gt 0) {
        $startedAt = [long]([double]$info.show_time * 1000)
      }

      $coverUrl = [string]$info.coverSrc
      if (-not $coverUrl) {
        $relative = [string]$info.room_src
        if ($relative) { $coverUrl = "https://rpic.douyucdn.cn/" + $relative.TrimStart('/') }
      }
      if (-not $coverUrl) { $coverUrl = [string]$room.roomSrc }
      $art = Get-ImageData $coverUrl $userAgent

      if ($roomTitle -and $anchorName) {
        $result = [ordered]@{
          ok        = $true
          platform  = "douyu"
          roomId    = $roomId
          roomTitle = $roomTitle
          anchorName = $anchorName
          startedAt = $startedAt
          art       = $art
        }
      }
    }
  }
} catch { $result = $null }

Out-Result $result
