#requires -Version 7.0

param(
  [string]$RunDir = '',

  [string]$TaskPath = '',

  [string]$RepoRoot = '',

  [int]$Tail = 12
)

$ErrorActionPreference = 'Stop'

function Read-JsonFile([string]$PathValue) {
  if (-not (Test-Path -LiteralPath $PathValue -PathType Leaf)) {
    return $null
  }
  return Get-Content -Raw -Encoding UTF8 -LiteralPath $PathValue | ConvertFrom-Json
}

function Resolve-ExistingPath([string]$PathValue, [string]$BasePath) {
  if ([System.IO.Path]::IsPathRooted($PathValue)) {
    return (Resolve-Path -LiteralPath $PathValue).ProviderPath
  }
  return (Resolve-Path -LiteralPath (Join-Path $BasePath $PathValue)).ProviderPath
}

function Shorten([string]$Text, [int]$Max = 160) {
  if ([string]::IsNullOrWhiteSpace($Text)) {
    return ''
  }
  $oneLine = ($Text -replace '\s+', ' ').Trim()
  if ($oneLine.Length -le $Max) {
    return $oneLine
  }
  return $oneLine.Substring(0, $Max) + '...'
}

function Event-Summary($Event) {
  $type = ''
  if ($Event.PSObject.Properties.Name -contains 'type') {
    $type = [string]$Event.type
  } elseif (($Event.PSObject.Properties.Name -contains 'event') -and $Event.event -and ($Event.event.PSObject.Properties.Name -contains 'type')) {
    $type = [string]$Event.event.type
  }
  if ([string]::IsNullOrWhiteSpace($type)) {
    $type = 'event'
  }

  $text = ''
  if (($Event.PSObject.Properties.Name -contains 'properties') -and $Event.properties) {
    $props = $Event.properties
    if (($props.PSObject.Properties.Name -contains 'part') -and $props.part -and ($props.part.PSObject.Properties.Name -contains 'text')) {
      $text = [string]$props.part.text
    } elseif ($props.PSObject.Properties.Name -contains 'message') {
      $text = [string]$props.message
    } elseif ($props.PSObject.Properties.Name -contains 'error') {
      $text = [string]$props.error
    } elseif ($props.PSObject.Properties.Name -contains 'file') {
      $text = [string]$props.file
    }
  } elseif (($Event.PSObject.Properties.Name -contains 'text')) {
    $text = [string]$Event.text
  } elseif (($Event.PSObject.Properties.Name -contains 'message')) {
    $text = [string]$Event.message
  }

  if ([string]::IsNullOrWhiteSpace($text)) {
    return $type
  }
  return "$type - $(Shorten $text)"
}

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = (Get-Location).ProviderPath
}
$repoRootFull = (Resolve-Path -LiteralPath $RepoRoot).ProviderPath

if ([string]::IsNullOrWhiteSpace($RunDir)) {
  if ([string]::IsNullOrWhiteSpace($TaskPath)) {
    throw 'Provide -RunDir or -TaskPath.'
  }

  $taskFull = Resolve-ExistingPath $TaskPath $repoRootFull
  $runRoot = Join-Path $repoRootFull 'tmp/local-agent-runs'
  if (-not (Test-Path -LiteralPath $runRoot -PathType Container)) {
    throw "No OpenCode run directory exists: $runRoot"
  }

  $matches = @()
  Get-ChildItem -LiteralPath $runRoot -Recurse -Filter metadata.json -File | ForEach-Object {
    try {
      $meta = Read-JsonFile $_.FullName
      if ($meta -and $meta.taskPath -eq $taskFull) {
        $matches += [pscustomobject]@{
          Metadata = $meta
          Path = (Split-Path -Parent $_.FullName)
          StartedAt = [datetime]$meta.startedAt
        }
      }
    } catch {
      # Ignore malformed runtime metadata.
    }
  }

  if ($matches.Count -eq 0) {
    throw "No OpenCode run found for task: $taskFull"
  }

  $RunDir = ($matches | Sort-Object StartedAt -Descending | Select-Object -First 1).Path
}

$runDirFull = (Resolve-Path -LiteralPath $RunDir).ProviderPath
$metadata = Read-JsonFile (Join-Path $runDirFull 'metadata.json')
$status = Read-JsonFile (Join-Path $runDirFull 'status.json')
$eventsPath = Join-Path $runDirFull 'opencode-events.ndjson'
$stderrPath = Join-Path $runDirFull 'opencode-stderr.log'
$summaryPath = Join-Path $runDirFull 'opencode-summary.txt'

if ($null -eq $metadata) {
  throw "Missing metadata.json in $runDirFull"
}

$pidValue = $null
if ($status -and ($status.PSObject.Properties.Name -contains 'pid')) {
  $pidValue = [int]$status.pid
}

$processState = 'unknown'
if ($pidValue) {
  $processState = if (Get-Process -Id $pidValue -ErrorAction SilentlyContinue) { 'alive' } else { 'not-running' }
}

$reportState = 'not-found'
$taskDir = if ($metadata.taskPath) { Split-Path -Parent $metadata.taskPath } else { '' }
if ($taskDir -and (Test-Path -LiteralPath $taskDir -PathType Container)) {
  $report = Get-ChildItem -LiteralPath $taskDir -Filter '输出_*.md' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($report) {
    $reportState = "$($report.FullName) ($($report.Length) bytes, $($report.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')))"
  }
}

$eventSummaries = @()
if (Test-Path -LiteralPath $eventsPath -PathType Leaf) {
  Get-Content -LiteralPath $eventsPath -Encoding UTF8 -Tail $Tail | ForEach-Object {
    if ([string]::IsNullOrWhiteSpace($_)) {
      return
    }
    try {
      $eventSummaries += Event-Summary ($_ | ConvertFrom-Json)
    } catch {
      $eventSummaries += Shorten $_
    }
  }
}

$stderrTail = @()
if (Test-Path -LiteralPath $stderrPath -PathType Leaf) {
  $stderrTail = Get-Content -LiteralPath $stderrPath -Encoding UTF8 -Tail 5
}

Write-Output "Status: $($status.status)"
Write-Output "Mode: $($metadata.mode)"
Write-Output "Model: $($metadata.model)"
Write-Output "Variant: $($metadata.variant)"
Write-Output "Process: $processState"
Write-Output "RunDir: $runDirFull"
Write-Output "Output: $reportState"

if (Test-Path -LiteralPath $summaryPath -PathType Leaf) {
  Write-Output 'Summary:'
  Get-Content -LiteralPath $summaryPath -Encoding UTF8 -Tail 20 | ForEach-Object { Write-Output "- $(Shorten $_)" }
}

if ($eventSummaries.Count -gt 0) {
  Write-Output 'Recent events:'
  $eventSummaries | ForEach-Object { Write-Output "- $_" }
} else {
  if ($metadata.keepEvents) {
    Write-Output 'Recent events: no event file or no events yet'
  } else {
    Write-Output 'Recent events: raw event file is not kept by default'
  }
}

if ($stderrTail.Count -gt 0) {
  Write-Output 'Recent stderr:'
  $stderrTail | ForEach-Object { Write-Output "- $(Shorten $_)" }
}
