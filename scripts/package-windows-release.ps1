# Bundles the portable ZIP + install script into one folder for distribution (USB / WhatsApp / etc.)
param(
  [string]$OutRoot = (Join-Path (Split-Path $PSScriptRoot -Parent) 'out\release')
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path $PSScriptRoot -Parent

$ZipDir = Join-Path $OutRoot 'make\zip\win32\x64'
$AppDir = Join-Path $OutRoot 'PillOpsDesk-win32-x64'
$ReleaseDir = Join-Path $OutRoot 'dist'

if (-not (Test-Path $AppDir)) {
  Write-Error "Packaged app not found at $AppDir. Run 'npm run make' first."
}

Get-ChildItem $ReleaseDir -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
New-Item -ItemType Directory -Path $ReleaseDir -Force | Out-Null

Copy-Item -Path (Join-Path $AppDir '*') -Destination $ReleaseDir -Recurse -Force
Copy-Item -Path (Join-Path $ProjectRoot 'scripts\Install-PillOpsDesk.ps1') -Destination $ReleaseDir -Force

$Readme = @"
PillOpsDesk — Windows install (10 / 11)

OPTION A — Install (recommended)
1. Extract this entire folder to a temporary location.
2. Right-click Install-PillOpsDesk.ps1 -> Run with PowerShell.
3. Use the Desktop or Start Menu shortcut to open the app.

OPTION B — Portable (no install)
1. Copy this folder anywhere (e.g. D:\PillOpsDesk).
2. Double-click pillopsdesk.exe.

Smart App Control (Windows 11)
If Windows blocks the app, open Windows Security -> Protection history -> Allow.
For store PCs without Smart App Control, no extra step is usually needed.

Your pharmacy data is stored separately in AppData and is kept when you update.
"@

Set-Content -Path (Join-Path $ReleaseDir 'INSTALL.txt') -Value $Readme -Encoding UTF8

$Version = (Get-Content (Join-Path $ProjectRoot 'package.json') | ConvertFrom-Json).version
$ZipPath = Join-Path $OutRoot "dist\PillOpsDesk-$Version-win64-portable.zip"

if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
Compress-Archive -Path (Join-Path $ReleaseDir '*') -DestinationPath $ZipPath -Force

Write-Host "Release folder: $ReleaseDir"
Write-Host "Portable ZIP:   $ZipPath"
