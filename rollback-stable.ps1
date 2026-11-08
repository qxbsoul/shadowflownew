$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Backup = Join-Path $Root 'backups\stable-20261107-1228'
$Source = Join-Path $Backup 'source'
$Data = Join-Path $Backup 'data'

if (-not (Test-Path (Join-Path $Backup 'manifest.json'))) {
    throw "Stable snapshot not found: $Backup"
}

$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in @(3007, 8000, 8002) })
if ($listeners.Count -gt 0) {
    throw 'ShadowFlow is still listening on port 3007, 8000, or 8002. Stop all ShadowFlow services before rollback.'
}

function Copy-TreeExact([string]$From, [string]$To) {
    if (-not (Test-Path $From)) { return }
    New-Item -ItemType Directory -Force -Path $To | Out-Null
    & robocopy $From $To /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Failed to restore directory: $To (robocopy $LASTEXITCODE)" }
    $global:LASTEXITCODE = 0
}

function Copy-SnapshotFiles([string]$Relative) {
    $from = Join-Path $Source $Relative
    $to = Join-Path $Root $Relative
    if (-not (Test-Path $from)) { return }
    New-Item -ItemType Directory -Force -Path $to | Out-Null
    Get-ChildItem $from -File | ForEach-Object {
        Copy-Item $_.FullName (Join-Path $to $_.Name) -Force
    }
}

# Restore source only. Dependencies and runtime directories are never mirrored.
Copy-SnapshotFiles 'shadowflow-react'
Copy-SnapshotFiles 'ShadowFlow-backend'
Copy-SnapshotFiles 'ShadowFlow-backend\server'
Copy-TreeExact (Join-Path $Source 'shadowflow-react\src') (Join-Path $Root 'shadowflow-react\src')
Copy-TreeExact (Join-Path $Source 'shadowflow-react\public') (Join-Path $Root 'shadowflow-react\public')
Copy-TreeExact (Join-Path $Source 'ShadowFlow-backend\shadowflow') (Join-Path $Root 'ShadowFlow-backend\shadowflow')
Copy-TreeExact (Join-Path $Source 'ShadowFlow-backend\server\src') (Join-Path $Root 'ShadowFlow-backend\server\src')
Copy-TreeExact (Join-Path $Source 'ShadowFlow-backend\server\skills') (Join-Path $Root 'ShadowFlow-backend\server\skills')
Copy-TreeExact (Join-Path $Source 'ShadowFlow-backend\scripts') (Join-Path $Root 'ShadowFlow-backend\scripts')
Copy-TreeExact (Join-Path $Source 'ShadowFlow-backend\tests') (Join-Path $Root 'ShadowFlow-backend\tests')
Copy-SnapshotFiles '.'

if (Test-Path $Data) {
    Get-ChildItem $Data -Recurse -File | ForEach-Object {
        $relative = $_.FullName.Substring($Data.Length).TrimStart('\')
        $target = Join-Path $Root $relative
        New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
        Copy-Item $_.FullName $target -Force
    }
}

Write-Host 'Restored stable-20261107-1228. Dependency directories were preserved.'
Write-Host 'Restart with: npm run dev'
