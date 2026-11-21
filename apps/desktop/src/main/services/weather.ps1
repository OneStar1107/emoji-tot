# Weather for the EmojiTot island: one place in, one JSON object out.
#
# Why PowerShell instead of the main process: Electron's main-process network
# shares Chromium's stack, and on this machine every HTTPS request from it timed
# out while PowerShell reached the same hosts immediately. One request every
# fifteen minutes does not justify fighting the network stack.
#
# Three ways to say where: a city name (-CityB64, geocoded), the system
# locator (-AutoLocate: Windows location first, then IP), or coordinates a
# previous -AutoLocate settled on (-Lat/-Lon). The caller caches the place for
# thirty minutes and only re-asks for the forecast after that, so the locate
# chain runs once per half hour, not once per refresh.
#
# Where the place comes from, in order: Windows.Devices.Geolocation (silent
# when the service is off, denied, or has no fix), then ipinfo.io, then
# myip.ipip.net (domestic, Chinese), then ipapi.co. A source whose body is not
# JSON is a failure and the chain moves on: ipapi.co answers with a Cloudflare
# challenge page on some networks. When more than one IP source answers, the
# Asia/Shanghai one wins, and a city name beats a province name inside that.
#
# Open-Meteo's geocoding is a forward search (name in, coordinates out); there
# is no reverse path behind that host (v1/reverse answers 404). A system fix is
# therefore reverse-geocoded by BigDataCloud's keyless client API, then the
# name is canonicalised through Open-Meteo's geocoding search, which is what
# the weather page ends up showing.
#
# Diagnostic: EMOJITOT_NO_SYSTEM_LOCATION=1 skips the system locator so the IP
# fallback can be exercised on a machine where location works.
param([string]$CityB64, [switch]$AutoLocate, [double]$Lat, [double]$Lon, [string]$NameB64, [string]$CountryB64)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$steps = New-Object System.Collections.ArrayList

function Write-Step([string]$line) {
  [void]$script:steps.Add($line)
  [Console]::Error.WriteLine('[geo] ' + $line)
}

function Read-B64([string]$value) {
  if (-not $value) { return '' }
  return [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($value))
}

# One retry behind each Open-Meteo request. The TLS stack on this machine
# occasionally closes the first connection ("基础连接已经关闭"), and a second
# attempt 400ms later usually gets through. A retried request that still fails
# throws that error, so the caller's error path does not change.
function Invoke-WithRetry([string]$Label, [string]$Uri) {
  for ($attempt = 1; ; $attempt++) {
    try {
      return Invoke-RestMethod -Uri $Uri -TimeoutSec 12
    } catch {
      if ($attempt -ge 2) { throw }
      [Console]::Error.WriteLine("[weather] retry $Label after: $($_.Exception.Message)")
      Start-Sleep -Milliseconds 400
    }
  }
}

# Parsed JSON, or $null when the body is anything else (an HTML challenge page,
# an error page, an empty body). The caller treats $null as "this source
# failed": a body that is not JSON must never be read as a place.
function Get-Json([string]$Uri, [int]$TimeoutSec) {
  try {
    $response = Invoke-WebRequest -Uri $Uri -TimeoutSec $TimeoutSec -UseBasicParsing
    if (-not $response.Content) { return $null }
    return ($response.Content | ConvertFrom-Json)
  } catch {
    return $null
  }
}

function Get-Kilometres([double]$lat1, [double]$lon1, [double]$lat2, [double]$lon2) {
  $radians = [math]::PI / 180
  $dLat = ($lat2 - $lat1) * $radians
  $dLon = ($lon2 - $lon1) * $radians
  $a = [math]::Sin($dLat / 2) * [math]::Sin($dLat / 2) + [math]::Cos($lat1 * $radians) * [math]::Cos($lat2 * $radians) * [math]::Sin($dLon / 2) * [math]::Sin($dLon / 2)
  return 6371 * 2 * [math]::Atan2([math]::Sqrt($a), [math]::Sqrt(1 - $a))
}

# The system locator: WinRT, one shot, no dialog of our own. Windows decides
# whether this app may use location; a refusal surfaces as an exception and
# the chain silently falls through to the IP sources.
function Get-SystemFixOnce {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Devices.Geolocation.Geolocator, Windows.Devices.Geolocation, ContentType = WindowsRuntime]
  $locator = New-Object Windows.Devices.Geolocation.Geolocator
  $locator.DesiredAccuracyInMeters = 3000
  $operation = $locator.GetGeopositionAsync()
  # PowerShell cannot await an IAsyncOperation directly; AsTask turns it into a
  # Task, and Wait(ms) is the timeout that keeps a hung location service from
  # stalling the whole weather refresh.
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]
  $task = $asTask.MakeGenericMethod([Windows.Devices.Geolocation.Geoposition]).Invoke($null, @($operation))
  if (-not $task.Wait(8000)) { throw 'no fix within 8s' }
  if ($task.IsFaulted) { throw $task.Exception.GetBaseException().Message }
  $position = $task.Result.Coordinate.Point.Position
  if ($null -eq $position) { throw 'empty position' }
  return [pscustomobject]@{ lat = [double]$position.Latitude; lon = [double]$position.Longitude }
}

function Get-SystemFix {
  if ($env:EMOJITOT_NO_SYSTEM_LOCATION -eq '1') {
    Write-Step 'system location: disabled by EMOJITOT_NO_SYSTEM_LOCATION'
    return $null
  }
  # One retry: the WinRT projection occasionally fails to initialise on the
  # first call in a fresh host ("Cannot index into a null array") and the
  # second call, 400ms later, succeeds. A real refusal fails both the same way.
  for ($attempt = 1; $attempt -le 2; $attempt++) {
    try {
      $fix = Get-SystemFixOnce
      Write-Step ('system location: ok ' + [math]::Round([double]$fix.lat, 5) + ',' + [math]::Round([double]$fix.lon, 5))
      return $fix
    } catch {
      if ($attempt -eq 2) {
        Write-Step ('system location: skipped (' + $_.Exception.Message + ')')
        return $null
      }
      Start-Sleep -Milliseconds 400
    }
  }
}

# Forward geocoding through Open-Meteo, used to canonicalise the name the page
# shows. Ten kilometres of slack below: a district centroid and the city
# centroid differ, but not by a region. A name that changes nothing is not
# accepted, so a same-named city on the other side of the country cannot win.
function Resolve-GeocodedName([string]$name, [double]$lat, [double]$lon, [double]$toleranceKm) {
  if (-not $name) { return $null }
  # "广州市" is not a geocoding hit; "广州" is. Try the name as-is first, then
  # with a trailing administrative suffix removed.
  $variants = @($name)
  $stripped = $name -replace '(市|省|区|县)$', ''
  if ($stripped -and $stripped -ne $name) { $variants += $stripped }
  foreach ($variant in $variants) {
    $uri = 'https://geocoding-api.open-meteo.com/v1/search?name=' + [uri]::EscapeDataString($variant) + '&count=1&language=zh&format=json'
    $geo = Get-Json $uri 8
    if (-not $geo -or -not $geo.results) { continue }
    $hit = $geo.results[0]
    if ($toleranceKm -gt 0) {
      $distance = Get-Kilometres $lat $lon ([double]$hit.latitude) ([double]$hit.longitude)
      if ($distance -gt $toleranceKm) { continue }
    }
    return [pscustomobject]@{ name = [string]$hit.name; country = [string]$hit.country; lat = [double]$hit.latitude; lon = [double]$hit.longitude }
  }
  return $null
}

# Reverse geocoding for a system fix. BigDataCloud answers with a Chinese
# address for keyless use; each level of it is then resolved through Open-Meteo
# geocoding so the page keeps one naming scheme.
function Get-ReversePlace([double]$lat, [double]$lon) {
  $reverse = Get-Json ("https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=$lat&longitude=$lon&localityLanguage=zh") 8
  if (-not $reverse) {
    Write-Step 'reverse name: no JSON from BigDataCloud'
    return $null
  }
  $raw = @(([string]$reverse.city, [string]$reverse.locality, [string]$reverse.principalSubdivision) | Where-Object { $_ })
  if (-not $raw) { Write-Step 'reverse name: empty address'; return $null }
  foreach ($candidate in $raw) {
    $geo = Resolve-GeocodedName $candidate $lat $lon 120
    if ($geo) {
      Write-Step ('reverse name: ' + $geo.name + ' (' + $geo.country + ')')
      return $geo
    }
    Write-Step ('reverse name: no geocoding hit for ' + $candidate)
  }
  # No canonical hit within range: keep the local label rather than dropping
  # the fix we already have.
  Write-Step ('reverse name: using ' + $raw[0])
  return [pscustomobject]@{ name = $raw[0]; country = [string]$reverse.countryName; lat = $lat; lon = $lon }
}

# One IP source -> one candidate, or $null when the body is not the shape this
# source promises. Coordinates are optional: myip.ipip.net answers with an
# address only, and its city name is geocoded later.
function Convert-IpSource([string]$key, $json) {
  if (-not $json) { return $null }
  if ($key -eq 'ipinfo') {
    $name = [string]$json.city
    if (-not $name) { $name = [string]$json.region }
    if (-not $name) { return $null }
    $lat = $null
    $lon = $null
    $parts = ([string]$json.loc).Split(',')
    if ($parts.Count -eq 2) {
      try { $lat = [double]$parts[0]; $lon = [double]$parts[1] } catch { $lat = $null; $lon = $null }
    }
    return [pscustomobject]@{ name = $name; region = [string]$json.region; country = [string]$json.country; lat = $lat; lon = $lon; timezone = [string]$json.timezone; source = $key }
  }
  if ($key -eq 'ipip') {
    $location = @($json.data.location)
    if ($json.ret -ne 'ok' -or $location.Count -lt 2) { return $null }
    $name = ''
    if ($location.Count -ge 3) { $name = [string]$location[2] }
    if (-not $name) { $name = [string]$location[1] }
    if (-not $name) { return $null }
    $country = [string]$location[0]
    $timezone = ''
    if ($country -eq '中国') { $timezone = 'Asia/Shanghai' }
    return [pscustomobject]@{ name = $name; region = [string]$location[1]; country = $country; lat = $null; lon = $null; timezone = $timezone; source = $key }
  }
  if ($key -eq 'ipapi') {
    $name = [string]$json.city
    if (-not $name) { $name = [string]$json.region }
    if (-not $name) { return $null }
    $lat = $null
    $lon = $null
    try { $lat = [double]$json.latitude; $lon = [double]$json.longitude } catch { $lat = $null; $lon = $null }
    return [pscustomobject]@{ name = $name; region = [string]$json.region; country = [string]$json.country_name; lat = $lat; lon = $lon; timezone = [string]$json.timezone; source = $key }
  }
  return $null
}

# Asia/Shanghai first, then the most specific name. A city (2) beats a region
# (1); coordinates break the tie toward the source that can serve the forecast
# without a second geocoding round.
function Measure-Candidate($candidate) {
  $score = 0
  if ($candidate.timezone -eq 'Asia/Shanghai') { $score += 4 }
  if ($candidate.name) { $score += 2 } elseif ($candidate.region) { $score += 1 }
  if ($null -ne $candidate.lat -and $null -ne $candidate.lon) { $score += 1 }
  return $score
}

# The IP fallback chain. Stops early once a candidate cannot be beaten: an
# Asia/Shanghai city is the best any later source could offer.
function Get-IpPlace {
  $sources = @(
    @{ key = 'ipinfo'; url = 'https://ipinfo.io/json' },
    @{ key = 'ipip'; url = 'https://myip.ipip.net/json' },
    @{ key = 'ipapi'; url = 'https://ipapi.co/json/' }
  )
  $best = $null
  $bestScore = -1
  foreach ($source in $sources) {
    $json = Get-Json $source.url 6
    if (-not $json) { Write-Step ($source.key + ': failed (body is not JSON)'); continue }
    $candidate = Convert-IpSource $source.key $json
    if (-not $candidate) { Write-Step ($source.key + ': failed (no usable place)'); continue }
    $score = Measure-Candidate $candidate
    Write-Step ($source.key + ': ok ' + $candidate.name + ' tz=' + $candidate.timezone + ' score=' + $score)
    if ($score -gt $bestScore) { $best = $candidate; $bestScore = $score }
    if ($bestScore -ge 6) { break }
  }
  if (-not $best) { return $null }
  # myip.ipip.net hands back an address, not coordinates; geocoding the name
  # both completes the place and gives the page its Chinese label.
  if ($null -eq $best.lat -or $null -eq $best.lon) {
    $geo = Resolve-GeocodedName $best.name 0 0 0
    if (-not $geo) { Write-Step ($best.source + ': no coordinates for ' + $best.name); return $null }
    return [pscustomobject]@{ name = $geo.name; country = $geo.country; lat = $geo.lat; lon = $geo.lon; source = $best.source }
  }
  $geo = Resolve-GeocodedName $best.name $best.lat $best.lon 120
  if ($geo) {
    return [pscustomobject]@{ name = $geo.name; country = $geo.country; lat = $best.lat; lon = $best.lon; source = $best.source }
  }
  return [pscustomobject]@{ name = $best.name; country = $best.country; lat = $best.lat; lon = $best.lon; source = $best.source }
}

function Resolve-Place {
  $fix = Get-SystemFix
  if ($fix) {
    $named = Get-ReversePlace $fix.lat $fix.lon
    if ($named) {
      return [pscustomobject]@{ name = $named.name; country = $named.country; lat = $fix.lat; lon = $fix.lon; source = 'system' }
    }
    return [pscustomobject]@{ name = ''; country = ''; lat = $fix.lat; lon = $fix.lon; source = 'system' }
  }
  $ip = Get-IpPlace
  if ($ip) { return $ip }
  return $null
}

$place = $null

if ($AutoLocate) {
  $place = Resolve-Place
  if (-not $place) { Write-Output 'null'; exit 0 }
  Write-Step ('place: ' + $place.name + ' ' + [math]::Round([double]$place.lat, 5) + ',' + [math]::Round([double]$place.lon, 5) + ' via ' + $place.source)
} elseif ($PSBoundParameters.ContainsKey('Lat') -and $PSBoundParameters.ContainsKey('Lon')) {
  $place = [pscustomobject]@{ name = (Read-B64 $NameB64); country = (Read-B64 $CountryB64); lat = $Lat; lon = $Lon; source = 'given' }
} else {
  if (-not $CityB64) { Write-Output 'null'; exit 0 }
  $city = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($CityB64))
  $escaped = [uri]::EscapeDataString($city)
  $geoUri = "https://geocoding-api.open-meteo.com/v1/search?name=$escaped&count=1&language=zh&format=json"
  $geo = Invoke-WithRetry -Label 'geocode' -Uri $geoUri
  if (-not $geo.results -or $geo.results.Count -eq 0) { Write-Output 'null'; exit 0 }
  $hit = $geo.results[0]
  $place = [pscustomobject]@{ name = $hit.name; country = $hit.country; lat = $hit.latitude; lon = $hit.longitude }
}

$forecast = "https://api.open-meteo.com/v1/forecast?latitude=$($place.lat)&longitude=$($place.lon)"
$forecast += "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m"
$forecast += "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset"
$forecast += "&hourly=temperature_2m,weather_code,precipitation_probability"
$forecast += "&timezone=auto&forecast_days=7&forecast_hours=13"

$data = Invoke-WithRetry -Label 'forecast' -Uri $forecast

[pscustomobject]@{
  place   = [pscustomobject]@{ name = $place.name; country = $place.country; lat = $place.lat; lon = $place.lon }
  source  = $place.source
  log     = @($steps)
  current = $data.current
  daily   = $data.daily
  hourly  = $data.hourly
} | ConvertTo-Json -Depth 8 -Compress
