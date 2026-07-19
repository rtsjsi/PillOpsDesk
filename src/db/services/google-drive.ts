import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { OAuth2Client } from 'google-auth-library';
import type { DriveBackupFile } from '@shared/types';
import { DRIVE_RETENTION_COUNT } from '@shared/google-oauth-config';
import { copyDatabaseToPath, createTempBackupFilename, createTempBackupPath } from '../backup-utils';
import {
  clearDriveFolderId,
  getDriveFolderId,
  recordDriveBackupFailure,
  recordDriveBackupSuccess,
  setDriveConnectedEmail,
  setDriveFolderId,
} from './drive-settings';
import {
  disconnectGoogleDrive,
  getAuthorizedClient,
  getConnectedGoogleEmail,
  isGoogleDriveConnected,
} from './google-drive-auth';
import { isDriveBackupInProgress, setDriveBackupInProgress } from './drive-backup-state';

const BACKUP_FOLDER_NAME = 'PillOpsDesk Backups';
const BACKUP_MIME = 'application/x-sqlite3';

export type DriveBackupReason = 'scheduled' | 'startup' | 'exit' | 'manual';

export { isDriveBackupInProgress, isGoogleDriveConnected, disconnectGoogleDrive, getConnectedGoogleEmail };

async function driveFetch(
  client: OAuth2Client,
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = client.credentials.access_token;
  if (!token) throw new Error('Google Drive authorization expired. Connect again in Settings.');
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

async function findFolder(client: OAuth2Client, name: string, parentId?: string): Promise<string | null> {
  const escaped = name.replace(/'/g, "\\'");
  let query = `mimeType='application/vnd.google-apps.folder' and name='${escaped}' and trashed=false`;
  if (parentId) query += ` and '${parentId}' in parents`;

  const res = await driveFetch(
    client,
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`
  );
  if (!res.ok) throw new Error(await readDriveError(res));
  const data = (await res.json()) as { files?: { id: string }[] };
  return data.files?.[0]?.id ?? null;
}

async function createFolder(
  client: OAuth2Client,
  name: string,
  parentId?: string
): Promise<string> {
  const body: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) body.parents = [parentId];

  const res = await driveFetch(client, 'https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readDriveError(res));
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function ensureBackupFolder(client: OAuth2Client): Promise<string> {
  const cached = getDriveFolderId();
  if (cached) return cached;

  let folderId = await findFolder(client, BACKUP_FOLDER_NAME);
  if (!folderId) folderId = await createFolder(client, BACKUP_FOLDER_NAME);
  setDriveFolderId(folderId);
  return folderId;
}

async function readDriveError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data.error?.message ?? `Google Drive request failed (${res.status}).`;
  } catch {
    return `Google Drive request failed (${res.status}).`;
  }
}

async function uploadBackupFile(
  client: OAuth2Client,
  folderId: string,
  localPath: string,
  filename: string
): Promise<string> {
  const boundary = `pillops-${Date.now()}`;
  const metadata = JSON.stringify({
    name: filename,
    parents: [folderId],
    mimeType: BACKUP_MIME,
  });
  const fileData = fs.readFileSync(localPath);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${BACKUP_MIME}\r\n\r\n`),
    fileData,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const res = await driveFetch(
    client,
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,size',
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    }
  );
  if (!res.ok) throw new Error(await readDriveError(res));
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function listBackupFiles(client: OAuth2Client, folderId: string): Promise<DriveBackupFile[]> {
  const query = `'${folderId}' in parents and trashed=false and name contains 'pharmacy-backup-'`;
  const res = await driveFetch(
    client,
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime,size)&orderBy=createdTime desc&pageSize=100`
  );
  if (!res.ok) throw new Error(await readDriveError(res));
  const data = (await res.json()) as {
    files?: { id: string; name: string; createdTime: string; size?: string }[];
  };
  return (data.files ?? []).map((file) => ({
    id: file.id,
    name: file.name,
    createdAt: file.createdTime,
    size: Number(file.size ?? 0),
  }));
}

async function deleteDriveFile(client: OAuth2Client, fileId: string): Promise<void> {
  const res = await driveFetch(client, `https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 404) throw new Error(await readDriveError(res));
}

async function enforceRetention(client: OAuth2Client, folderId: string): Promise<void> {
  const files = await listBackupFiles(client, folderId);
  for (const file of files.slice(DRIVE_RETENTION_COUNT)) {
    await deleteDriveFile(client, file.id);
  }
}

export async function listDriveBackups(): Promise<DriveBackupFile[]> {
  const client = await getAuthorizedClient();
  const folderId = await ensureBackupFolder(client);
  const files = await listBackupFiles(client, folderId);
  return files.slice(0, DRIVE_RETENTION_COUNT);
}

export async function downloadDriveBackup(fileId: string, destPath: string): Promise<void> {
  const client = await getAuthorizedClient();
  const res = await driveFetch(client, `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  if (!res.ok) throw new Error(await readDriveError(res));
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}

export async function runDriveBackup(reason: DriveBackupReason): Promise<void> {
  if (!isGoogleDriveConnected()) return;
  if (isDriveBackupInProgress()) return;

  setDriveBackupInProgress(true);
  const tempPath = createTempBackupPath();
  try {
    copyDatabaseToPath(tempPath);
    const client = await getAuthorizedClient();
    const folderId = await ensureBackupFolder(client);
    const filename = path.basename(tempPath);
    await uploadBackupFile(client, folderId, tempPath, filename);
    await enforceRetention(client, folderId);
    recordDriveBackupSuccess(new Date().toISOString());
  } catch (err) {
    recordDriveBackupFailure(
      err instanceof Error ? err.message : 'Google Drive backup failed.',
      new Date().toISOString()
    );
    if (reason === 'manual') throw err;
  } finally {
    if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
    setDriveBackupInProgress(false);
  }
}

export function startDriveBackup(reason: DriveBackupReason): void {
  void runDriveBackup(reason);
}

export async function runDriveBackupWithTimeout(
  reason: DriveBackupReason,
  timeoutMs: number
): Promise<boolean> {
  try {
    await Promise.race([
      runDriveBackup(reason),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Backup timed out.')), timeoutMs)
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function connectDriveAccount(): Promise<string> {
  const { connectGoogleDrive } = await import('./google-drive-auth');
  const email = await connectGoogleDrive();
  setDriveConnectedEmail(email);
  return email;
}

export async function disconnectDriveAccount(): Promise<void> {
  await disconnectGoogleDrive();
  setDriveConnectedEmail(null);
  clearDriveFolderId();
}

export function buildRestoreTempPath(): string {
  return path.join(os.tmpdir(), createTempBackupFilename());
}
