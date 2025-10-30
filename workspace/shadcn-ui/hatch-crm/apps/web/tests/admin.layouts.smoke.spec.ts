import { expect, test } from '@playwright/test';

const RUN_E2E = process.env.RUN_E2E_TESTS === 'true';

const CONTACTS_OPTION_VALUE = 'contacts';

test.describe('Admin layouts smoke', () => {
  test.skip(!RUN_E2E, 'Enable RUN_E2E_TESTS=true to execute layout editor smoke tests.');

  test('hiding the contacts email column removes it from the list', async ({ page }) => {
    const ensureEmailVisibility = async (visible: boolean) => {
      await page.goto('/admin/layouts');
      await page.waitForLoadState('networkidle');
      await page.getByLabel('Object').selectOption(CONTACTS_OPTION_VALUE);
      await page.getByLabel('Layout type').selectOption('list');

      const emailRow = page.getByRole('listitem').filter({ hasText: /Email/i });
      const checkbox = emailRow.getByRole('checkbox');
      const isChecked = await checkbox.isChecked();

      if (isChecked !== visible) {
        if (visible) {
          await checkbox.check();
        } else {
          await checkbox.uncheck();
        }
        await page.getByRole('button', { name: /save layout/i }).click();
        await page.waitForLoadState('networkidle');
      }
    };

    // Ensure baseline layout shows email
    await ensureEmailVisibility(true);

    // Hide email column
    await page.goto('/admin/layouts');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Object').selectOption(CONTACTS_OPTION_VALUE);
    await page.getByLabel('Layout type').selectOption('list');

    const emailRow = page.getByRole('listitem').filter({ hasText: /Email/i });
    await emailRow.getByRole('checkbox').uncheck();
    await page.getByRole('button', { name: /save layout/i }).click();
    await page.waitForLoadState('networkidle');

    await page.goto('/contacts');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('columnheader', { name: /Email/i })).toHaveCount(0);

    // Restore original layout to avoid impacting other tests
    await ensureEmailVisibility(true);

    await page.goto('/contacts');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('columnheader', { name: /Email/i })).toHaveCount(1);
  });
});
