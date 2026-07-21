import { app, BrowserWindow } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { IPC } from '@shared/api';
import { UPDATE_MANIFEST_URL } from '@shared/update-config';
import type { UpdateCheckResult, UpdateDownloadProgress, UpdateManifest } from '@shared/types';

function sendProgress(progress: UpdateDownloadProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.updatesProgress, progress);
  }
}

function compareVersions(current: string, latest: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/i, '')
      .split('.')
      .map((part) => parseInt(part, 10) || 0);
  const a = parse(current);
  const b = parse(latest);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function getInstallDir(): string {
  return path.dirname(process.execPath);
}

function buildBackgroundUpdaterScript(
  installDir: string,
  zipPath: string,
  updaterScriptPath: string
): string {
  const exePath = path.join(installDir, 'pillopsdesk.exe');
  const logPath = path.join(os.tmpdir(), 'pillopsdesk-updater.log');
  return `$ErrorActionPreference = 'Stop'
$InstallDir = ${psQuote(installDir)}
$ZipPath = ${psQuote(zipPath)}
$ExePath = ${psQuote(exePath)}
$ExtractDir = Join-Path $env:TEMP ('pillopsdesk-update-' + [guid]::NewGuid().ToString())
$UpdaterScript = ${psQuote(updaterScriptPath)}
$LogPath = ${psQuote(logPath)}

function Write-Log($Message) {
  $Line = '[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $Message
  Add-Content -Path $LogPath -Value $Line -ErrorAction SilentlyContinue
}

function Unblock-Recursively($Path) {
  Get-ChildItem -Path $Path -Recurse -Force -ErrorAction SilentlyContinue |
    Unblock-File -ErrorAction SilentlyContinue
}

function Invoke-WithRetry([scriptblock]$Action, [string]$StepName, [int]$MaxAttempts = 6) {
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      & $Action
      return
    } catch {
      if ($attempt -eq $MaxAttempts) { throw }
      Write-Log ("$StepName failed on attempt $attempt/$MaxAttempts (" + $_.Exception.Message + '). Retrying...')
      # Files freshly written/extracted are often briefly locked by antivirus
      # real-time scanning; back off and retry instead of giving up immediately.
      Start-Sleep -Seconds ([Math]::Min(2 * $attempt, 10))
    }
  }
}

Remove-Item -Path $LogPath -Force -ErrorAction SilentlyContinue
Write-Log 'Updater started.'

try {
  for ($i = 0; $i -lt 120; $i++) {
    if (-not (Get-Process -Name 'pillopsdesk' -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 500
  }
  Get-Process -Name 'pillopsdesk' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3
  Write-Log 'App process closed.'

  # The downloaded zip carries the Windows "Mark of the Web" (it came from the
  # internet). Unblock it and everything extracted from it, otherwise Windows
  # Defender / Smart App Control can silently refuse to run the new files.
  Unblock-File -Path $ZipPath -ErrorAction SilentlyContinue

  New-Item -ItemType Directory -Path $ExtractDir -Force | Out-Null
  Invoke-WithRetry -StepName 'Expand-Archive' -Action {
    Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force
  }
  Unblock-Recursively $ExtractDir
  Write-Log 'Update package extracted.'

  Invoke-WithRetry -StepName 'Copy-Item' -Action {
    Get-ChildItem -Path $ExtractDir -Force | ForEach-Object {
      Copy-Item -Path $_.FullName -Destination $InstallDir -Recurse -Force
    }
  }
  Unblock-Recursively $InstallDir
  Write-Log 'Update files copied into install directory.'

  Remove-Item -Path $ZipPath -Force -ErrorAction SilentlyContinue
  Remove-Item -Path $ExtractDir -Recurse -Force -ErrorAction SilentlyContinue
  Write-Log 'Update applied successfully. Relaunching app.'
} catch {
  Write-Log ('Update FAILED: ' + $_.Exception.Message)
}

if (Test-Path $ExePath) {
  Start-Process -FilePath $ExePath -WorkingDirectory $InstallDir
  Write-Log 'App relaunched.'
} else {
  Write-Log ('Could not relaunch: exe not found at ' + $ExePath)
}

Remove-Item -Path $UpdaterScript -Force -ErrorAction SilentlyContinue
`;
}

function launchBackgroundUpdater(installDir: string, zipPath: string): void {
  const updaterScriptPath = path.join(
    os.tmpdir(),
    `pillopsdesk-updater-${Date.now()}.ps1`
  );
  fs.writeFileSync(
    updaterScriptPath,
    buildBackgroundUpdaterScript(installDir, zipPath, updaterScriptPath),
    'utf8'
  );

  const child = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-WindowStyle',
      'Hidden',
      '-File',
      updaterScriptPath,
    ],
    {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }
  );
  child.unref();
}

export function getAppVersion(): string {
  return app.getVersion();
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();

  if (!app.isPackaged) {
    return { currentVersion, updateAvailable: false };
  }

  let res: Response;
  try {
    res = await fetch(UPDATE_MANIFEST_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PillOpsDesk-Updater',
      },
    });
  } catch {
    throw new Error('Could not check for updates. Check your internet connection.');
  }

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        'No update information found. Ensure a GitHub release with latest.json is published and publicly downloadable.'
      );
    }
    throw new Error(`Could not check for updates (HTTP ${res.status}). Try again later.`);
  }

  const manifest = (await res.json()) as UpdateManifest;
  if (!manifest.version || !manifest.url || !manifest.sha256) {
    throw new Error('Update information from the server is incomplete.');
  }

  const updateAvailable = compareVersions(currentVersion, manifest.version) < 0;
  return {
    currentVersion,
    updateAvailable,
    manifest: updateAvailable ? manifest : undefined,
  };
}

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function downloadUpdatePackage(manifest: UpdateManifest): Promise<string> {
  const res = await fetch(manifest.url, {
    headers: { 'User-Agent': 'PillOpsDesk-Updater' },
  });

  if (!res.ok) {
    throw new Error(`Could not download update (${res.status}).`);
  }

  if (!res.body) {
    throw new Error('Download failed: empty response.');
  }

  const total = Number(res.headers.get('content-length') ?? 0);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pillopsdesk-update-'));
  const zipPath = path.join(tempDir, `PillOpsDesk-${manifest.version}-win64.zip`);

  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let transferred = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    chunks.push(chunk);
    transferred += chunk.length;
    sendProgress({
      phase: 'downloading',
      percent: total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : 0,
      transferred,
      total: total || transferred,
    });
  }

  fs.writeFileSync(zipPath, Buffer.concat(chunks));

  const hash = await sha256File(zipPath);
  if (hash.toLowerCase() !== manifest.sha256.toLowerCase()) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw new Error('Downloaded update failed verification. Please try again later.');
  }

  sendProgress({
    phase: 'downloading',
    percent: 100,
    transferred,
    total: total || transferred,
  });

  return zipPath;
}

/** Download, verify, apply in background, and quit — no installer UI. */
export async function applyUpdate(manifest: UpdateManifest): Promise<void> {
  if (!app.isPackaged) {
    throw new Error('Updates are only available in the installed app.');
  }

  if (process.platform !== 'win32') {
    throw new Error('Automatic updates are only supported on Windows.');
  }

  const zipPath = await downloadUpdatePackage(manifest);

  sendProgress({
    phase: 'installing',
    percent: 100,
    transferred: 0,
    total: 0,
  });

  launchBackgroundUpdater(getInstallDir(), zipPath);
  app.quit();
}
