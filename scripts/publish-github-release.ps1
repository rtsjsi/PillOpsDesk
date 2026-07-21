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
$PackageJsonPath = Join-Path $ProjectRoot 'package.json'

if (-not $SkipMake) {
  Push-Location $ProjectRoot
  try {
    $Before = (Get-Content $PackageJsonPath -Raw | ConvertFrom-Json).version
    npm version patch --no-git-tag-version | Out-Null
    $After = (Get-Content $PackageJsonPath -Raw | ConvertFrom-Json).version
    Write-Host "Bumped version: $Before -> $After"
  } finally {
    Pop-Location
  }
}

$Pkg = Get-Content $PackageJsonPath -Raw | ConvertFrom-Json
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

$AppDir = Get-ChildItem -Path (Join-Path $ProjectRoot 'out') -Directory -Recurse -Filter '*-win32-x64' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $AppDir) {
  Write-Error "Packaged app folder not found under out\**\*-win32-x64. Run 'npm run make' first."
}

$SetupExe = Get-ChildItem -Path (Join-Path $ProjectRoot 'out\release\make\nsis') -Recurse -Filter 'PillOpsDeskSetup.exe' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $SetupExe) {
  Write-Error "PillOpsDeskSetup.exe not found under out\release\make\nsis. Run 'npm run make' first."
}

$ReleaseDir = $SetupExe.DirectoryName

$ZipPath = Join-Path $ReleaseDir $ZipName
if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
Compress-Archive -Path (Join-Path $AppDir.FullName '*') -DestinationPath $ZipPath -Force

$ReleaseNotes = if ($Notes) { $Notes } else { "PillOpsDesk $Version" }
node (Join-Path $ProjectRoot 'scripts\prepare-release-manifest.cjs') $ZipPath $ReleaseNotes

$ManifestPath = Join-Path $ReleaseDir 'latest.json'
if (-not (Test-Path $ManifestPath)) {
  Write-Error 'latest.json was not created next to the OTA zip.'
}

$UploadAssets = @($SetupExe.FullName, $ZipPath, $ManifestPath)

Write-Host "Creating GitHub release $Tag ..."
gh release create $Tag `
  --repo rtsjsi/PillOpsDesk `
  --title "PillOpsDesk $Version" `
  --notes $ReleaseNotes `
  @UploadAssets

# Remove intermediate build artifacts; keep only release assets in $ReleaseDir.
if ($AppDir -and (Test-Path $AppDir.FullName)) {
  Remove-Item -LiteralPath $AppDir.FullName -Recurse -Force
  Write-Host "Removed packaged app folder: $($AppDir.FullName)"
}
Get-ChildItem -Path (Join-Path $ProjectRoot 'out') -Recurse -Filter '*.blockmap' -ErrorAction SilentlyContinue |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }
$StaleReleaseOta = Join-Path $ProjectRoot 'out\release-ota'
if (Test-Path $StaleReleaseOta) {
  Remove-Item -LiteralPath $StaleReleaseOta -Recurse -Force
  Write-Host 'Removed stale out\release-ota folder.'
}
$ReleaseRoot = Join-Path $ProjectRoot 'out\release'
Get-ChildItem -Path $ReleaseRoot -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -eq 'latest.json' -or $_.Name -like 'PillOpsDesk-*-win64.zip' } |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }

Write-Host "Published $Tag"
Write-Host "Release assets: $ReleaseDir"
Write-Host "OTA manifest: https://github.com/rtsjsi/PillOpsDesk/releases/latest/download/latest.json"
Write-Host "OTA package:  https://github.com/rtsjsi/PillOpsDesk/releases/latest/download/$ZipName"
