import type { DriveBackupReason } from '../db/services/google-drive';
import {
  getDriveBackupSettings,
  getLastDriveBackupAt,
  hoursSinceLastBackup,
  isDailyBackupDue,
} from '../db/services/drive-settings';
import {
  isGoogleDriveConnected,
  runDriveBackupWithTimeout,
  startDriveBackup,
} from '../db/services/google-drive';

const TICK_MS = 60_000;
const STARTUP_DELAY_MS = 30_000;
const EXIT_BACKUP_TIMEOUT_MS = 30_000;
const STARTUP_CATCHUP_HOURS = 24;
const EXIT_CATCHUP_HOURS = 12;

let timer: NodeJS.Timeout | null = null;
let startupTimer: NodeJS.Timeout | null = null;
let exitBackupStarted = false;

function shouldRunAutoBackup(): boolean {
  if (!isGoogleDriveConnected()) return false;
  const settings = getDriveBackupSettings();
  if (!settings.auto_enabled) return false;
  return isDailyBackupDue(settings.auto_time, getLastDriveBackupAt());
}

function shouldRunCatchup(minHours: number): boolean {
  if (!isGoogleDriveConnected()) return false;
  const settings = getDriveBackupSettings();
  if (!settings.auto_enabled) return false;
  const hours = hoursSinceLastBackup(getLastDriveBackupAt());
  return hours === null || hours >= minHours;
}

function tick(): void {
  if (shouldRunAutoBackup()) {
    startDriveBackup('scheduled');
  }
}

export function startDriveBackupScheduler(): void {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);

  startupTimer = setTimeout(() => {
    if (shouldRunCatchup(STARTUP_CATCHUP_HOURS)) {
      startDriveBackup('startup');
    }
  }, STARTUP_DELAY_MS);
}

export function stopDriveBackupScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
}

export function needsExitDriveBackup(): boolean {
  return shouldRunCatchup(EXIT_CATCHUP_HOURS);
}

export async function runExitDriveBackupIfNeeded(): Promise<boolean> {
  if (exitBackupStarted) return false;
  if (!shouldRunCatchup(EXIT_CATCHUP_HOURS)) return false;

  exitBackupStarted = true;
  return runDriveBackupWithTimeout('exit', EXIT_BACKUP_TIMEOUT_MS);
}

export function triggerManualDriveBackup(): void {
  startDriveBackup('manual');
}

export function triggerDriveBackupForReason(reason: DriveBackupReason): void {
  startDriveBackup(reason);
}
