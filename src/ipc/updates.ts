import { app, BrowserWindow, shell } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { IPC } from '@shared/api';
import { UPDATE_MANIFEST_URL } from '@shared/update-config';
import type { UpdateCheckResult, UpdateDownloadProgress, UpdateManifest } from '@shared/types';

/** Shared log for Electron download/apply + PowerShell install steps. */
export function getUpdaterLogPath(): string {
  return path.join(os.tmpdir(), 'pillopsdesk-updater.log');
}

function appendUpdaterLog(message: string): void {
  const line = `[${new Date().toISOString()}] [electron] ${message}\n`;
  try {
    fs.appendFileSync(getUpdaterLogPath(), line, 'utf8');
  } catch {
    // Logging must never block update flow.
  }
}

export function openUpdaterLog(): void {
  const logPath = getUpdaterLogPath();
  try {
    if (!fs.existsSync(logPath)) {
      fs.writeFileSync(
        logPath,
        `[${new Date().toISOString()}] [electron] Log file created (no update activity yet).\n`,
        'utf8'
      );
    }
    shell.showItemInFolder(logPath);
  } catch (err) {
    appendUpdaterLog(`openUpdaterLog failed: ${err instanceof Error ? err.message : String(err)}`);
    throw new Error('Could not open the updater log file.');
  }
}

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
  updaterScriptPath: string,
  logPath: string
): string {
  const exePath = path.join(installDir, 'pillopsdesk.exe');
  return `$ErrorActionPreference = 'Stop'
$InstallDir = ${psQuote(installDir)}
$ZipPath = ${psQuote(zipPath)}
$ExePath = ${psQuote(exePath)}
$ExtractDir = Join-Path $env:TEMP ('pillopsdesk-update-' + [guid]::NewGuid().ToString())
$UpdaterScript = ${psQuote(updaterScriptPath)}
$LogPath = ${psQuote(logPath)}

function Write-Log($Message) {
  $Line = '[' + (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss.fffK') + '] [powershell] ' + $Message
  Add-Content -Path $LogPath -Value $Line -ErrorAction SilentlyContinue
}

function Unblock-Recursively($Path) {
  Get-ChildItem -Path $Path -Recurse -Force -ErrorAction SilentlyContinue |
    Unblock-File -ErrorAction SilentlyContinue
}

function Invoke-WithRetry([scriptblock]$Action, [string]$StepName, [int]$MaxAttempts = 6) {
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      Write-Log ("$StepName attempt $attempt/$MaxAttempts...")
      & $Action
      Write-Log ("$StepName succeeded on attempt $attempt.")
      return
    } catch {
      if ($attempt -eq $MaxAttempts) {
        Write-Log ("$StepName FAILED permanently after $MaxAttempts attempts: " + $_.Exception.Message)
        throw
      }
      Write-Log ("$StepName failed on attempt $attempt/$MaxAttempts (" + $_.Exception.Message + '). Retrying...')
      # Files freshly written/extracted are often briefly locked by antivirus
      # real-time scanning; back off and retry instead of giving up immediately.
      Start-Sleep -Seconds ([Math]::Min(2 * $attempt, 10))
    }
  }
}

Write-Log '========== PowerShell updater started =========='
Write-Log ("PSVersion=" + $PSVersionTable.PSVersion.ToString())
Write-Log ("InstallDir=" + $InstallDir)
Write-Log ("ZipPath=" + $ZipPath)
Write-Log ("ExePath=" + $ExePath)
Write-Log ("ExtractDir=" + $ExtractDir)
Write-Log ("UpdaterScript=" + $UpdaterScript)
Write-Log ("LogPath=" + $LogPath)
Write-Log ("Current user=" + $env:USERNAME)
Write-Log ("IsAdmin=" + ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))

try {
  if (-not (Test-Path -LiteralPath $ZipPath)) {
    throw "Zip package not found at $ZipPath"
  }
  $zipInfo = Get-Item -LiteralPath $ZipPath
  Write-Log ("Zip exists. SizeBytes=" + $zipInfo.Length)

  Write-Log 'Waiting for pillopsdesk process to exit...'
  $waitedMs = 0
  for ($i = 0; $i -lt 120; $i++) {
    $procs = @(Get-Process -Name 'pillopsdesk' -ErrorAction SilentlyContinue)
    if ($procs.Count -eq 0) {
      Write-Log ("No pillopsdesk process running after $($waitedMs)ms.")
      break
    }
    if (($i % 10) -eq 0) {
      $pids = ($procs | ForEach-Object { $_.Id }) -join ','
      Write-Log ("Still running: count=$($procs.Count) pids=$pids waitedMs=$waitedMs")
    }
    Start-Sleep -Milliseconds 500
    $waitedMs += 500
  }

  $remaining = @(Get-Process -Name 'pillopsdesk' -ErrorAction SilentlyContinue)
  if ($remaining.Count -gt 0) {
    $pids = ($remaining | ForEach-Object { $_.Id }) -join ','
    Write-Log ("Force-stopping remaining pillopsdesk processes: pids=$pids")
    $remaining | Stop-Process -Force -ErrorAction SilentlyContinue
  } else {
    Write-Log 'No force-stop needed.'
  }
  Start-Sleep -Seconds 3
  Write-Log 'App process closed (post-wait sleep done).'

  # The downloaded zip carries the Windows "Mark of the Web" (it came from the
  # internet). Unblock it and everything extracted from it, otherwise Windows
  # Defender / Smart App Control can silently refuse to run the new files.
  Write-Log 'Unblocking zip Mark of the Web...'
  Unblock-File -Path $ZipPath -ErrorAction SilentlyContinue

  Write-Log 'Creating extract directory...'
  New-Item -ItemType Directory -Path $ExtractDir -Force | Out-Null

  Invoke-WithRetry -StepName 'Expand-Archive' -Action {
    Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force
  }

  $extracted = @(Get-ChildItem -Path $ExtractDir -Force -ErrorAction SilentlyContinue)
  Write-Log ("Extracted top-level items: count=$($extracted.Count)")
  foreach ($item in $extracted) {
    Write-Log ("  extract: " + $item.Name + " (" + $(if ($item.PSIsContainer) { 'dir' } else { 'file size=' + $item.Length }) + ')')
  }
  Unblock-Recursively $ExtractDir
  Write-Log 'Update package extracted and unblocked.'

  if (-not (Test-Path -LiteralPath $InstallDir)) {
    throw "Install directory does not exist: $InstallDir"
  }
  Write-Log ("InstallDir writable check starting. Exists=" + (Test-Path -LiteralPath $InstallDir))

  Invoke-WithRetry -StepName 'Copy-Item' -Action {
    Get-ChildItem -Path $ExtractDir -Force | ForEach-Object {
      Write-Log ("Copying: " + $_.Name + " -> " + $InstallDir)
      Copy-Item -Path $_.FullName -Destination $InstallDir -Recurse -Force
    }
  }
  Unblock-Recursively $InstallDir
  Write-Log 'Update files copied into install directory and unblocked.'

  Remove-Item -Path $ZipPath -Force -ErrorAction SilentlyContinue
  Remove-Item -Path $ExtractDir -Recurse -Force -ErrorAction SilentlyContinue
  Write-Log 'Temp zip and extract dir cleaned up.'
  Write-Log 'Update applied successfully. Relaunching app.'
} catch {
  Write-Log ('Update FAILED: ' + $_.Exception.Message)
  Write-Log ('ExceptionType: ' + $_.Exception.GetType().FullName)
  Write-Log ('ScriptStackTrace: ' + $_.ScriptStackTrace)
  if ($_.Exception.InnerException) {
    Write-Log ('InnerException: ' + $_.Exception.InnerException.Message)
  }
}

if (Test-Path -LiteralPath $ExePath) {
  try {
    Write-Log ("Starting process: $ExePath (cwd=$InstallDir)")
    Start-Process -FilePath $ExePath -WorkingDirectory $InstallDir
    Write-Log 'App relaunched.'
  } catch {
    Write-Log ('Relaunch FAILED: ' + $_.Exception.Message)
  }
} else {
  Write-Log ('Could not relaunch: exe not found at ' + $ExePath)
}

Write-Log '========== PowerShell updater finished =========='
Remove-Item -Path $UpdaterScript -Force -ErrorAction SilentlyContinue
`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Launch the PowerShell updater so it survives app.quit().
 *
 * Direct spawn(powershell) is killed with the Electron process on Windows
 * (job object / process tree). `cmd /c start` creates a breakaway process
 * that outlives the app — verified locally against this failure mode.
 */
function launchBackgroundUpdater(installDir: string, zipPath: string): void {
  const logPath = getUpdaterLogPath();
  const updaterScriptPath = path.join(
    os.tmpdir(),
    `pillopsdesk-updater-${Date.now()}.ps1`
  );

  appendUpdaterLog(`Writing PowerShell updater script: ${updaterScriptPath}`);
  fs.writeFileSync(
    updaterScriptPath,
    buildBackgroundUpdaterScript(installDir, zipPath, updaterScriptPath, logPath),
    'utf8'
  );
  appendUpdaterLog(`Updater script written (${fs.statSync(updaterScriptPath).size} bytes).`);

  // `start ""` requires an empty window title before the command.
  const args = [
    '/c',
    'start',
    '',
    '/min',
    'powershell.exe',
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-WindowStyle',
    'Hidden',
    '-File',
    updaterScriptPath,
  ];
  appendUpdaterLog(`Spawning breakaway: cmd.exe ${args.join(' ')}`);

  const child = spawn('cmd.exe', args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    cwd: os.tmpdir(),
  });
  child.on('error', (err) => {
    appendUpdaterLog(`cmd.exe spawn error: ${err.message}`);
  });
  appendUpdaterLog(`cmd.exe launcher pid=${child.pid ?? 'unknown'} (detached, unref).`);
  child.unref();
}

export function getAppVersion(): string {
  return app.getVersion();
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();
  appendUpdaterLog(
    `checkForUpdates: currentVersion=${currentVersion} isPackaged=${app.isPackaged} manifestUrl=${UPDATE_MANIFEST_URL}`
  );

  if (!app.isPackaged) {
    appendUpdaterLog('checkForUpdates: skipped (not packaged).');
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
  } catch (err) {
    appendUpdaterLog(
      `checkForUpdates: fetch failed: ${err instanceof Error ? err.message : String(err)}`
    );
    throw new Error('Could not check for updates. Check your internet connection.');
  }

  appendUpdaterLog(`checkForUpdates: HTTP ${res.status}`);
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
    appendUpdaterLog(`checkForUpdates: incomplete manifest keys=${Object.keys(manifest).join(',')}`);
    throw new Error('Update information from the server is incomplete.');
  }

  const updateAvailable = compareVersions(currentVersion, manifest.version) < 0;
  appendUpdaterLog(
    `checkForUpdates: latest=${manifest.version} updateAvailable=${updateAvailable} url=${manifest.url}`
  );
  return {
    currentVersion,
    updateAvailable,
    manifest: updateAvailable ? manifest : undefined,
  };
}

async function downloadUpdatePackage(manifest: UpdateManifest): Promise<string> {
  appendUpdaterLog(
    `download: starting version=${manifest.version} url=${manifest.url} expectedSha256=${manifest.sha256}`
  );

  const res = await fetch(manifest.url, {
    headers: { 'User-Agent': 'PillOpsDesk-Updater' },
  });

  appendUpdaterLog(`download: HTTP ${res.status} content-length=${res.headers.get('content-length') ?? 'unknown'}`);
  if (!res.ok) {
    throw new Error(`Could not download update (${res.status}).`);
  }

  if (!res.body) {
    throw new Error('Download failed: empty response.');
  }

  const total = Number(res.headers.get('content-length') ?? 0);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pillopsdesk-update-'));
  const zipPath = path.join(tempDir, `PillOpsDesk-${manifest.version}-win64.zip`);
  appendUpdaterLog(`download: writing to ${zipPath}`);

  // Stream straight to disk and hash on the fly, instead of buffering the
  // whole (~100MB+) package in memory and re-reading it afterwards to hash
  // it. That buffering approach caused heavy GC/memory pressure on lower-spec
  // PCs, which visibly slowed the download down.
  const hash = crypto.createHash('sha256');
  const fileStream = fs.createWriteStream(zipPath);
  const reader = res.body.getReader();
  let transferred = 0;
  let lastReportedAt = 0;
  let lastReportedPercent = -1;
  let lastLoggedPercent = -10;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      hash.update(chunk);
      transferred += chunk.length;

      const canWrite = fileStream.write(chunk);
      if (!canWrite) {
        await new Promise<void>((resolve) => fileStream.once('drain', resolve));
      }

      // Throttle IPC updates: at chunk-level frequency (thousands of times
      // for a large file) this can itself add enough overhead to slow the
      // download loop down and flood the renderer with re-renders.
      const percent = total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : 0;
      const now = Date.now();
      if (percent !== lastReportedPercent || now - lastReportedAt >= 150) {
        lastReportedPercent = percent;
        lastReportedAt = now;
        sendProgress({
          phase: 'downloading',
          percent,
          transferred,
          total: total || transferred,
        });
      }

      if (percent >= lastLoggedPercent + 10) {
        lastLoggedPercent = percent - (percent % 10);
        appendUpdaterLog(`download: progress ${percent}% (${transferred}/${total || transferred} bytes)`);
      }
    }

    await new Promise<void>((resolve, reject) => {
      fileStream.end((err?: Error | null) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    fileStream.destroy();
    fs.rmSync(tempDir, { recursive: true, force: true });
    appendUpdaterLog(`download: FAILED: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }

  const digest = hash.digest('hex');
  appendUpdaterLog(`download: complete bytes=${transferred} sha256=${digest}`);
  if (digest.toLowerCase() !== manifest.sha256.toLowerCase()) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    appendUpdaterLog(
      `download: SHA-256 mismatch expected=${manifest.sha256} actual=${digest}`
    );
    throw new Error('Downloaded update failed verification. Please try again later.');
  }

  sendProgress({
    phase: 'downloading',
    percent: 100,
    transferred,
    total: total || transferred,
  });

  appendUpdaterLog('download: SHA-256 verified OK.');
  return zipPath;
}

/** Download, verify, apply in background, and quit — no installer UI. */
export async function applyUpdate(manifest: UpdateManifest): Promise<void> {
  appendUpdaterLog(
    `applyUpdate: begin version=${manifest.version} isPackaged=${app.isPackaged} platform=${process.platform}`
  );
  appendUpdaterLog(`applyUpdate: execPath=${process.execPath}`);
  appendUpdaterLog(`applyUpdate: installDir=${getInstallDir()}`);
  appendUpdaterLog(`applyUpdate: logPath=${getUpdaterLogPath()}`);

  if (!app.isPackaged) {
    appendUpdaterLog('applyUpdate: rejected (not packaged).');
    throw new Error('Updates are only available in the installed app.');
  }

  if (process.platform !== 'win32') {
    appendUpdaterLog('applyUpdate: rejected (not win32).');
    throw new Error('Automatic updates are only supported on Windows.');
  }

  try {
    const zipPath = await downloadUpdatePackage(manifest);
    appendUpdaterLog(`applyUpdate: download ready zipPath=${zipPath}`);

    sendProgress({
      phase: 'installing',
      percent: 100,
      transferred: 0,
      total: 0,
    });

    launchBackgroundUpdater(getInstallDir(), zipPath);
    // Give Windows time to create the breakaway PowerShell process before
    // this Electron process (and its job object) exits.
    appendUpdaterLog('applyUpdate: waiting 1s for updater handoff before quit...');
    await sleep(1000);
    appendUpdaterLog('applyUpdate: calling app.quit().');
    app.quit();
  } catch (err) {
    appendUpdaterLog(`applyUpdate: FAILED: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}
