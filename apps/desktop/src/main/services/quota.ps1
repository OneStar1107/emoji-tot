# Balance for one AI account, normalised across providers.
#
# The key arrives through an environment variable, never as an argument: argv is
# visible to every process on the machine, environment variables are not. Each
# provider answers in its own shape; this script is the only place that knows
# them, and everything downstream sees {provider, currency, total, granted,
# topped, available}.
param([string]$KeyVar = 'EMOJITOT_QUOTA_KEY', [string]$Provider = 'deepseek')

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$key = [Environment]::GetEnvironmentVariable($KeyVar)
if (-not $key) { Write-Output 'null'; exit 0 }

$headers = @{ Authorization = "Bearer $key"; Accept = 'application/json' }

function Emit([string]$currency, [string]$total, [string]$granted, [string]$topped, [bool]$available) {
  [pscustomobject]@{
    provider  = $Provider
    currency  = $currency
    total     = $total
    granted   = $granted
    topped    = $topped
    available = $available
  } | ConvertTo-Json -Compress
}

try {
  switch ($Provider) {
    'deepseek' {
      $r = Invoke-RestMethod -Uri 'https://api.deepseek.com/user/balance' -Headers $headers -TimeoutSec 12
      $info = @($r.balance_infos)[0]
      if (-not $info) { Write-Output 'null'; exit 0 }
      Emit ([string]$info.currency) ([string]$info.total_balance) ([string]$info.granted_balance) ([string]$info.topped_up_balance) ([bool]$r.is_available)
    }
    'moonshot' {
      $r = Invoke-RestMethod -Uri 'https://api.moonshot.cn/v1/users/me/balance' -Headers $headers -TimeoutSec 12
      $data = $r.data
      if (-not $data) { Write-Output 'null'; exit 0 }
      Emit 'CNY' ([string]$data.available_balance) ([string]$data.voucher_balance) ([string]$data.cash_balance) $true
    }
    'siliconflow' {
      $r = Invoke-RestMethod -Uri 'https://api.siliconflow.cn/v1/user/info' -Headers $headers -TimeoutSec 12
      $data = $r.data
      if (-not $data) { Write-Output 'null'; exit 0 }
      Emit 'CNY' ([string]$data.balance) '0.00' ([string]$data.charge_balance) $true
    }
    'openrouter' {
      $r = Invoke-RestMethod -Uri 'https://openrouter.ai/api/v1/credits' -Headers $headers -TimeoutSec 12
      $data = $r.data
      if (-not $data) { Write-Output 'null'; exit 0 }
      $total = [double]$data.total_credits - [double]$data.total_usage
      Emit 'USD' ('{0:F2}' -f $total) '0.00' ('{0:F2}' -f [double]$data.total_credits) $true
    }
    default {
      Write-Output 'null'
    }
  }
} catch {
  Write-Output 'null'
}
