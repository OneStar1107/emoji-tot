# Weather for the EmojiTot island: one city in, one JSON object out.
#
# Why PowerShell instead of the main process: Electron's main-process network
# shares Chromium's stack, and on this machine every HTTPS request from it timed
# out while PowerShell reached the same hosts immediately. One request every
# fifteen minutes does not justify fighting the network stack.
param([string]$CityB64)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$city = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($CityB64))
$escaped = [uri]::EscapeDataString($city)

$geo = Invoke-RestMethod -Uri "https://geocoding-api.open-meteo.com/v1/search?name=$escaped&count=1&language=zh&format=json" -TimeoutSec 12
if (-not $geo.results -or $geo.results.Count -eq 0) { Write-Output 'null'; exit 0 }
$place = $geo.results[0]

$forecast = "https://api.open-meteo.com/v1/forecast?latitude=$($place.latitude)&longitude=$($place.longitude)"
$forecast += "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m"
$forecast += "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset"
$forecast += "&timezone=auto&forecast_days=7"

$data = Invoke-RestMethod -Uri $forecast -TimeoutSec 12

[pscustomobject]@{
  place   = [pscustomobject]@{ name = $place.name; country = $place.country; lat = $place.latitude; lon = $place.longitude }
  current = $data.current
  daily   = $data.daily
} | ConvertTo-Json -Depth 8 -Compress
