import crypto from 'node:crypto';
import { getDb } from '../index';
import type { User } from '@shared/types';

function hashPin(pin: string, salt: string): string {
  return crypto.scryptSync(pin, salt, 64).toString('hex');
}

export function hasUsers(): boolean {
  const row = getDb().prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
  return row.c > 0;
}

export function registerUser(
  username: string,
  pin: string,
  role: 'owner' | 'staff'
): User {
  const db = getDb();
  const trimmed = username.trim();
  if (!trimmed) throw new Error('Username is required.');
  const existing = db
    .prepare('SELECT id FROM users WHERE username = ?')
    .get(trimmed) as { id: number } | undefined;
  if (existing) throw new Error(`Username "${trimmed}" is already taken.`);

  const salt = crypto.randomBytes(16).toString('hex');
  const pinHash = hashPin(pin, salt);
  const info = db
    .prepare('INSERT INTO users (username, pin_hash, salt, role) VALUES (?, ?, ?, ?)')
    .run(trimmed, pinHash, salt, role);
  return db
    .prepare('SELECT id, username, role, created_at FROM users WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as User;
}

export function login(username: string, pin: string): User | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(username.trim()) as
    | { id: number; username: string; pin_hash: string; salt: string; role: string; created_at: string }
    | undefined;
  if (!row) return null;
  const candidate = hashPin(pin, row.salt);
  const ok =
    candidate.length === row.pin_hash.length &&
    crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(row.pin_hash));
  if (!ok) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role as 'owner' | 'staff',
    created_at: row.created_at,
  };
}

export function listUsers(): User[] {
  return getDb()
    .prepare('SELECT id, username, role, created_at FROM users ORDER BY username')
    .all() as User[];
}

export function getUser(id: number): User | null {
  const row = getDb()
    .prepare('SELECT id, username, role, created_at FROM users WHERE id = ?')
    .get(id) as User | undefined;
  return row ?? null;
}

export function deleteUser(id: number): void {
  getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
}
