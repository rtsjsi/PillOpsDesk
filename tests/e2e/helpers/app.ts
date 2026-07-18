import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type ElectronApplication, type Page, _electron as electron } from '@playwright/test';

const ROOT = path.resolve(__dirname, '../../..');

export interface E2ECredentials {
  username: string;
  pin: string;
  licenseKey?: string;
}

export function getCredentials(): E2ECredentials {
  const username = process.env.E2E_USERNAME?.trim();
  const pin = process.env.E2E_PIN?.trim();
  if (!username || !pin) {
    throw new Error(
      'E2E credentials missing. Copy .env.test.example to .env.test and set E2E_USERNAME and E2E_PIN.'
    );
  }
  return {
    username,
    pin,
    licenseKey: process.env.E2E_LICENSE_KEY?.trim(),
  };
}

export function resolvePackagedApp(): string {
  const candidates = [
    path.join(ROOT, 'out', 'release', 'PillOpsDesk-win32-x64', 'pillopsdesk.exe'),
    path.join(ROOT, 'out', 'release', 'dist', 'pillopsdesk.exe'),
    path.join(ROOT, 'out', 'PillOpsDesk-win32-x64', 'pillopsdesk.exe'),
    path.join(ROOT, 'out', 'release', 'PillOpsDesk-win32-x64', 'PillOpsDesk.exe'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    'Packaged PillOpsDesk app not found. Run: npm run package:e2e'
  );
}

/** Copy profile so tests do not lock the live SQLite DB the dev app may be using. */
export function prepareUserDataDir(): string {
  const runRoot = path.join(ROOT, 'tests', 'e2e', '.user-data-run');
  fs.mkdirSync(runRoot, { recursive: true });

  const isolated = path.join(runRoot, String(Date.now()));
  fs.mkdirSync(isolated, { recursive: true });

  const source = process.env.E2E_USER_DATA?.trim()
    ? path.resolve(process.env.E2E_USER_DATA.trim())
    : '';

  if (source && fs.existsSync(source)) {
    fs.cpSync(source, isolated, {
      recursive: true,
      filter: (src) => {
        const base = path.basename(src).toLowerCase();
        return (
          !base.endsWith('-wal') &&
          !base.endsWith('-shm') &&
          !base.endsWith('.lock') &&
          base !== 'lockfile'
        );
      },
    });
  }

  return isolated;
}

export async function launchApp(): Promise<ElectronApplication> {
  const executablePath = resolvePackagedApp();
  const userDataDir = prepareUserDataDir();

  return electron.launch({
    executablePath,
    cwd: path.dirname(executablePath),
    args: [`--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
    },
    timeout: 120_000,
  });
}

export async function getMainPage(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow({ timeout: 60_000 });
  await page.waitForLoadState('load');
  return page;
}

/** Wait until boot spinner finishes and a known screen is shown. */
export async function waitForAppShell(page: Page): Promise<'login' | 'activate' | 'dashboard'> {
  await page.waitForFunction(
    () => {
      const text = document.body?.innerText ?? '';
      return (
        text.includes('Sign in to continue') ||
        text.includes('Create the owner account') ||
        text.includes('Activate PillOpsDesk') ||
        text.includes('Dashboard') ||
        text.includes("Today's Sales")
      );
    },
    { timeout: 90_000 }
  );

  const text = await page.locator('body').innerText();
  if (text.includes('Dashboard') || text.includes("Today's Sales")) return 'dashboard';
  if (text.includes('Activate PillOpsDesk')) return 'activate';
  return 'login';
}

export async function activateLicenseIfNeeded(
  page: Page,
  licenseKey?: string
): Promise<void> {
  const state = await waitForAppShell(page);
  if (state !== 'activate') return;

  if (!licenseKey) {
    throw new Error(
      'App is unlicensed. Set E2E_LICENSE_KEY in .env.test, or point E2E_USER_DATA at an already-activated profile.'
    );
  }

  await page.locator('textarea').fill(licenseKey);
  await page.getByRole('button', { name: /Activate License/i }).click();
  await waitForAppShell(page);
}

export async function login(page: Page, username: string, pin: string): Promise<void> {
  let state = await waitForAppShell(page);
  if (state === 'dashboard') return;

  if (state === 'activate') {
    throw new Error('Still on license activation — set E2E_USER_DATA or E2E_LICENSE_KEY.');
  }

  const form = page.locator('form').filter({
    has: page.getByRole('button', { name: /Sign in|Create account/i }),
  });
  await form.locator('input.input').first().fill(username);
  await form.locator('input[type="password"]').fill(pin);
  await form.getByRole('button', { name: /Sign in|Create account/i }).click();

  await page.waitForFunction(
    () => (document.body?.innerText ?? '').includes('Dashboard'),
    { timeout: 30_000 }
  );
}

export async function loginToApp(app: ElectronApplication): Promise<Page> {
  const creds = getCredentials();
  const page = await getMainPage(app);
  await activateLicenseIfNeeded(page, creds.licenseKey);
  await login(page, creds.username, creds.pin);
  return page;
}

export async function navTo(page: Page, label: string): Promise<void> {
  await page.getByRole('link', { name: label }).click();
}

export function e2eSkipReason(): string | null {
  if (!process.env.E2E_USERNAME?.trim() || !process.env.E2E_PIN?.trim()) {
    return 'Set E2E_USERNAME and E2E_PIN in .env.test';
  }
  try {
    resolvePackagedApp();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Packaged app missing';
  }
}

/** Windows default Electron userData for this app (dev / installed). */
export function defaultWindowsUserData(): string {
  return path.join(os.homedir(), 'AppData', 'Roaming', 'pillopsdesk');
}
