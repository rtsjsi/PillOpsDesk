# Removes generated build artifacts from the project tree.
# Safe to re-run. Does not touch source, node_modules, or scripts/keys.
$ErrorActionPreference = 'Continue'
$Root = Split-Path $PSScriptRoot -Parent

$Targets = @(
  'out',
  '.vite',
  'dist'
)

Write-Host "Cleaning PillOpsDesk artifacts under $Root"
foreach ($rel in $Targets) {
  $path = Join-Path $Root $rel
  if (-not (Test-Path -LiteralPath $path)) {
    Write-Host "  skip  $rel"
    continue
  }
  try {
    Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop
    Write-Host "  removed $rel"
  } catch {
    Write-Warning "Could not fully remove $rel : $($_.Exception.Message)"
    Write-Warning "Close any running PillOpsDesk/Electron process (and pause IDE indexing of out/) then re-run: npm run clean"
  }
}

Write-Host 'Done.'
