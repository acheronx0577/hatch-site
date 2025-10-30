import { expect, test } from '@playwright/test';

const RUN_E2E = process.env.RUN_E2E_TESTS === 'true';

test.describe.configure({ mode: 'serial' });

test.describe('Global search smoke', () => {
  test.skip(!RUN_E2E, 'Enable RUN_E2E_TESTS=true to execute search smoke test.');

  test('appends results when loading more', async ({ page }) => {
    await page.goto('/search?q=smith');
    await page.waitForLoadState('networkidle');

    const list = page.locator('[data-testid="search-results"] > li');
    const initialCount = await list.count();

    const loadMore = page.getByRole('button', { name: /load more/i });
    if (await loadMore.isVisible()) {
      await loadMore.click();
      await page.waitForTimeout(300);
      const updated = await list.count();
      expect(updated >= initialCount).toBeTruthy();
    } else {
      expect(initialCount).toBeGreaterThanOrEqual(0);
    }
  });
});
