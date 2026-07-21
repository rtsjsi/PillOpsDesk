# Build installer, package OTA zip + latest.json, and publish a GitHub Release.
# Usage: npm run release
#        npm run release -- -Notes "What changed"
#        npm run release -- -SkipMake   (reuse an existing out\*-win32-x64 build)
# Requires: gh CLI logged in (gh auth login).
param(
  [string]$Notes = '',
  [switch]$SkipMake
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$Pkg = Get-Content (Join-Path $ProjectRoot 'package.json') | ConvertFrom-Json
$Version = $Pkg.version
$Tag = "v$Version"
$ZipName = "PillOpsDesk-$Version-win64.zip"

if (-not $SkipMake) {
  Push-Location $ProjectRoot
  try {
    npm run make
  } finally {
    Pop-Location
  }
}

$AppDir = Get-ChildItem -Path (Join-Path $ProjectRoot 'out') -Directory -Filter '*-win32-x64' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $AppDir) {
  Write-Error "Packaged app folder not found under out\*-win32-x64. Run 'npm run make' first."
}

$ReleaseDir = Join-Path $ProjectRoot 'out\release-ota'
Get-ChildItem $ReleaseDir -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
New-Item -ItemType Directory -Path $ReleaseDir -Force | Out-Null

$ZipPath = Join-Path $ReleaseDir $ZipName
if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
Compress-Archive -Path (Join-Path $AppDir.FullName '*') -DestinationPath $ZipPath -Force

$ReleaseNotes = if ($Notes) { $Notes } else { "PillOpsDesk $Version" }
node (Join-Path $ProjectRoot 'scripts\prepare-release-manifest.cjs') $ZipPath $ReleaseNotes

$ManifestPath = Join-Path $ReleaseDir 'latest.json'
if (-not (Test-Path $ManifestPath)) {
  Write-Error 'latest.json was not created next to the OTA zip.'
}

$SetupExe = Get-ChildItem -Path (Join-Path $ProjectRoot 'out\make\nsis') -Recurse -Filter 'PillOpsDeskSetup.exe' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

$UploadAssets = @($ZipPath, $ManifestPath)
if ($SetupExe) {
  $UploadAssets = @($SetupExe.FullName) + $UploadAssets
}

Write-Host "Creating GitHub release $Tag ..."
gh release create $Tag `
  --repo rtsjsi/PillOpsDesk `
  --title "PillOpsDesk $Version" `
  --notes $ReleaseNotes `
  @UploadAssets

Write-Host "Published $Tag"
Write-Host "OTA manifest: https://github.com/rtsjsi/PillOpsDesk/releases/latest/download/latest.json"
Write-Host "OTA package:  https://github.com/rtsjsi/PillOpsDesk/releases/latest/download/$ZipName"
