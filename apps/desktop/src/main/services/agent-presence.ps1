# EmojiTot agent presence watcher.
#
# Prints one JSON line every interval:
#   {"dsh":0,"claude":1,"codex":1}
#
# CommandLine is inspected only to identify the owning application. It is never
# printed, logged or persisted. Counts collapse to booleans in agent-presence.js.
param([int]$IntervalMs = 2000)

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$interval = [Math]::Max(1000, [Math]::Min(15000, $IntervalMs))

while ($true) {
  $out = [ordered]@{ dsh = 0; claude = 0; codex = 0 }
  $rows = Get-CimInstance Win32_Process -Filter "Name='electron.exe' OR Name='node.exe' OR Name='codex.exe' OR Name='claude.exe' OR Name='dsh.exe'"
  foreach ($p in @($rows)) {
    $name = [string]$p.Name
    $text = ([string]$p.CommandLine + ' ' + [string]$p.ExecutablePath)
    if ($text -match '(?i)(deepseek[- ]?harness|\\\.dsh\\|dsh-plugin|@deepseek-ai/dsh)') {
      $out.dsh += 1
    } elseif ($text -match '(?i)(@anthropic-ai/claude-code|\\claude\.exe(?:\s|$)|\\\.claude\\)') {
      $out.claude += 1
    } elseif ($name -ieq 'codex.exe' -or $text -match '(?i)(@openai/codex|\\codex\.exe(?:\s|$))') {
      $out.codex += 1
    }
  }
  Write-Output ($out | ConvertTo-Json -Compress)
  Start-Sleep -Milliseconds $interval
}
