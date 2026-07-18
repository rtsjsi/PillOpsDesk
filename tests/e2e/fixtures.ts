import { test as base, type ElectronApplication, type Page } from '@playwright/test';
import {
  e2eSkipReason,
  launchApp,
  loginToApp,
} from './helpers/app';

type Fixtures = {
  electronApp: ElectronApplication;
  authedPage: Page;
};

export const test = base.extend<Fixtures>({
  electronApp: async ({}, use, testInfo) => {
    const reason = e2eSkipReason();
    if (reason) {
      testInfo.skip(true, reason);
    }
    const app = await launchApp();
    await use(app);
    await app.close();
  },

  authedPage: async ({ electronApp }, use) => {
    const page = await loginToApp(electronApp);
    await use(page);
  },
});

export { expect } from '@playwright/test';
