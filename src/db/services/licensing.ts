import crypto from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { getDb } from '../index';
import { DEFAULT_GRACE_DAYS, LICENSE_PUBLIC_KEY_PEM } from '@shared/license-public-key';
import type { LicensePayload, LicenseStatus } from '@shared/types';

const SETTING_LICENSE_KEY = 'license_key';
const SETTING_LAST_SEEN = 'license_last_seen_at';

interface StoredLicense {
  payload: LicensePayload;
  signature: string;
}

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function getWindowsMachineGuid(): string {
  const out = run(
    'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid'
  );
  const match = out.match(/MachineGuid\s+REG_SZ\s+(\S+)/i);
  return match?.[1]?.trim() ?? '';
}

function getWindowsBiosUuid(): string {
  const out = run('wmic csproduct get uuid');
  const lines = out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line.toLowerCase() !== 'uuid');
  return lines[0] ?? '';
}

function getLinuxMachineId(): string {
  for (const file of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
    try {
      const value = fs.readFileSync(file, 'utf8').trim();
      if (value) return value;
    } catch {
      // try next path
    }
  }
  return '';
}

export function getMachineId(): string {
  const parts: string[] = [];
  if (process.platform === 'win32') {
    parts.push(getWindowsBiosUuid(), getWindowsMachineGuid());
  } else if (process.platform === 'linux') {
    parts.push(getLinuxMachineId());
  } else if (process.platform === 'darwin') {
    parts.push(run('ioreg -rd1 -c IOPlatformExpertDevice | awk \'/IOPlatformUUID/ { print $3; }\'').replace(/"/g, ''));
  }
  parts.push(os.hostname());
  const raw = parts.filter(Boolean).join('|') || 'unknown-host';
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function canonicalPayload(payload: LicensePayload): string {
  return JSON.stringify({
    pharmacy_id: payload.pharmacy_id,
    pharmacy_name: payload.pharmacy_name,
    machine_id: payload.machine_id,
    issued: payload.issued,
    expires: payload.expires,
    grace_days: payload.grace_days,
  });
}

function verifySignature(payload: LicensePayload, signatureHex: string): boolean {
  try {
    const data = Buffer.from(canonicalPayload(payload), 'utf8');
    const signature = Buffer.from(signatureHex, 'hex');
    return crypto.verify(
      'RSA-SHA256',
      data,
      LICENSE_PUBLIC_KEY_PEM,
      signature
    );
  } catch {
    return false;
  }
}

function parseLicenseKey(licenseKey: string): StoredLicense {
  let decoded: string;
  try {
    decoded = Buffer.from(licenseKey.trim(), 'base64url').toString('utf8');
  } catch {
    throw new Error('Invalid license key format.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error('Invalid license key format.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid license key format.');
  }

  const record = parsed as { payload?: LicensePayload; signature?: string };
  const payload = record.payload;
  const signature = record.signature;

  if (!payload || typeof signature !== 'string') {
    throw new Error('Invalid license key format.');
  }

  if (
    !payload.pharmacy_id?.trim() ||
    !payload.pharmacy_name?.trim() ||
    !payload.machine_id?.trim() ||
    !payload.issued?.trim() ||
    !payload.expires?.trim()
  ) {
    throw new Error('License is missing required fields.');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.issued) || !/^\d{4}-\d{2}-\d{2}$/.test(payload.expires)) {
    throw new Error('License dates must use YYYY-MM-DD format.');
  }

  payload.pharmacy_id = payload.pharmacy_id.trim();
  payload.pharmacy_name = payload.pharmacy_name.trim();
  payload.machine_id = payload.machine_id.trim();
  payload.grace_days =
    typeof payload.grace_days === 'number' && payload.grace_days >= 0
      ? payload.grace_days
      : DEFAULT_GRACE_DAYS;

  if (!verifySignature(payload, signature)) {
    throw new Error('License signature is invalid.');
  }

  return { payload, signature };
}

function readSetting(key: string): string {
  const row = getDb()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string | null } | undefined;
  return row?.value ?? '';
}

function writeSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(isoDate + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + 'T00:00:00Z').getTime();
  const to = new Date(toIso + 'T00:00:00Z').getTime();
  return Math.round((to - from) / 86_400_000);
}

function loadStoredLicense(): StoredLicense | null {
  const licenseKey = readSetting(SETTING_LICENSE_KEY);
  if (!licenseKey) return null;
  try {
    return parseLicenseKey(licenseKey);
  } catch {
    return null;
  }
}

function detectClockTamper(today: string): boolean {
  const lastSeen = readSetting(SETTING_LAST_SEEN);
  if (!lastSeen) return false;
  return daysBetween(today, lastSeen) < -1;
}

function touchLastSeen(today: string): void {
  const lastSeen = readSetting(SETTING_LAST_SEEN);
  const next = !lastSeen || today > lastSeen ? today : lastSeen;
  writeSetting(SETTING_LAST_SEEN, next);
}

function buildStatus(
  state: LicenseStatus['state'],
  message: string,
  extra: Partial<LicenseStatus> = {}
): LicenseStatus {
  return {
    state,
    machineId: getMachineId(),
    message,
    ...extra,
  };
}

export function getLicenseStatus(): LicenseStatus {
  const today = todayUtc();
  const machineId = getMachineId();

  if (detectClockTamper(today)) {
    return buildStatus(
      'blocked',
      'System date appears incorrect. Restore the correct date or contact support.',
      { clockTampered: true }
    );
  }

  const stored = loadStoredLicense();
  if (!stored) {
    const rawKey = readSetting(SETTING_LICENSE_KEY);
    if (rawKey) {
      return buildStatus(
        'blocked',
        'The installed license is invalid. Enter a valid license key to continue.'
      );
    }
    return buildStatus(
      'unlicensed',
      'Enter your license key to activate Pharmacy Store on this computer.'
    );
  }

  const { payload } = stored;

  if (payload.machine_id !== machineId) {
    return buildStatus(
      'blocked',
      'This license is registered to a different computer. Contact support to transfer it.',
      {
        pharmacyId: payload.pharmacy_id,
        pharmacyName: payload.pharmacy_name,
        expires: payload.expires,
      }
    );
  }

  if (daysBetween(today, payload.issued) < -1) {
    return buildStatus(
      'blocked',
      'This license is not valid yet. Check the system date or contact support.',
      {
        pharmacyId: payload.pharmacy_id,
        pharmacyName: payload.pharmacy_name,
        expires: payload.expires,
      }
    );
  }

  const graceDays = payload.grace_days ?? DEFAULT_GRACE_DAYS;
  const graceEnds = addDays(payload.expires, graceDays);
  const daysRemaining = daysBetween(today, payload.expires);

  if (today > graceEnds) {
    touchLastSeen(today);
    return buildStatus(
      'readonly',
      'Subscription expired. You can view records and reports, but billing and stock changes are disabled until you renew.',
      {
        pharmacyId: payload.pharmacy_id,
        pharmacyName: payload.pharmacy_name,
        expires: payload.expires,
        graceEnds,
        daysRemaining,
        readOnly: true,
      }
    );
  }

  if (today > payload.expires) {
    touchLastSeen(today);
    const graceDaysLeft = daysBetween(today, graceEnds);
    return buildStatus(
      'grace',
      `Subscription expired on ${payload.expires}. Renew within ${graceDaysLeft} day(s) to avoid interruption.`,
      {
        pharmacyId: payload.pharmacy_id,
        pharmacyName: payload.pharmacy_name,
        expires: payload.expires,
        graceEnds,
        daysRemaining,
      }
    );
  }

  touchLastSeen(today);
  return buildStatus(
    'active',
    daysRemaining <= 30
      ? `Subscription active. Renews on ${payload.expires} (${daysRemaining} day(s) left).`
      : `Subscription active until ${payload.expires}.`,
    {
      pharmacyId: payload.pharmacy_id,
      pharmacyName: payload.pharmacy_name,
      expires: payload.expires,
      graceEnds,
      daysRemaining,
    }
  );
}

export function activateLicense(licenseKey: string): LicenseStatus {
  const parsed = parseLicenseKey(licenseKey);
  const machineId = getMachineId();

  if (parsed.payload.machine_id !== machineId) {
    throw new Error(
      'This license is for a different computer. Send your Machine ID to support and request a matching license.'
    );
  }

  writeSetting(SETTING_LICENSE_KEY, licenseKey.trim());
  writeSetting(SETTING_LAST_SEEN, todayUtc());

  const status = getLicenseStatus();
  if (status.state === 'blocked') {
    throw new Error(status.message);
  }
  return status;
}

/** Allows active, grace, and read-only modes (viewing and login). */
export function assertAppUsable(): void {
  const status = getLicenseStatus();
  if (status.state === 'unlicensed' || status.state === 'blocked') {
    throw new Error(status.message);
  }
}

/** Blocks writes when unlicensed, blocked, or read-only (post-grace expiry). */
export function assertWriteAllowed(): void {
  const status = getLicenseStatus();
  if (status.state === 'unlicensed' || status.state === 'blocked') {
    throw new Error(status.message);
  }
  if (status.state === 'readonly') {
    throw new Error(
      'Subscription expired. Renew your license in Settings to resume billing and stock updates.'
    );
  }
}
