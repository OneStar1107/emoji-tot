# Fetch one calendar subscription URL and print the body.
#
# Electron's own fetch shares Chromium's network stack, which times out behind
# this machine's proxy setup for plain HTTP(S) calls. A child PowerShell process
# uses the system stack and works, so the calendar follows weather and mail.
param([string]$Url)

[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

if (-not $Url) { Write-Output 'ERROR:empty-url'; exit 0 }

try {
  $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 25
  $text = [string]$response.Content
  # A calendar is text; a runaway feed should not be handed to the parser whole.
  if ($text.Length -gt 2000000) { $text = $text.Substring(0, 2000000) }
  Write-Output $text
} catch {
  Write-Output ('ERROR:' + $_.Exception.Message)
}
