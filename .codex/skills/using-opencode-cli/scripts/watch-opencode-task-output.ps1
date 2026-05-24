#requires -Version 7.0

param(
  [string]$SessionId = '',

  [string]$TaskPath = '',

  [string]$RunDir = '',

  [string]$RepoRoot = '',

  [int]$IntervalSeconds = 5,

  [int]$MaxUpdates = 0,

  [int]$WaitForSessionSeconds = 0,

  [switch]$OnlyOnChange,

  [int]$HeartbeatUpdates = 0,

  [switch]$StopWhenRunEnds,

  [switch]$StopWhenIdleSignal,

  [switch]$Once,

  [switch]$KeepExport,

  [switch]$VerboseText
)

$ErrorActionPreference = 'Stop'

if ($MaxUpdates -lt 0) {
  throw 'MaxUpdates must be 0 or greater.'
}

if ($IntervalSeconds -lt 1) {
  throw 'IntervalSeconds must be 1 or greater.'
}

if ($WaitForSessionSeconds -lt 0) {
  throw 'WaitForSessionSeconds must be 0 or greater.'
}

if ($HeartbeatUpdates -lt 0) {
  throw 'HeartbeatUpdates must be 0 or greater.'
}

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

function Shorten([string]$Text, [int]$Max = 500) {
  if ([string]::IsNullOrWhiteSpace($Text)) {
    return ''
  }
  $clean = $Text.Trim()
  if ($clean.Length -le $Max) {
    return $clean
  }
  return $clean.Substring($clean.Length - $Max)
}

function OneLine([string]$Text, [int]$Max = 500) {
  if ([string]::IsNullOrWhiteSpace($Text)) {
    return ''
  }
  $line = ($Text -replace '\s+', ' ').Trim()
  if ($line.Length -le $Max) {
    return $line
  }
  return $line.Substring(0, $Max) + '...'
}

function Get-LatestRunMetadata([string]$TaskFull, [string]$RootFull) {
  $runRoot = Join-Path $RootFull 'tmp/local-agent-runs'
  if (-not (Test-Path -LiteralPath $runRoot -PathType Container)) {
    return $null
  }

  $matches = @()
  Get-ChildItem -LiteralPath $runRoot -Recurse -Filter metadata.json -File | ForEach-Object {
    try {
      $meta = Read-JsonFile $_.FullName
      if ($meta -and $meta.taskPath -eq $TaskFull) {
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
    return $null
  }
  return ($matches | Sort-Object StartedAt -Descending | Select-Object -First 1)
}

function Find-SessionIdByTitle([string]$Title) {
  if ([string]::IsNullOrWhiteSpace($Title)) {
    return ''
  }

  $lines = & opencode session list
  foreach ($line in $lines) {
    $text = [string]$line
    if ($text -notmatch '^(ses_\S+)\s{2,}(.+?)\s{2,}\S') {
      continue
    }
    $id = $Matches[1]
    $foundTitle = $Matches[2].Trim()
    if ($foundTitle -eq $Title) {
      return $id
    }
  }
  return ''
}

function Get-TextParts($Message) {
  $items = New-Object System.Collections.Generic.List[string]
  if (-not $Message.parts) {
    return $items
  }

  foreach ($part in $Message.parts) {
    if (($part.PSObject.Properties.Name -contains 'type') -and $part.type -eq 'text' -and ($part.PSObject.Properties.Name -contains 'text')) {
      $items.Add([string]$part.text)
    }
  }
  return $items
}

function Get-LatestAssistantText($Export) {
  if (-not $Export.messages) {
    return ''
  }

  $latest = ''
  foreach ($message in $Export.messages) {
    if (-not $message.info -or $message.info.role -ne 'assistant') {
      continue
    }
    $texts = Get-TextParts $message
    if ($texts.Count -gt 0) {
      $latest = ($texts -join "`n")
    }
  }
  return $latest
}

function Get-MessageCounts($Export) {
  $counts = [ordered]@{
    user = 0
    assistant = 0
    tool = 0
    textParts = 0
    toolParts = 0
  }

  if (-not $Export.messages) {
    return $counts
  }

  foreach ($message in $Export.messages) {
    if ($message.info -and $counts.Contains($message.info.role)) {
      $counts[$message.info.role] += 1
    }
    if ($message.parts) {
      foreach ($part in $message.parts) {
        if ($part.type -eq 'text') {
          $counts.textParts += 1
        } elseif ($part.type -eq 'tool') {
          $counts.toolParts += 1
        }
      }
    }
  }
  return $counts
}

function Get-LatestToolSummary($Export) {
  if (-not $Export.messages) {
    return ''
  }

  $latest = ''
  foreach ($message in $Export.messages) {
    if (-not $message.parts) {
      continue
    }
    foreach ($part in $message.parts) {
      if ($part.type -ne 'tool') {
        continue
      }
      $tool = ''
      if ($part.PSObject.Properties.Name -contains 'tool') {
        $tool = [string]$part.tool
      } elseif ($part.PSObject.Properties.Name -contains 'call') {
        $tool = [string]$part.call
      }
      if ([string]::IsNullOrWhiteSpace($tool)) {
        $tool = 'tool'
      }
      $title = ''
      if ($part.PSObject.Properties.Name -contains 'title') {
        $title = [string]$part.title
      }
      $latest = OneLine "$tool $title" 160
    }
  }
  return $latest
}

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = (Get-Location).ProviderPath
}
$repoRootFull = (Resolve-Path -LiteralPath $RepoRoot).ProviderPath

$runDirFull = ''
$metadata = $null

if (-not [string]::IsNullOrWhiteSpace($RunDir)) {
  $runDirFull = (Resolve-Path -LiteralPath $RunDir).ProviderPath
  $metadata = Read-JsonFile (Join-Path $runDirFull 'metadata.json')
} elseif (-not [string]::IsNullOrWhiteSpace($TaskPath)) {
  $taskFull = Resolve-ExistingPath $TaskPath $repoRootFull
  $latestRun = Get-LatestRunMetadata $taskFull $repoRootFull
  if ($latestRun) {
    $runDirFull = $latestRun.Path
    $metadata = $latestRun.Metadata
  }
}

function Resolve-SessionIdFromMetadata($MetadataValue) {
  if ($MetadataValue -and -not [string]::IsNullOrWhiteSpace($MetadataValue.sessionId)) {
    return [string]$MetadataValue.sessionId
  }
  if ($MetadataValue -and -not [string]::IsNullOrWhiteSpace($MetadataValue.title)) {
    return Find-SessionIdByTitle ([string]$MetadataValue.title)
  }
  return ''
}

if ([string]::IsNullOrWhiteSpace($SessionId)) {
  $waitStart = Get-Date
  $hasPrintedWait = $false
  do {
    $SessionId = Resolve-SessionIdFromMetadata $metadata
    if (-not [string]::IsNullOrWhiteSpace($SessionId)) {
      break
    }

    $elapsed = ((Get-Date) - $waitStart).TotalSeconds
    if ($WaitForSessionSeconds -le 0 -or $elapsed -ge $WaitForSessionSeconds) {
      break
    }

    if (-not $hasPrintedWait) {
      Write-Output 'Waiting for OpenCode session...'
      $hasPrintedWait = $true
    }
    Start-Sleep -Seconds ([Math]::Min(2, [Math]::Max(1, $WaitForSessionSeconds - [int]$elapsed)))
  } while ($true)
}

if ([string]::IsNullOrWhiteSpace($SessionId)) {
  throw 'Could not resolve OpenCode session id. Provide -SessionId or use a task with matching runtime metadata.'
}

$exportPath = if ($KeepExport -and -not [string]::IsNullOrWhiteSpace($runDirFull)) {
  Join-Path $runDirFull 'opencode-export.json'
} else {
  Join-Path ([System.IO.Path]::GetTempPath()) ("opencode-export-$SessionId.json")
}
$lastText = $null
$lastFingerprint = ''
$updateCount = 0

do {
  $runStatus = ''
  $runEnded = $false
  $hookSignalType = ''
  $hookSignalEnded = $false
  if ($StopWhenRunEnds -and -not [string]::IsNullOrWhiteSpace($runDirFull)) {
    $status = Read-JsonFile (Join-Path $runDirFull 'status.json')
    if ($status -and ($status.PSObject.Properties.Name -contains 'status')) {
      $runStatus = [string]$status.status
      $runEnded = $runStatus -in @('completed', 'failed')
    }
  }
  if ($StopWhenIdleSignal -and -not [string]::IsNullOrWhiteSpace($runDirFull)) {
    $hookStatus = Read-JsonFile (Join-Path $runDirFull 'opencode-hook-status.json')
    if ($hookStatus -and ($hookStatus.PSObject.Properties.Name -contains 'type')) {
      $hookSignalType = [string]$hookStatus.type
      $hookSignalEnded = $hookSignalType -in @('session.idle', 'session.error')
    }
  }

  & opencode export $SessionId 2>$null | Set-Content -LiteralPath $exportPath -Encoding UTF8
  $export = Read-JsonFile $exportPath
  $info = $export.info
  $text = Get-LatestAssistantText $export
  $counts = Get-MessageCounts $export
  $toolSummary = Get-LatestToolSummary $export
  $modelSummary = ''
  $tokenSummary = ''
  if ($info -and $info.model) {
    $modelSummary = "$($info.model.providerID)/$($info.model.id) $($info.model.variant)"
  }
  if ($info -and $info.tokens) {
    $tokenSummary = "input=$($info.tokens.input) output=$($info.tokens.output) reasoning=$($info.tokens.reasoning) cacheRead=$($info.tokens.cache.read)"
  }
  $messageSummary = "user=$($counts.user) assistant=$($counts.assistant) textParts=$($counts.textParts) toolParts=$($counts.toolParts)"

  if (-not $KeepExport -and (Test-Path -LiteralPath $exportPath -PathType Leaf)) {
    Remove-Item -LiteralPath $exportPath -Force
  }

  $updateCount += 1
  $fingerprint = @(
    if ($info) { [string]$info.title } else { '' }
    $modelSummary
    $tokenSummary
    $messageSummary
    $toolSummary
    $runStatus
    $hookSignalType
    $text
  ) -join "`u{001f}"
  $isHeartbeat = $HeartbeatUpdates -gt 0 -and (($updateCount - 1) % $HeartbeatUpdates -eq 0)
  $shouldPrint = (-not $OnlyOnChange) -or $updateCount -eq 1 -or $fingerprint -ne $lastFingerprint -or $isHeartbeat

  if ($shouldPrint) {
    Write-Output '----------------------------------------'
    if ($MaxUpdates -gt 0) {
      Write-Output "Update: $updateCount/$MaxUpdates"
    } else {
      Write-Output "Update: $updateCount"
    }
    Write-Output "Session: $SessionId"
    if (-not [string]::IsNullOrWhiteSpace($runStatus)) {
      Write-Output "Run status: $runStatus"
    }
    if (-not [string]::IsNullOrWhiteSpace($hookSignalType)) {
      Write-Output "Hook signal: $hookSignalType"
    }
    if ($info) {
      Write-Output "Title: $($info.title)"
      if ($info.model) {
        Write-Output "Model: $($info.model.providerID)/$($info.model.id)"
        Write-Output "Variant: $($info.model.variant)"
      }
      if ($info.tokens) {
        Write-Output "Tokens: $tokenSummary"
      }
    }
    Write-Output "Messages: $messageSummary"
    if (-not [string]::IsNullOrWhiteSpace($toolSummary)) {
      Write-Output "Latest tool: $toolSummary"
    }
    if ($KeepExport) {
      Write-Output "Export: $exportPath"
    } else {
      Write-Output 'Export: temporary only, deleted after reading'
    }
    Write-Output ''

    if ([string]::IsNullOrWhiteSpace($text)) {
      Write-Output 'No assistant text yet.'
    } else {
      if ($text -ne $lastText) {
        $lastText = $text
      }
      if ($VerboseText) {
        Write-Output (Shorten $text 4000)
      } else {
        Write-Output "Latest answer summary: $(OneLine $text 700)"
      }
    }
  }

  $lastFingerprint = $fingerprint

  if ($StopWhenRunEnds -and $runEnded) {
    break
  }

  if ($StopWhenIdleSignal -and $hookSignalEnded -and ($hookSignalType -eq 'session.error' -or -not [string]::IsNullOrWhiteSpace($text))) {
    break
  }

  if ($Once -or ($MaxUpdates -gt 0 -and $updateCount -ge $MaxUpdates)) {
    break
  }

  Start-Sleep -Seconds $IntervalSeconds
} while ($true)
