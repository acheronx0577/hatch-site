import { test } from '@playwright/test';

const RUN_E2E = process.env.RUN_E2E_TESTS === 'true';

test.describe('Admin rules UI smoke', () => {
  test.skip(!RUN_E2E, 'Enable RUN_E2E_TESTS=true to execute rules UI smoke test.');

  test('opens validation modal and renders JSON editor', async ({ page }) => {
    await page.goto('/admin/rules/validation');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'New Rule' }).click();

    const editor = page.getByLabel('Rule DSL (JSON)');
    await editor.waitFor({ state: 'visible' });

    await page.getByRole('button', { name: 'Cancel' }).click();
  });
});
