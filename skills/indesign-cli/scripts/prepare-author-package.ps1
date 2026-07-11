[CmdletBinding(DefaultParameterSetName = 'Assemble')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'Create')]
    [string]$Destination,

    [Parameter(Mandatory = $true, ParameterSetName = 'Assemble')]
    [string]$Package,

    [Parameter(ParameterSetName = 'Create')]
    [string]$Title,

    [Parameter(ParameterSetName = 'Create')]
    [string]$Id
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Utf8NoBom([string]$Path, [string]$Value) {
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Value, $encoding)
}

if ($PSCmdlet.ParameterSetName -eq 'Create') {
    $templateRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\assets\html-starter'))
    $destinationPath = [System.IO.Path]::GetFullPath($Destination)
    if (Test-Path -LiteralPath $destinationPath) {
        if (-not (Test-Path -LiteralPath $destinationPath -PathType Container)) {
            throw "Destination is not a directory: $destinationPath"
        }
        if (@(Get-ChildItem -LiteralPath $destinationPath -Force).Count -gt 0) {
            throw "Destination must be empty: $destinationPath"
        }
    } else {
        New-Item -ItemType Directory -Path $destinationPath | Out-Null
    }

    foreach ($item in Get-ChildItem -LiteralPath $templateRoot -Force) {
        Copy-Item -LiteralPath $item.FullName -Destination $destinationPath -Recurse -Force
    }
    New-Item -ItemType Directory -Path (Join-Path $destinationPath 'assets') -Force | Out-Null

    $configPath = Join-Path $destinationPath 'deck.config.json'
    $config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
    $config.id = if ($Id) { $Id } else { Split-Path -Leaf $destinationPath }
    if ($Title) { $config.title = $Title }
    Write-Utf8NoBom $configPath (($config | ConvertTo-Json -Depth 100) + "`n")
} else {
    $configPath = (Resolve-Path -LiteralPath $Package).Path
}

if ($env:INDESIGN_CLI_RUNTIME_ROOT) {
    $runtimeRoot = [System.IO.Path]::GetFullPath($env:INDESIGN_CLI_RUNTIME_ROOT)
} else {
    $agent = Get-Command indesign-cli-agent -ErrorAction SilentlyContinue
    $agentPath = if ($agent) { $agent.Source } else { Join-Path $env:LOCALAPPDATA 'indesign-cli\bin\indesign-cli-agent.exe' }
    if (-not (Test-Path -LiteralPath $agentPath -PathType Leaf)) {
        throw 'indesign-cli-agent is not installed. Run the company Setup first.'
    }
    $healthText = (& $agentPath health 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "indesign-cli-agent health failed: $healthText"
    }
    $health = $healthText | ConvertFrom-Json
    $runtimeRoot = [string]$health.data.runtime_root
    if (-not $runtimeRoot) {
        throw 'No active runtime. Run the company Setup first.'
    }
}

$node = Join-Path $runtimeRoot 'node\node.exe'
$pluginRoot = Join-Path $runtimeRoot 'plugins\html-indesign'
$assembler = Join-Path $PSScriptRoot 'assemble-author-package.cjs'
if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw "Runtime Node is missing: $node" }
if (-not (Test-Path -LiteralPath $pluginRoot -PathType Container)) { throw "HTML plugin is missing: $pluginRoot" }

$result = (& $node $assembler $pluginRoot $configPath 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Author package assembly failed: $result"
}
Write-Output $result
