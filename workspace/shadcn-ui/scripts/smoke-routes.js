/**
 * Lightweight smoke test to verify broker routes render without dead ends.
 * Usage:
 *   BASE_URL=http://localhost:5173 node scripts/smoke-routes.js
 * (adjust BASE_URL to your dev server)
 */
import { chromium } from 'playwright';

const base = process.env.BASE_URL || 'http://localhost:5173';

const routes = [
  { path: '/broker/mission-control', text: 'Virtual Brokerage Command Center' },
  { path: '/broker/team', text: 'Agents' },
  { path: '/broker/properties', text: 'Properties' },
  { path: '/broker/transactions', text: 'Transactions' },
  { path: '/broker/draft-listings', text: 'Draft Listings' },
  { path: '/broker/commission-plans', text: 'Commission Plans' },
  { path: '/broker/crm', text: 'CRM' },
  { path: '/broker/marketing', text: 'Marketing' },
  { path: '/broker/analytics', text: 'Analytics' },
  { path: '/broker/compliance', text: 'Compliance' },
  { path: '/broker/audit-log', text: 'Audit Log' },
  { path: '/broker/notifications', text: 'Notifications' },
  // Removed route should redirect to Mission Control
  { path: '/broker/ai-employees', text: 'Virtual Brokerage Command Center' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let failed = false;
  for (const { path, text } of routes) {
    console.log(`Checking ${path}...`);
    await page.goto(`${base}${path}`);
    const found = await page.getByText(text, { exact: false }).first().isVisible().catch(() => false);
    if (!found) {
      console.error(`❌ Missing marker "${text}" on ${path}`);
      failed = true;
      break;
    }
    console.log(`✅ ${path}`);
  }

  await browser.close();
  if (failed) process.exit(1);
  console.log('All routes passed.');
})();
