import { test } from '@playwright/test';

const RUN_E2E = process.env.RUN_E2E_TESTS === 'true';

test.describe.configure({ mode: 'serial' });

test.describe('Dashboard metrics cards', () => {
  test.skip(!RUN_E2E, 'Enable RUN_E2E_TESTS=true to execute dashboard metrics smoke test.');

  test('renders metrics cards', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.locator('text=Lead Conversion').first().waitFor({ timeout: 5000 });
  });
});
