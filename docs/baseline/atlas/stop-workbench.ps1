<#
  停止本项目的工作台服务。
  只结束后台 node 进程里 CommandLine 同时包含 serve-workbench.mjs 和本项目根目录的那一个。
  不会动其他项目的工作台，也不会结束 EmojiTot 应用本身。
#>
[CmdletBinding()]
param(
  [switch]$ListOnly
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..\..")).Path
$processes = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine -like "*serve-workbench.mjs*" -and $_.CommandLine -like "*$projectRoot*" }

if (-not $processes) {
  "没有找到本项目的工作台服务：$projectRoot"
  exit 0
}

foreach ($process in $processes) {
  if ($ListOnly) {
    "PID $($process.ProcessId)  $($process.CommandLine)"
  } else {
    Stop-Process -Id $process.ProcessId -Force
    "已停止 PID $($process.ProcessId)"
  }
}
