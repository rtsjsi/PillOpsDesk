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

export function getAppVersion(): string {
  return app.getVersion();
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();

  if (!app.isPackaged) {
    return { currentVersion, updateAvailable: false };
  }

  const res = await fetch(UPDATE_MANIFEST_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'PillOpsDesk-Updater',
    },
  });

  if (!res.ok) {
    throw new Error(
      `Could not check for updates (${res.status}). Check your internet connection.`
    );
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

export async function downloadUpdate(manifest: UpdateManifest): Promise<string> {
  if (!app.isPackaged) {
    throw new Error('Updates are only available in the installed app.');
  }

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
  const installerPath = path.join(tempDir, 'PillOpsDeskSetup.exe');

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
      percent: total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : 0,
      transferred,
      total: total || transferred,
    });
  }

  fs.writeFileSync(installerPath, Buffer.concat(chunks));

  const hash = await sha256File(installerPath);
  if (hash.toLowerCase() !== manifest.sha256.toLowerCase()) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw new Error('Downloaded update failed verification. Please try again later.');
  }

  sendProgress({ percent: 100, transferred, total: total || transferred });
  return installerPath;
}

export function installUpdate(installerPath: string): void {
  const child = spawn(installerPath, ['/S'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  app.quit();
}
