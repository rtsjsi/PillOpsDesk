import { getDb } from '../index';
import type { Settings } from '@shared/types';

export function getSettings(): Settings {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string | null;
  }[];
  const map = new Map(rows.map((r) => [r.key, r.value ?? '']));
  return {
    store_name: map.get('store_name') ?? 'My Pharmacy',
    address: map.get('address') ?? '',
    phone: map.get('phone') ?? '',
    gstin: map.get('gstin') ?? '',
    dl_no: map.get('dl_no') ?? '',
    invoice_prefix: map.get('invoice_prefix') ?? 'INV',
    expiry_alert_days: parseInt(map.get('expiry_alert_days') ?? '90', 10) || 90,
  };
}

export function saveSettings(settings: Settings): Settings {
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  const tx = db.transaction(() => {
    upsert.run('store_name', settings.store_name);
    upsert.run('address', settings.address);
    upsert.run('phone', settings.phone);
    upsert.run('gstin', settings.gstin);
    upsert.run('dl_no', settings.dl_no);
    upsert.run('invoice_prefix', settings.invoice_prefix);
    upsert.run('expiry_alert_days', String(settings.expiry_alert_days));
  });
  tx();
  return getSettings();
}
