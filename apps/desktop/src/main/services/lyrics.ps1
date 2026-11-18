# Lyrics lookup for one track (LRCLIB, keyless).
# Prints the JSON object, or 'null' when there is no match.
param([string]$TrackB64, [string]$ArtistB64, [string]$AlbumB64, [double]$Duration = 0)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$track  = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($TrackB64))
$artist = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($ArtistB64))
$album  = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($AlbumB64))

if (-not $track) { Write-Output 'null'; exit 0 }

$base = 'https://lrclib.net/api/get'
$query = "track_name=$([uri]::EscapeDataString($track))&artist_name=$([uri]::EscapeDataString($artist))"
if ($album) { $query += "&album_name=$([uri]::EscapeDataString($album))" }
if ($Duration -gt 0) { $query += "&duration=$([int][math]::Round($Duration))" }

try {
  $r = Invoke-RestMethod -Uri "$base?$query" -TimeoutSec 10
  if ($null -eq $r) { Write-Output 'null' } else { $r | ConvertTo-Json -Depth 4 -Compress }
} catch {
  Write-Output 'null'
}
