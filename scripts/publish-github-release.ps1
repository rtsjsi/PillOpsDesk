# Build, generate latest.json, and publish a GitHub Release for OTA updates.
# Requires: gh CLI (https://cli.github.com/) authenticated for the repo.
param(
  [string]$Notes = '',
  [switch]$SkipMake
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$Pkg = Get-Content (Join-Path $ProjectRoot 'package.json') | ConvertFrom-Json
$Version = $Pkg.version
$Tag = "v$Version"

if (-not $SkipMake) {
  Push-Location $ProjectRoot
  try {
    npm run make
  } finally {
    Pop-Location
  }
}

$SetupExe = Get-ChildItem -Path (Join-Path $ProjectRoot 'out\make\nsis\*\PillOpsDeskSetup.exe') -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $SetupExe) {
  Write-Error "PillOpsDeskSetup.exe not found under out\make\nsis\. Run 'npm run make' first."
}

$ReleaseNotes = if ($Notes) { $Notes } else { "PillOpsDesk $Version" }
node (Join-Path $ProjectRoot 'scripts\prepare-release-manifest.cjs') $SetupExe.FullName $ReleaseNotes

$ManifestPath = Join-Path $SetupExe.DirectoryName 'latest.json'
if (-not (Test-Path $ManifestPath)) {
  Write-Error "latest.json was not created next to the installer."
}

Write-Host "Creating GitHub release $Tag ..."
gh release create $Tag `
  --repo rtsjsi/PillOpsDesk `
  --title "PillOpsDesk $Version" `
  --notes $ReleaseNotes `
  $SetupExe.FullName `
  $ManifestPath

Write-Host "Published $Tag"
Write-Host "OTA manifest: https://github.com/rtsjsi/PillOpsDesk/releases/latest/download/latest.json"
