[CmdletBinding()]
param(
  [string]$WorkbenchRoot = "",
  [switch]$NoOpen,
  [switch]$Json
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..\..")).Path

function Get-WorkbenchCandidates {
  $candidates = [System.Collections.Generic.List[string]]::new()

  if ($WorkbenchRoot) {
    $candidates.Add($WorkbenchRoot)
  }
  if ($env:PROJECT_ATLAS_WORKBENCH) {
    $candidates.Add($env:PROJECT_ATLAS_WORKBENCH)
  }
  if ($env:DSH_HOME) {
    $candidates.Add((Join-Path $env:DSH_HOME "skills\project-atlas-guardian\workbench"))
  }
  if ($env:USERPROFILE) {
    $candidates.Add((Join-Path $env:USERPROFILE ".dsh\skills\project-atlas-guardian\workbench"))
    $candidates.Add((Join-Path $env:USERPROFILE ".agents\skills\project-atlas-guardian\workbench"))
    $candidates.Add((Join-Path $env:USERPROFILE ".config\agents\skills\project-atlas-guardian\workbench"))
    $candidates.Add((Join-Path $env:USERPROFILE ".claude\skills\project-atlas-guardian\workbench"))
    $candidates.Add((Join-Path $env:USERPROFILE ".codex\skills\project-atlas-guardian\workbench"))
  }

  $candidates | Select-Object -Unique
}

$checkScript = $null
$matchedWorkbench = $null
foreach ($candidate in Get-WorkbenchCandidates) {
  $resolvedCandidate = [System.IO.Path]::GetFullPath($candidate)
  $candidateCheck = Join-Path $resolvedCandidate "scripts\check-workbench-entry.mjs"
  if (Test-Path -LiteralPath $candidateCheck -PathType Leaf) {
    $matchedWorkbench = $resolvedCandidate
    $checkScript = $candidateCheck
    break
  }
}

if (-not $checkScript) {
  throw "没有找到已安装的新版项目工作台。请先运行全局 Rulesync 同步，或用 -WorkbenchRoot 指向包含 scripts\check-workbench-entry.mjs 的 workbench 目录。"
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  throw "没有找到 Node.js 18 或更新版本。新版工作台需要 Node.js 才能读取当前项目。"
}

$rawOutput = & $nodeCommand.Source $checkScript --root $projectRoot --require-atlas --json
if ($LASTEXITCODE -ne 0) {
  throw ($rawOutput -join [Environment]::NewLine)
}

$jsonText = $rawOutput -join [Environment]::NewLine
$result = $jsonText | ConvertFrom-Json
if (-not $result.ok -or -not $result.url.StartsWith("http://127.0.0.1:")) {
  throw "工作台入口校验没有返回有效的本机 HTTP 地址。"
}

if ($Json) {
  $jsonText
} else {
  "EmojiTot 实时工作台"
  "$($result.coverage.pages) 个页面 / $($result.coverage.features) 个功能 / $($result.coverage.dependencies) 项依赖"
  "地址：$($result.url)"
  "工作台目录：$matchedWorkbench"
  "项目基准：$($result.atlasPath)"
}

if (-not $NoOpen -and -not $Json) {
  Start-Process -FilePath $result.url
}
