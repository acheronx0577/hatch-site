import { test } from '@playwright/test';

const RUN_E2E = process.env.RUN_E2E_TESTS === 'true';
const LISTING_ID = process.env.RE_TEST_LISTING_ID;

test.describe.configure({ mode: 'serial' });

test.describe('RE Offers UI', () => {
  test.skip(!RUN_E2E || !LISTING_ID, 'Set RUN_E2E_TESTS=true and RE_TEST_LISTING_ID to enable.');

  test('renders listing offers page', async ({ page }) => {
    await page.goto(`/re/listings/${LISTING_ID}/offers`);
    await page.waitForLoadState('networkidle');
  });
});
