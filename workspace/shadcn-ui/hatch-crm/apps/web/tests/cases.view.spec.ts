import { test } from '@playwright/test';

const RUN_E2E = process.env.RUN_E2E_TESTS === 'true';

test.describe.configure({ mode: 'serial' });

test.describe('Cases UI', () => {
  test.skip(!RUN_E2E, 'Set RUN_E2E_TESTS=true to enable.');

  test('renders list and detail views', async ({ page }) => {
    await page.goto('/cases');
    await page.waitForLoadState('networkidle');

    const firstRow = page.locator('table tbody tr').first();
    await firstRow.waitFor();

    const detailLink = firstRow.locator('td').first().locator('a');
    const href = await detailLink.getAttribute('href');
    if (!href) {
      test.skip(true, 'No cases available to drill into.');
    }

    await detailLink.click();
    await page.waitForURL((url) => url.pathname.startsWith('/cases/'));
    await page.waitForLoadState('networkidle');

    await page.locator('h2:text("Files")').waitFor();
  });
});
