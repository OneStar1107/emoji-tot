# Weather for the EmojiTot island: one place in, one JSON object out.
#
# Why PowerShell instead of the main process: Electron's main-process network
# shares Chromium's stack, and on this machine every HTTPS request from it timed
# out while PowerShell reached the same hosts immediately. One request every
# fifteen minutes does not justify fighting the network stack.
#
# Two ways to say where: a city name (geocoded), or -AutoLocate, which asks an
# IP geolocation service once and then queries the forecast with the exact
# coordinates. Coordinates are better than a city name anyway — "香港" resolves
# to the city centre, an IP resolves to roughly where you are.
param([string]$CityB64, [switch]$AutoLocate)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$place = $null

if ($AutoLocate) {
  # Several free services; try them in order because any one can rate-limit.
  $services = @(
    @{ url = 'https://ipapi.co/json/'; city = 'city'; region = 'region'; country = 'country_name'; lat = 'latitude'; lon = 'longitude' },
    @{ url = 'https://ipinfo.io/json'; city = 'city'; region = 'region'; country = 'country'; lat = 'loc'; lon = $null }
  )
  foreach ($service in $services) {
    try {
      $info = Invoke-RestMethod -Uri $service.url -TimeoutSec 10
      if (-not $info) { continue }
      $lat = $null
      $lon = $null
      if ($service.lon) {
        $lat = [double]$info.($service.lat)
        $lon = [double]$info.($service.lon)
      } elseif ($info.loc) {
        $parts = ([string]$info.loc).Split(',')
        if ($parts.Count -eq 2) {
          $lat = [double]$parts[0]
          $lon = [double]$parts[1]
        }
      }
      if ($null -eq $lat -or $null -eq $lon) { continue }
      $name = [string]$info.($service.city)
      if (-not $name) { $name = [string]$info.($service.region) }
      if (-not $name) { $name = '当前位置' }
      $place = [pscustomobject]@{ name = $name; country = [string]$info.($service.country); lat = $lat; lon = $lon }
      break
    } catch {
      continue
    }
  }
  if (-not $place) { Write-Output 'null'; exit 0 }
} else {
  $city = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($CityB64))
  $escaped = [uri]::EscapeDataString($city)
  $geo = Invoke-RestMethod -Uri "https://geocoding-api.open-meteo.com/v1/search?name=$escaped&count=1&language=zh&format=json" -TimeoutSec 12
  if (-not $geo.results -or $geo.results.Count -eq 0) { Write-Output 'null'; exit 0 }
  $hit = $geo.results[0]
  $place = [pscustomobject]@{ name = $hit.name; country = $hit.country; lat = $hit.latitude; lon = $hit.longitude }
}

$forecast = "https://api.open-meteo.com/v1/forecast?latitude=$($place.lat)&longitude=$($place.lon)"
$forecast += "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m"
$forecast += "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset"
$forecast += "&timezone=auto&forecast_days=7"

$data = Invoke-RestMethod -Uri $forecast -TimeoutSec 12

[pscustomobject]@{
  place   = [pscustomobject]@{ name = $place.name; country = $place.country; lat = $place.lat; lon = $place.lon }
  current = $data.current
  daily   = $data.daily
} | ConvertTo-Json -Depth 8 -Compress
