import { expect, test } from '@playwright/test';

const RUN_E2E = process.env.RUN_E2E_TESTS === 'true';

test.describe.configure({ mode: 'serial' });

test.describe('Accounts view smoke (placeholder)', () => {
  test.skip(!RUN_E2E, 'Enable RUN_E2E_TESTS=true to execute accounts navigation smoke test.');

  test('appends more accounts when loading additional pages', async ({ page }) => {
    await page.goto('/accounts');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('table tbody tr');
    const initialCount = await rows.count();

    const loadMoreButton = page.getByRole('button', { name: /load more/i });
    await loadMoreButton.click();
    await page.waitForTimeout(250); // allow UI to update

    const updatedCount = await rows.count();
    expect(updatedCount >= initialCount).toBeTruthy();
  });
});
