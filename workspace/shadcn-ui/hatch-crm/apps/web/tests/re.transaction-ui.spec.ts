import { test } from '@playwright/test';

const RUN_E2E = process.env.RUN_E2E_TESTS === 'true';
const TRANSACTION_ID = process.env.RE_TEST_TRANSACTION_ID;

test.describe.configure({ mode: 'serial' });

test.describe('RE Transaction UI', () => {
  test.skip(!RUN_E2E || !TRANSACTION_ID, 'Set RUN_E2E_TESTS=true and RE_TEST_TRANSACTION_ID to enable.');

  test('renders transaction page', async ({ page }) => {
    await page.goto(`/re/transactions/${TRANSACTION_ID}`);
    await page.waitForLoadState('networkidle');
  });
});
