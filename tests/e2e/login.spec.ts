import { test, expect } from '@playwright/test';
import {
  getCredentials,
  getMainPage,
  launchApp,
  login,
  waitForAppShell,
} from './helpers/app';

test.describe('Login page', () => {
  test('shows username, password, and sign-in button', async () => {
    const app = await launchApp();
    try {
      const page = await getMainPage(app);
      const state = await waitForAppShell(page);
      expect(state).toBe('login');

      await expect(page.getByRole('heading', { name: 'PillOpsDesk' })).toBeVisible();
      await expect(page.getByText('Sign in to continue')).toBeVisible();

      const form = page.locator('form').filter({
        has: page.getByRole('button', { name: /Sign in|Create account/i }),
      });
      await expect(form.locator('input.input').first()).toBeVisible();
      await expect(form.locator('input[type="password"]')).toBeVisible();
      await expect(form.getByRole('button', { name: /Sign in/i })).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test('logs in with valid credentials and opens Dashboard', async () => {
    const { username, pin } = getCredentials();
    const app = await launchApp();
    try {
      const page = await getMainPage(app);
      await waitForAppShell(page);
      await login(page, username, pin);

      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
      await expect(page.getByText("Today's Sales")).toBeVisible();
      await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
      await expect(page.getByText(username)).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test('shows error toast for wrong PIN', async () => {
    const { username } = getCredentials();
    const app = await launchApp();
    try {
      const page = await getMainPage(app);
      await waitForAppShell(page);

      const form = page.locator('form').filter({
        has: page.getByRole('button', { name: /Sign in|Create account/i }),
      });
      await form.locator('input.input').first().fill(username);
      await form.locator('input[type="password"]').fill('wrong-pin-000');
      await form.getByRole('button', { name: /Sign in/i }).click();

      await expect(page.getByText('Invalid username or PIN.')).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByRole('heading', { name: 'Dashboard' })).not.toBeVisible();
    } finally {
      await app.close();
    }
  });
});
