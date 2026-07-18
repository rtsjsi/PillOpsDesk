import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { runMigrations } from './migrations';

let db: Database.Database | null = null;

export function getDbPath(): string {
  // Lazy-load electron so Vitest can import this module without the Electron runtime.
  const { app } = require('electron') as typeof import('electron');
  const dir = app.getPath('userData');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'pharmacy.db');
}

/** Opens an in-memory DB with migrations — for automated tests only. */
export function initTestDb(existing?: Database.Database): Database.Database {
  closeDb();
  db = existing ?? new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
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
