#requires -Version 7.0

param(
  [string]$TaskPath = '',

  [string]$Prompt = '',

  [string]$RepoRoot = '',

  [ValidateSet('observe', 'managed')]
  [string]$Mode = 'observe',

  [string]$Model = 'deepseek/deepseek-v4-pro',

  [string]$RunSlug = '',

  [string]$SessionId = '',

  [switch]$ContinueMostRecent,

  [switch]$ForkSession,

  [string]$Title = '',

  [string]$Agent = '',

  [string]$Variant = 'max',

  [switch]$DryRun,

  [switch]$KeepEvents,

  [switch]$NoWatch,

  [switch]$WatchAllUpdates,

  [int]$WatchIntervalSeconds = 60,

  [int]$WatchMaxUpdates = 30,

  [int]$WatchWaitSeconds = 120,

  [switch]$ChildObserve,

  [switch]$ChildManaged
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($Prompt) -and -not [string]::IsNullOrWhiteSpace($env:CODEX_OPENCODE_PROMPT_B64)) {
  $Prompt = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:CODEX_OPENCODE_PROMPT_B64))
}

if ($ContinueMostRecent -and -not [string]::IsNullOrWhiteSpace($SessionId)) {
  throw 'Use either -SessionId or -ContinueMostRecent, not both.'
}

if ($ForkSession -and -not $ContinueMostRecent -and [string]::IsNullOrWhiteSpace($SessionId)) {
  throw 'Use -ForkSession only with -SessionId or -ContinueMostRecent.'
}

if ($ChildObserve -and $ChildManaged) {
  throw 'Use only one child mode.'
}

if ([string]::IsNullOrWhiteSpace($TaskPath) -and [string]::IsNullOrWhiteSpace($Prompt)) {
  throw 'Provide either -TaskPath or -Prompt.'
}

if (-not [string]::IsNullOrWhiteSpace($TaskPath) -and -not [string]::IsNullOrWhiteSpace($Prompt)) {
  throw 'Use either -TaskPath or -Prompt, not both.'
}

if ($WatchIntervalSeconds -lt 1) {
  throw 'WatchIntervalSeconds must be 1 or greater.'
}

if ($WatchMaxUpdates -lt 0) {
  throw 'WatchMaxUpdates must be 0 or greater. Use -NoWatch to disable foreground monitoring.'
}

if ($WatchWaitSeconds -lt 0) {
  throw 'WatchWaitSeconds must be 0 or greater.'
}

function Resolve-ExistingPath([string]$PathValue, [string]$BasePath) {
  if ([System.IO.Path]::IsPathRooted($PathValue)) {
    return (Resolve-Path -LiteralPath $PathValue).ProviderPath
  }
  return (Resolve-Path -LiteralPath (Join-Path $BasePath $PathValue)).ProviderPath
}

function New-RunSlug([string]$PathValue) {
  $name = [System.IO.Path]::GetFileNameWithoutExtension($PathValue)
  $clean = ($name -replace '[^A-Za-z0-9_-]+', '_').Trim('_')
  if ([string]::IsNullOrWhiteSpace($clean)) {
    $clean = 'opencode-task'
  }
  if ($clean.Length -gt 48) {
    $clean = $clean.Substring(0, 48)
  }

  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($PathValue)
  $hash = ([System.BitConverter]::ToString($sha.ComputeHash($bytes)) -replace '-', '').Substring(0, 8).ToLowerInvariant()
  return "$(Get-Date -Format 'yyyy-MM-dd_HHmmss_fff')_${PID}_${clean}_$hash"
}

function New-RunSlugFromLabel([string]$Label, [string]$Seed) {
  $clean = ($Label -replace '[^A-Za-z0-9_-]+', '_').Trim('_')
  if ([string]::IsNullOrWhiteSpace($clean)) {
    $clean = 'opencode-direct'
  }
  if ($clean.Length -gt 48) {
    $clean = $clean.Substring(0, 48)
  }

  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Seed)
  $hash = ([System.BitConverter]::ToString($sha.ComputeHash($bytes)) -replace '-', '').Substring(0, 8).ToLowerInvariant()
  return "$(Get-Date -Format 'yyyy-MM-dd_HHmmss_fff')_${PID}_${clean}_$hash"
}

function Get-ShortHash([string]$Text) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
  return ([System.BitConverter]::ToString($sha.ComputeHash($bytes)) -replace '-', '').Substring(0, 12).ToLowerInvariant()
}

function Write-JsonFile([string]$PathValue, [object]$Value) {
  $Value | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $PathValue -Encoding UTF8
}

function Quote-Arg([string]$Value) {
  if ($null -eq $Value) {
    return '""'
  }
  $escaped = $Value -replace '"', '\"'
  if ($escaped -match '[\s"]') {
    return '"' + $escaped + '"'
  }
  return $escaped
}

function Join-CommandLine([string[]]$ArgsValue) {
  return (($ArgsValue | ForEach-Object { Quote-Arg $_ }) -join ' ')
}

function Get-PwshPath {
  $pwsh = Get-Command pwsh.exe -ErrorAction SilentlyContinue
  if ($null -eq $pwsh) {
    throw 'PowerShell 7 pwsh.exe was not found.'
  }
  return $pwsh.Source
}

function New-OpenCodeArgs([bool]$Managed) {
  if ($Managed) {
    $args = @(
      'run',
      '--model', $Model,
      '--format', 'json',
      '--dir', $repoRootFull
    )
  } else {
    $args = @(
      'run',
      '--model', $Model,
      '--dir', $repoRootFull,
      '--interactive'
    )
  }

  if (-not [string]::IsNullOrWhiteSpace($Title)) {
    $args += @('--title', $Title)
  }

  $args += @('--variant', $Variant)

  if (-not [string]::IsNullOrWhiteSpace($Agent)) {
    $args += @('--agent', $Agent)
  }

  if (-not [string]::IsNullOrWhiteSpace($SessionId)) {
    $args += @('--session', $SessionId)
  } elseif ($ContinueMostRecent) {
    $args += '--continue'
  }

  if ($ForkSession) {
    $args += '--fork'
  }

  if ($Managed) {
    return $args
  }

  $args += $opencodePrompt

  return $args
}

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = (Get-Location).ProviderPath
}

$repoRootFull = (Resolve-Path -LiteralPath $RepoRoot).ProviderPath
if (-not (Test-Path -LiteralPath $repoRootFull -PathType Container)) {
  throw "RepoRoot does not exist: $repoRootFull"
}

$isDirectPrompt = [string]::IsNullOrWhiteSpace($TaskPath)
$taskFull = if ($isDirectPrompt) { '' } else { Resolve-ExistingPath $TaskPath $repoRootFull }

if ([string]::IsNullOrWhiteSpace($RunSlug)) {
  if ($isDirectPrompt) {
    $slugLabel = if ([string]::IsNullOrWhiteSpace($Title)) { 'direct-prompt' } else { $Title }
    $RunSlug = New-RunSlugFromLabel $slugLabel $Prompt
  } else {
    $RunSlug = New-RunSlug $taskFull
  }
}

$runRoot = Join-Path $repoRootFull 'tmp/local-agent-runs'
$runDir = Join-Path $runRoot $RunSlug
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

$metadataPath = Join-Path $runDir 'metadata.json'
$statusPath = Join-Path $runDir 'status.json'
$eventsPath = Join-Path $runDir 'opencode-events.ndjson'
$stderrPath = Join-Path $runDir 'opencode-stderr.log'
$summaryPath = Join-Path $runDir 'opencode-summary.txt'

if ([string]::IsNullOrWhiteSpace($Title)) {
  $titleBase = if ($isDirectPrompt) { 'direct-prompt' } else { [System.IO.Path]::GetFileNameWithoutExtension($taskFull) }
  if ([string]::IsNullOrWhiteSpace($SessionId) -and -not $ContinueMostRecent) {
    $Title = "$titleBase $(Get-Date -Format 'HHmmss')"
  } else {
    $Title = $titleBase
  }
}

$opencodePrompt = if ($isDirectPrompt) {
  $Prompt
} else {
  Get-Content -Raw -Encoding UTF8 -LiteralPath $taskFull
}

if ([string]::IsNullOrWhiteSpace($opencodePrompt)) {
  throw 'OpenCode prompt is empty.'
}

$managedArgs = New-OpenCodeArgs $true
$observeArgs = New-OpenCodeArgs $false
$managedArgsForMetadata = $managedArgs + @('[prompt via stdin omitted]')
$observeArgsForMetadata = $observeArgs[0..($observeArgs.Count - 2)] + @('[prompt omitted]')

$metadata = [ordered]@{
  promptSource = if ($isDirectPrompt) { 'direct' } else { 'task-file' }
  taskPath = $taskFull
  promptPreview = if ($isDirectPrompt) { '[direct prompt omitted]' } else { '' }
  promptHash = if ($isDirectPrompt) { Get-ShortHash $Prompt } else { '' }
  repoRoot = $repoRootFull
  mode = $Mode
  model = $Model
  title = $Title
  sessionId = $SessionId
  continueMostRecent = [bool]$ContinueMostRecent
  forkSession = [bool]$ForkSession
  agent = $Agent
  variant = $Variant
  runDir = $runDir
  eventsPath = $eventsPath
  stderrPath = $stderrPath
  summaryPath = $summaryPath
  keepEvents = [bool]$KeepEvents
  noWatch = [bool]$NoWatch
  watchAllUpdates = [bool]$WatchAllUpdates
  watchIntervalSeconds = $WatchIntervalSeconds
  watchMaxUpdates = $WatchMaxUpdates
  watchWaitSeconds = $WatchWaitSeconds
  startedAt = (Get-Date).ToString('o')
  command = if ($Mode -eq 'managed') { 'opencode ' + (Join-CommandLine $managedArgsForMetadata) } else { 'opencode ' + (Join-CommandLine $observeArgsForMetadata) }
}
Write-JsonFile $metadataPath $metadata

if ($DryRun) {
  Write-JsonFile $statusPath ([ordered]@{
    status = 'dry-run'
    mode = $Mode
    pid = $PID
    runDir = $runDir
    updatedAt = (Get-Date).ToString('o')
  })
  Write-Output "DRY_RUN RunDir=$runDir"
  Write-Output $metadata.command
  exit 0
}

if ($ChildManaged) {
  Set-Location -LiteralPath $repoRootFull
  $env:CODEX_OPENCODE_SIGNAL_DIR = $runDir
  Write-JsonFile $statusPath ([ordered]@{
    status = 'running'
    mode = 'managed'
    pid = $PID
    runDir = $runDir
    updatedAt = (Get-Date).ToString('o')
  })

  $opencodePrompt | & opencode @managedArgs 1>> $eventsPath 2>> $stderrPath
  $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }

  if (Test-Path -LiteralPath $eventsPath -PathType Leaf) {
    $eventCount = (Get-Content -LiteralPath $eventsPath -Encoding UTF8 | Measure-Object -Line).Lines
    $lastText = ''
    $sessionIdFromEvents = ''
    $textPartCount = 0
    $toolUseCount = 0
    $latestTool = ''
    Get-Content -LiteralPath $eventsPath -Encoding UTF8 -Tail 200 | ForEach-Object {
      if ([string]::IsNullOrWhiteSpace($_)) {
        return
      }
      try {
        $event = $_ | ConvertFrom-Json
        if (($event.PSObject.Properties.Name -contains 'sessionID') -and -not [string]::IsNullOrWhiteSpace($event.sessionID)) {
          $sessionIdFromEvents = [string]$event.sessionID
        }

        if (($event.PSObject.Properties.Name -contains 'type') -and $event.type -eq 'text' -and ($event.PSObject.Properties.Name -contains 'part') -and $event.part -and ($event.part.PSObject.Properties.Name -contains 'text')) {
          $textPartCount += 1
          $text = ([string]$event.part.text -replace '\s+', ' ').Trim()
          if ($text.Length -gt 700) {
            $text = $text.Substring($text.Length - 700)
          }
          $lastText = $text
        } elseif (($event.PSObject.Properties.Name -contains 'type') -and $event.type -eq 'tool_use' -and ($event.PSObject.Properties.Name -contains 'part') -and $event.part) {
          $toolUseCount += 1
          $toolName = if ($event.part.PSObject.Properties.Name -contains 'tool') { [string]$event.part.tool } else { 'tool' }
          $toolTitle = ''
          if (($event.part.PSObject.Properties.Name -contains 'state') -and $event.part.state -and ($event.part.state.PSObject.Properties.Name -contains 'title')) {
            $toolTitle = [string]$event.part.state.title
          }
          $latestTool = ("$toolName $toolTitle" -replace '\s+', ' ').Trim()
        }
      } catch {
        # Ignore malformed event lines.
      }
    }
    @(
      "Status: completed"
      "ExitCode: $exitCode"
      "SessionId: $sessionIdFromEvents"
      "EventLines: $eventCount"
      "TextParts: $textPartCount"
      "ToolUses: $toolUseCount"
      "LatestTool: $latestTool"
      "LastAnswerSummary: $lastText"
    ) | Set-Content -LiteralPath $summaryPath -Encoding UTF8

    if (-not $KeepEvents) {
      Remove-Item -LiteralPath $eventsPath -Force
    }
  }

  Write-JsonFile $statusPath ([ordered]@{
    status = if ($exitCode -eq 0) { 'completed' } else { 'failed' }
    mode = 'managed'
    pid = $PID
    exitCode = $exitCode
    runDir = $runDir
    summaryPath = $summaryPath
    keepEvents = [bool]$KeepEvents
    updatedAt = (Get-Date).ToString('o')
  })
  exit $exitCode
}

if ($ChildObserve) {
  Set-Location -LiteralPath $repoRootFull
  $env:CODEX_OPENCODE_SIGNAL_DIR = $runDir
  Write-JsonFile $statusPath ([ordered]@{
    status = 'running'
    mode = 'observe'
    pid = $PID
    runDir = $runDir
    updatedAt = (Get-Date).ToString('o')
  })

  & opencode @observeArgs
  $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }

  Write-JsonFile $statusPath ([ordered]@{
    status = if ($exitCode -eq 0) { 'completed' } else { 'failed' }
    mode = 'observe'
    pid = $PID
    exitCode = $exitCode
    runDir = $runDir
    updatedAt = (Get-Date).ToString('o')
  })

  Write-Host ''
  Write-Host 'OpenCode session ended. This window will stay open.'
  exit $exitCode
}

if ($Mode -eq 'managed') {
  $pwshPath = Get-PwshPath
  $childEnvironment = @{}
  $childArgs = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $PSCommandPath,
    '-RepoRoot', $repoRootFull,
    '-Mode', 'managed',
    '-Model', $Model,
    '-RunSlug', $RunSlug,
    '-Title', $Title,
    '-ChildManaged'
  )
  if ($isDirectPrompt) {
    $childEnvironment.CODEX_OPENCODE_PROMPT_B64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Prompt))
  } else {
    $childArgs += @('-TaskPath', $taskFull)
  }
  if (-not [string]::IsNullOrWhiteSpace($SessionId)) { $childArgs += @('-SessionId', $SessionId) }
  if ($ContinueMostRecent) { $childArgs += '-ContinueMostRecent' }
  if ($ForkSession) { $childArgs += '-ForkSession' }
  if (-not [string]::IsNullOrWhiteSpace($Agent)) { $childArgs += @('-Agent', $Agent) }
  if (-not [string]::IsNullOrWhiteSpace($Variant)) { $childArgs += @('-Variant', $Variant) }
  if ($KeepEvents) { $childArgs += '-KeepEvents' }

  $startParams = @{
    FilePath = $pwshPath
    ArgumentList = (Join-CommandLine $childArgs)
    WindowStyle = 'Hidden'
    PassThru = $true
  }
  if ($childEnvironment.Count -gt 0) {
    $startParams.Environment = $childEnvironment
  }
  $proc = Start-Process @startParams
  Write-JsonFile $statusPath ([ordered]@{
    status = 'started'
    mode = 'managed'
    launcherPid = $PID
    pid = $proc.Id
    runDir = $runDir
    updatedAt = (Get-Date).ToString('o')
  })
  Write-Output "OpenCode managed task started. RunDir=$runDir PID=$($proc.Id)"
  exit 0
}

$wt = Get-Command wt.exe -ErrorAction SilentlyContinue
if ($null -eq $wt) {
  throw 'Windows Terminal wt.exe was not found. Observation mode requires a visible terminal.'
}

$pwshPath = Get-PwshPath
$childArgs = @(
  '-NoExit',
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', $PSCommandPath,
  '-RepoRoot', $repoRootFull,
  '-Mode', 'observe',
  '-Model', $Model,
  '-RunSlug', $RunSlug,
  '-Title', $Title,
  '-ChildObserve'
)
$observeEnvironment = @{}
if ($isDirectPrompt) {
  $observeEnvironment.CODEX_OPENCODE_PROMPT_B64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Prompt))
} else {
  $childArgs += @('-TaskPath', $taskFull)
}
if (-not [string]::IsNullOrWhiteSpace($SessionId)) { $childArgs += @('-SessionId', $SessionId) }
if ($ContinueMostRecent) { $childArgs += '-ContinueMostRecent' }
if ($ForkSession) { $childArgs += '-ForkSession' }
if (-not [string]::IsNullOrWhiteSpace($Agent)) { $childArgs += @('-Agent', $Agent) }
if (-not [string]::IsNullOrWhiteSpace($Variant)) { $childArgs += @('-Variant', $Variant) }

$cmdLine = 'new-tab -d ' + (Quote-Arg $repoRootFull) + ' ' + (Quote-Arg $pwshPath) + ' ' + (Join-CommandLine $childArgs)
$startParams = @{
  FilePath = 'wt.exe'
  ArgumentList = $cmdLine
}
if ($observeEnvironment.Count -gt 0) {
  $startParams.Environment = $observeEnvironment
}
Start-Process @startParams
Write-JsonFile $statusPath ([ordered]@{
  status = 'started'
  mode = 'observe'
  launcherPid = $PID
  runDir = $runDir
  updatedAt = (Get-Date).ToString('o')
})
Write-Output "OpenCode observation window started. RunDir=$runDir"

if (-not $NoWatch) {
  $watchPath = Join-Path (Split-Path -Parent $PSCommandPath) 'watch-opencode-task-output.ps1'
  Write-Output "OpenCode foreground watch started. IntervalSeconds=$WatchIntervalSeconds MaxUpdates=$WatchMaxUpdates StopWhenRunEnds=true"
  $watchArgs = @{
    RunDir = $runDir
    RepoRoot = $repoRootFull
    IntervalSeconds = $WatchIntervalSeconds
    MaxUpdates = $WatchMaxUpdates
    WaitForSessionSeconds = $WatchWaitSeconds
    StopWhenRunEnds = $true
    HeartbeatUpdates = 5
    StopWhenIdleSignal = $true
  }
  if (-not $WatchAllUpdates) {
    $watchArgs.OnlyOnChange = $true
  }
  & $watchPath @watchArgs
}
