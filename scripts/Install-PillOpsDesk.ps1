# Installs PillOpsDesk from the folder containing this script (portable build output).
# Run: right-click -> Run with PowerShell, or: powershell -ExecutionPolicy Bypass -File Install-PillOpsDesk.ps1
# Works on Windows 10/11. Does not require admin (installs under LocalAppData).

$ErrorActionPreference = 'Stop'

$SourceDir = $PSScriptRoot
$ExeName = 'pillopsdesk.exe'
$ExePath = Join-Path $SourceDir $ExeName

if (-not (Test-Path $ExePath)) {
  Write-Error "Could not find $ExeName in $SourceDir. Extract the ZIP fully before running this script."
}

$InstallDir = Join-Path $env:LOCALAPPDATA 'PillOpsDesk'
$TargetExe = Join-Path $InstallDir $ExeName

Write-Host "Installing PillOpsDesk to $InstallDir ..."

if (Test-Path $InstallDir) {
  Get-Process -Name 'pillopsdesk' -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 1
  Remove-Item -Recurse -Force $InstallDir
}

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Copy-Item -Path (Join-Path $SourceDir '*') -Destination $InstallDir -Recurse -Force

$WshShell = New-Object -ComObject WScript.Shell
$Desktop = [Environment]::GetFolderPath('Desktop')
$StartMenu = [Environment]::GetFolderPath('Programs')

$DesktopLink = Join-Path $Desktop 'PillOpsDesk.lnk'
$StartMenuLink = Join-Path $StartMenu 'PillOpsDesk.lnk'

foreach ($LinkPath in @($DesktopLink, $StartMenuLink)) {
  $Shortcut = $WshShell.CreateShortcut($LinkPath)
  $Shortcut.TargetPath = $TargetExe
  $Shortcut.WorkingDirectory = $InstallDir
  $Shortcut.Description = 'PillOpsDesk pharmacy management'
  $Icon = Join-Path $InstallDir 'resources\icon.ico'
  if (Test-Path $Icon) { $Shortcut.IconLocation = $Icon }
  $Shortcut.Save()
}

Write-Host ""
Write-Host "PillOpsDesk installed successfully."
Write-Host "Shortcuts created on Desktop and Start Menu."
Write-Host ""
Write-Host "If Windows Smart App Control blocks the app, open Windows Security ->"
Write-Host "Protection history and allow PillOpsDesk, or turn off Smart App Control."
Write-Host ""
$launch = Read-Host "Launch PillOpsDesk now? (Y/n)"
if ($launch -eq '' -or $launch -match '^[Yy]') {
  Start-Process $TargetExe
}
