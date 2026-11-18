# Message apps: who is running, and how many unread messages the title admits.
#
# Windows gives no supported way to read the taskbar flash state, so this reads
# what the apps do publish: their window titles. WeChat and the enterprise apps
# prefix the unread count ("(3) 微信", "[5条] 飞书"); QQ NT does not, and is
# reported as "running" only. One JSON line per poll; the JS side diffs it.
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8

$apps = @(
  @{ id = 'wechat';   names = @('WeChat', 'Weixin');   label = '微信' },
  @{ id = 'qq';       names = @('QQ');                 label = 'QQ' },
  @{ id = 'wecom';    names = @('WXWork');             label = '企业微信' },
  @{ id = 'feishu';   names = @('Feishu', 'Lark');     label = '飞书' },
  @{ id = 'dingtalk'; names = @('DingTalk');           label = '钉钉' }
)

function Get-Unread([string]$title) {
  if ($title -match '^\s*\((\d+)\)') { return [int]$Matches[1] }
  if ($title -match '^\s*\[(\d+)\s*条') { return [int]$Matches[1] }
  if ($title -match '^\s*(\d+)\s*条') { return [int]$Matches[1] }
  return 0
}

while ($true) {
  $result = @()
  foreach ($app in $apps) {
    $procs = Get-Process -Name $app.names -ErrorAction SilentlyContinue
    if (-not $procs) { continue }
    $wins = @()
    foreach ($p in $procs) {
      if ($p.MainWindowHandle -ne 0) {
        $wins += [pscustomobject]@{
          pid    = $p.Id
          handle = $p.MainWindowHandle.ToInt64()
          title  = $p.MainWindowTitle
        }
      }
    }
    if ($wins.Count -eq 0) { continue }
    $unread = 0
    foreach ($win in $wins) {
      $n = Get-Unread $win.title
      if ($n -gt $unread) { $unread = $n }
    }
    $result += [pscustomobject]@{
      id     = $app.id
      label  = $app.label
      unread = $unread
      count  = $wins.Count
      handle = $wins[0].handle
      title  = $wins[0].title
    }
  }
  $payload = [pscustomobject]@{
    ts   = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    apps = $result
  }
  $payload | ConvertTo-Json -Compress -Depth 4
  Start-Sleep -Milliseconds 1800
}
