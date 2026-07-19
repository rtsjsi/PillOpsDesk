let backupInProgress = false;

export function isDriveBackupInProgress(): boolean {
  return backupInProgress;
}

export function setDriveBackupInProgress(value: boolean): void {
  backupInProgress = value;
}
