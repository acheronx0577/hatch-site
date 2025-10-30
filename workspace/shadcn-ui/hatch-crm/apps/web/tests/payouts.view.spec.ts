import { test } from '@playwright/test';

const RUN_E2E = process.env.RUN_E2E_TESTS === 'true';

test.describe.configure({ mode: 'serial' });

test.describe('Payouts view smoke (placeholder)', () => {
  test.skip(!RUN_E2E, 'Enable RUN_E2E_TESTS=true to execute payouts navigation smoke test.');

  test('loads payouts page', async ({ page }) => {
    await page.goto('/payouts');
    await page.waitForLoadState('networkidle');
  });
});
