import { app, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { closeDb, getDb, getDbPath } from '../db';

export async function backupDatabase(): Promise<string | null> {
  // Ensure any pending WAL data is written to the main db file.
  getDb().pragma('wal_checkpoint(TRUNCATE)');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const result = await dialog.showSaveDialog({
    title: 'Save Database Backup',
    defaultPath: path.join(
      app.getPath('documents'),
      `pharmacy-backup-${stamp}.db`
    ),
    filters: [{ name: 'Database', extensions: ['db'] }],
  });

  if (result.canceled || !result.filePath) return null;
  fs.copyFileSync(getDbPath(), result.filePath);
  return result.filePath;
}

export async function restoreDatabase(): Promise<boolean> {
  const result = await dialog.showOpenDialog({
    title: 'Select Backup to Restore',
    properties: ['openFile'],
    filters: [{ name: 'Database', extensions: ['db'] }],
  });

  if (result.canceled || !result.filePaths.length) return false;

  const source = result.filePaths[0];
  const confirm = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Cancel', 'Restore & Restart'],
    defaultId: 1,
    cancelId: 0,
    message: 'Restore database?',
    detail:
      'This will replace all current data with the backup. The app will restart. This cannot be undone.',
  });
  if (confirm.response !== 1) return false;

  const dbPath = getDbPath();
  closeDb();
  // Remove WAL/SHM side files so the restored db is authoritative.
  for (const ext of ['', '-wal', '-shm']) {
    const p = dbPath + ext;
    if (fs.existsSync(p)) fs.rmSync(p);
  }
  fs.copyFileSync(source, dbPath);

  app.relaunch();
  app.exit(0);
  return true;
}

export async function exportCsv(filename: string, csv: string): Promise<boolean> {
  const result = await dialog.showSaveDialog({
    title: 'Export CSV',
    defaultPath: path.join(app.getPath('documents'), filename),
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, csv, 'utf-8');
  return true;
}
