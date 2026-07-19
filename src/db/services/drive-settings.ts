import { getDb } from '../index';
import type { DriveBackupSettings, DriveBackupStatus } from '@shared/types';
import { isGoogleDriveConfigured } from '@shared/google-oauth-config';
import { isDriveBackupInProgress } from './drive-backup-state';

const DEFAULT_AUTO_TIME = '22:30';

function readSetting(key: string): string | null {
  const row = getDb()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string | null } | undefined;
  return row?.value ?? null;
}

function writeSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value);
}

export function getDriveBackupSettings(): DriveBackupSettings {
  return {
    auto_enabled: readSetting('drive_auto_enabled') !== 'false',
    auto_time: readSetting('drive_auto_time') ?? DEFAULT_AUTO_TIME,
  };
}

export function saveDriveBackupSettings(settings: DriveBackupSettings): DriveBackupSettings {
  const normalized = normalizeDriveSettings(settings);
  writeSetting('drive_auto_enabled', normalized.auto_enabled ? 'true' : 'false');
  writeSetting('drive_auto_time', normalized.auto_time);
  return normalized;
}

export function getDriveFolderId(): string | null {
  return readSetting('drive_folder_id');
}

export function setDriveFolderId(folderId: string): void {
  writeSetting('drive_folder_id', folderId);
}

export function clearDriveFolderId(): void {
  getDb().prepare('DELETE FROM settings WHERE key = ?').run('drive_folder_id');
}

export function setDriveConnectedEmail(email: string | null): void {
  if (email) writeSetting('drive_connected_email', email);
  else getDb().prepare('DELETE FROM settings WHERE key = ?').run('drive_connected_email');
}

export function recordDriveBackupSuccess(at: string): void {
  writeSetting('drive_last_backup_at', at);
  getDb().prepare('DELETE FROM settings WHERE key = ?').run('drive_last_error');
  getDb().prepare('DELETE FROM settings WHERE key = ?').run('drive_last_error_at');
}

export function recordDriveBackupFailure(message: string, at: string): void {
  writeSetting('drive_last_error', message);
  writeSetting('drive_last_error_at', at);
}

export function getDriveBackupStatus(connected: boolean): DriveBackupStatus {
  const settings = getDriveBackupSettings();
  return {
    configured: isGoogleDriveConfigured(),
    connected,
    accountEmail: readSetting('drive_connected_email'),
    auto_enabled: settings.auto_enabled,
    auto_time: settings.auto_time,
    lastBackupAt: readSetting('drive_last_backup_at'),
    lastError: readSetting('drive_last_error'),
    backupInProgress: isDriveBackupInProgress(),
  };
}

export function normalizeDriveSettings(settings: DriveBackupSettings): DriveBackupSettings {
  const match = /^(\d{1,2}):(\d{2})$/.exec(settings.auto_time.trim());
  if (!match) {
    return { ...settings, auto_time: DEFAULT_AUTO_TIME };
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return { ...settings, auto_time: DEFAULT_AUTO_TIME };
  }
  return {
    auto_enabled: settings.auto_enabled,
    auto_time: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
  };
}

export function getLastDriveBackupAt(): string | null {
  return readSetting('drive_last_backup_at');
}

export function hoursSinceLastBackup(lastBackupAt: string | null): number | null {
  if (!lastBackupAt) return null;
  const last = new Date(lastBackupAt).getTime();
  if (Number.isNaN(last)) return null;
  return (Date.now() - last) / (1000 * 60 * 60);
}

export function isDailyBackupDue(autoTime: string, lastBackupAt: string | null, now = new Date()): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(autoTime);
  if (!match) return false;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const scheduled = new Date(now);
  scheduled.setHours(hours, minutes, 0, 0);

  if (now < scheduled) return false;
  if (!lastBackupAt) return true;

  const last = new Date(lastBackupAt);
  if (Number.isNaN(last.getTime())) return true;
  return last < scheduled;
}
