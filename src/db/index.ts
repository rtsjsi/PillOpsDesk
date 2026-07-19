import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { runMigrations } from './migrations';

let db: Database.Database | null = null;

export function getDbPath(): string {
  // Lazy-load electron so this module can be required without the Electron runtime
  // in tooling that only needs the path helpers at typecheck time.
  const { app } = require('electron') as typeof import('electron');
  const dir = app.getPath('userData');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'pharmacy.db');
}

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(getDbPath());
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
