import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getDb, getDbPath } from './index';

/** Flush WAL and copy the live database to a new file path. */
export function copyDatabaseToPath(destPath: string): void {
  getDb().pragma('wal_checkpoint(TRUNCATE)');
  fs.copyFileSync(getDbPath(), destPath);
}

export function createTempBackupFilename(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `pharmacy-backup-${stamp}.db`;
}

export function createTempBackupPath(): string {
  return path.join(os.tmpdir(), createTempBackupFilename());
}
