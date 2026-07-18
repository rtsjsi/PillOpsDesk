import { test, expect } from '@playwright/test';
import {
  defaultWindowsUserData,
  getMainPage,
  launchApp,
  resolvePackagedApp,
  waitForAppShell,
} from './helpers/app';

test.describe('Smoke (no credentials)', () => {
  test('packaged app exists', () => {
    expect(resolvePackagedApp()).toMatch(/pillopsdesk\.exe$/i);
  });

  test('launches and shows login or dashboard shell', async () => {
    if (!process.env.E2E_USER_DATA?.trim()) {
      process.env.E2E_USER_DATA = defaultWindowsUserData();
    }

    const app = await launchApp();
    try {
      const page = await getMainPage(app);
      const state = await waitForAppShell(page);
      expect(['login', 'activate', 'dashboard']).toContain(state);
    } finally {
      await app.close();
    }
  });
});
