# DeepSeek balance for one account.
#
# The key arrives through an environment variable, never as an argument: argv is
# visible to every process on the machine, environment variables are not.
param([string]$KeyVar = 'EMOJITOT_DEEPSEEK_KEY')

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$key = [Environment]::GetEnvironmentVariable($KeyVar)
if (-not $key) { Write-Output 'null'; exit 0 }

try {
  $r = Invoke-RestMethod -Uri 'https://api.deepseek.com/user/balance' -Headers @{ Authorization = "Bearer $key" } -TimeoutSec 12
  $r | ConvertTo-Json -Depth 5 -Compress
} catch {
  Write-Output 'null'
}
