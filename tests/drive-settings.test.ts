import { describe, expect, it } from 'vitest';
import { isDailyBackupDue } from '../src/db/services/drive-settings';

describe('isDailyBackupDue', () => {
  it('returns false before the scheduled time', () => {
    const now = new Date(2026, 6, 18, 21, 0, 0);
    expect(isDailyBackupDue('22:30', null, now)).toBe(false);
  });

  it('returns true after the scheduled time when no backup exists', () => {
    const now = new Date(2026, 6, 18, 23, 0, 0);
    expect(isDailyBackupDue('22:30', null, now)).toBe(true);
  });

  it('returns false when a backup already ran after the scheduled time today', () => {
    const now = new Date(2026, 6, 18, 23, 0, 0);
    const last = new Date(2026, 6, 18, 22, 45, 0).toISOString();
    expect(isDailyBackupDue('22:30', last, now)).toBe(false);
  });

  it('returns true when the last backup was before today scheduled time', () => {
    const now = new Date(2026, 6, 18, 23, 0, 0);
    const last = new Date(2026, 6, 17, 22, 45, 0).toISOString();
    expect(isDailyBackupDue('22:30', last, now)).toBe(true);
  });
});
