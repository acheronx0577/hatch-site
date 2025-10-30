import { expect, test } from '@playwright/test';

const RUN_E2E = process.env.RUN_E2E_TESTS === 'true';

test.describe('Admin audit viewer smoke', () => {
  test.skip(!RUN_E2E, 'Enable RUN_E2E_TESTS=true to exercise admin audit smoke tests.');

  test('loads audit entries and applies filters', async ({ page }) => {
    await page.goto('/admin/audit');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /Audit Log/i })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();

    await page.getByLabel('Object').fill('accounts');
    await page.getByLabel('Action').selectOption('CREATE');
    await page.getByLabel('From').fill('2024-01-01');
    await page.getByLabel('To').fill('2024-12-31');

    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('table')).toBeVisible();
  });
});
