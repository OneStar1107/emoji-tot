# Lyrics lookup for one track (NetEase first when requested, otherwise LRCLIB).
# Prints one JSON envelope, including an empty candidate list when there is no
# match. A transport failure is `ok:false`, which the main process caches only
# for a few minutes.
param(
  [string]$TrackB64,
  [string]$ArtistB64,
  [string]$AlbumB64,
  [double]$Duration = 0,
  [ValidateSet('Lrclib', 'Netease')]
  [string]$Provider = 'Lrclib',
  [string]$TrackId = '',
  [string]$BaseUrl = 'https://lrclib.net/api/search',
  [string]$NeteaseBaseUrl = 'https://music.163.com'
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$track  = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($TrackB64))
$artist = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($ArtistB64))
$album  = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($AlbumB64))

if (-not $track) { Write-Output 'null'; exit 0 }

if ($Provider -eq 'Netease') {
  $neteaseRoot = $NeteaseBaseUrl.TrimEnd('/')
  $headers = @{
    Referer = "$neteaseRoot/"
    'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36'
  }

  function Words([string]$value) {
    return ([string]$value).Normalize([Text.NormalizationForm]::FormKC).ToLowerInvariant() -replace '[^\p{L}\p{N}]+', ''
  }

  function Get-NeteaseCandidate($song) {
    $id = [string]$song.id
    if ($id -notmatch '^\d+$') { return $null }
    $lyricPayload = Invoke-RestMethod -Uri "$neteaseRoot/api/song/lyric?id=$id&lv=-1&kv=-1&tv=-1" `
      -Headers $headers -TimeoutSec 10
    $lyric = [string]$lyricPayload.lrc.lyric
    if (-not $lyric -or
        -not [regex]::IsMatch($lyric, '(?m)^\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]')) {
      return $null
    }
    $artists = @($song.artists | ForEach-Object { [string]$_.name } | Where-Object { $_ })
    return [ordered]@{
      id = $id
      trackName = [string]$song.name
      artistName = $artists -join ' / '
      duration = [math]::Round(([double]$song.duration) / 1000, 3)
      syncedLyrics = $lyric
    }
  }

  try {
    $candidates = @()
    if ($TrackId -match '^\d+$') {
      $candidate = Get-NeteaseCandidate ([pscustomobject]@{
        id = $TrackId
        name = $track
        artists = @(@{ name = $artist })
        duration = [math]::Round($Duration * 1000)
      })
      if ($candidate) { $candidates += $candidate }
    } else {
      $query = "$track $artist".Trim()
      $searchUrl =
        "$neteaseRoot/api/search/get/web?csrf_token=&s=$([uri]::EscapeDataString($query))" +
        '&type=1&offset=0&total=true&limit=8'
      $search = Invoke-RestMethod -Uri $searchUrl -Headers $headers -TimeoutSec 10
      $songs = @($search.result.songs | Group-Object id | ForEach-Object { $_.Group[0] })
      $wantedTitle = Words $track
      $wantedArtist = Words $artist
      $ranked = @($songs | Where-Object {
        $title = Words ([string]$_.name)
        $names = Words (@($_.artists | ForEach-Object { [string]$_.name }) -join ' ')
        $titleMatch = $title -eq $wantedTitle -or $title.Contains($wantedTitle) -or $wantedTitle.Contains($title)
        $artistMatch = -not $wantedArtist -or -not $names -or
          $names.Contains($wantedArtist) -or $wantedArtist.Contains($names)
        $titleMatch -and $artistMatch
      } | Sort-Object {
        $gap = if ($Duration -gt 0 -and [double]$_.duration -gt 0) {
          [math]::Abs(([double]$_.duration / 1000) - $Duration)
        } else { 9999 }
        if ((Words ([string]$_.name)) -eq $wantedTitle) { $gap } else { $gap + 1000 }
      } | Select-Object -First 4)

      foreach ($song in $ranked) {
        $candidate = Get-NeteaseCandidate $song
        if ($candidate) { $candidates += $candidate }
      }
    }
    $payload = [ordered]@{ ok = $true; source = 'netease'; candidates = @($candidates) }
    Write-Output ($payload | ConvertTo-Json -Depth 6 -Compress)
  } catch {
    Write-Output '{"ok":false,"source":"netease","candidates":[]}'
  }
  exit 0
}

$query = "track_name=$([uri]::EscapeDataString($track))&artist_name=$([uri]::EscapeDataString($artist))"

try {
  $r = Invoke-RestMethod -Uri "${BaseUrl}?${query}" -TimeoutSec 10
  $candidates = @($r) | Select-Object -First 12
  $payload = [ordered]@{ ok = $true; source = 'lrclib'; candidates = @($candidates) }
  Write-Output ($payload | ConvertTo-Json -Depth 5 -Compress)
} catch {
  Write-Output '{"ok":false,"candidates":[]}'
}
