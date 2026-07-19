import type { DriveBackupSettings } from '@shared/types';
import { restoreDatabaseFromPath } from './backup';
import {
  buildRestoreTempPath,
  connectDriveAccount,
  disconnectDriveAccount,
  downloadDriveBackup,
  getLatestDriveBackup,
  listDriveBackups,
  startDriveBackup,
} from '../db/services/google-drive';
import {
  getDriveBackupStatus,
  saveDriveBackupSettings,
} from '../db/services/drive-settings';
import { isGoogleDriveConnected } from '../db/services/google-drive-auth';
import { dialog } from 'electron';

export function getDriveStatus() {
  return getDriveBackupStatus(isGoogleDriveConnected());
}

export async function connectDrive() {
  await connectDriveAccount();
  return getDriveBackupStatus(true);
}

export async function disconnectDrive() {
  await disconnectDriveAccount();
  return getDriveBackupStatus(false);
}

export function saveDriveSettings(settings: DriveBackupSettings) {
  saveDriveBackupSettings(settings);
  return getDriveBackupStatus(isGoogleDriveConnected());
}

export function backupToDriveNow() {
  if (!isGoogleDriveConnected()) {
    throw new Error('Connect Google Drive in Settings before backing up.');
  }
  startDriveBackup('manual');
  return { started: true as const };
}

export function listCloudBackups() {
  return listDriveBackups();
}

export async function restoreFromDrive(): Promise<boolean> {
  const latest = await getLatestDriveBackup();
  const confirm = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Cancel', 'Restore & Restart'],
    defaultId: 1,
    cancelId: 0,
    message: 'Restore latest Google Drive backup?',
    detail: `This will replace all current data with "${latest.name}" (${latest.createdAt}). The app will restart. This cannot be undone.`,
  });
  if (confirm.response !== 1) return false;

  const tempPath = buildRestoreTempPath();
  await downloadDriveBackup(latest.id, tempPath);
  restoreDatabaseFromPath(tempPath);
}
