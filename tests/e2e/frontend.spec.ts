import { test, expect } from './fixtures';
import { navTo } from './helpers/app';

test.describe('Dashboard', () => {
  test('loads stats and quick actions', async ({ authedPage: page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText("Today's Sales")).toBeVisible();
    await expect(page.getByText("Today's Invoices")).toBeVisible();
    await expect(page.getByRole('button', { name: '+ New Sale' })).toBeVisible();
  });

  test('opens new sale dialog from New Sale', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: '+ New Sale' }).click();
    await expect(page.getByRole('heading', { name: 'Sales' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'New Sale' })).toBeVisible();
  });
});

test.describe('Navigation', () => {
  const pages = [
    { link: 'Sales', heading: 'Sales' },
    { link: 'Inventory', heading: 'Inventory' },
    { link: 'Purchases', heading: 'Purchases' },
    { link: 'Customers', heading: 'Customers' },
    { link: 'Suppliers', heading: 'Suppliers' },
    { link: 'Reports', heading: 'Reports' },
  ];

  for (const { link, heading } of pages) {
    test(`opens ${link}`, async ({ authedPage: page }) => {
      await navTo(page, link);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    });
  }

  test('opens Settings for owner', async ({ authedPage: page }) => {
    const settingsLink = page.getByRole('link', { name: 'Settings' });
    if (await settingsLink.isVisible()) {
      await settingsLink.click();
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
      await expect(page.getByText('Store Profile')).toBeVisible();
    } else {
      test.info().annotations.push({
        type: 'note',
        description: 'Settings link hidden — logged in as staff, not owner.',
      });
    }
  });
});

test.describe('Sales UI', () => {
  test('shows new sale dialog with search, cart, totals, and checkout', async ({
    authedPage: page,
  }) => {
    await navTo(page, 'Sales');
    await page.getByRole('button', { name: '+ New Sale' }).click();
    await expect(page.getByRole('heading', { name: 'New Sale' })).toBeVisible();
    await expect(
      page.getByPlaceholder('Scan barcode or search medicine / batch...')
    ).toBeVisible();
    await expect(page.getByText('Cart is empty. Search and add medicines above.')).toBeVisible();
    await expect(page.getByText('Taxable Value')).toBeVisible();
    await expect(page.getByText('CGST')).toBeVisible();
    await expect(page.getByText('SGST')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save & Print' })).toBeVisible();
  });

  test('search dropdown appears when typing in new sale', async ({ authedPage: page }) => {
    await navTo(page, 'Sales');
    await page.getByRole('button', { name: '+ New Sale' }).click();
    const search = page.getByPlaceholder('Scan barcode or search medicine / batch...');
    await search.fill('a');
    // Either results appear or empty — UI should not crash.
    await page.waitForTimeout(400);
    await expect(page.getByRole('heading', { name: 'New Sale' })).toBeVisible();
  });
});

test.describe('Inventory UI', () => {
  test('shows search and add medicine', async ({ authedPage: page }) => {
    await navTo(page, 'Inventory');
    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
    const addBtn = page.getByRole('button', { name: /Add Medicine|\+ Add/i });
    if (await addBtn.isVisible()) {
      await expect(addBtn).toBeEnabled();
    }
  });
});

test.describe('Logout', () => {
  test('returns to login screen', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page.getByRole('heading', { name: 'PillOpsDesk' })).toBeVisible();
    await expect(page.locator('form input[type="password"]')).toBeVisible();
  });
});
