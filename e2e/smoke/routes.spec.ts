import { test, expect } from '../fixtures';
import { putConfig } from '../helpers/api';
import { baseConfig } from '../helpers/config-fixtures';

test.beforeEach(async ({ request }) => {
  await putConfig(request, baseConfig());
});

test('display renders the seeded screen', async ({ page }) => {
  await page.goto('/display');
  await expect(page.getByText('E2E HOME SCREEN')).toBeVisible();
});

test('editor loads with the module palette', async ({ page }) => {
  await page.goto('/editor');
  await expect(page.getByRole('heading', { name: 'Modules' })).toBeVisible();
  await expect(page.getByPlaceholder('Search modules…')).toBeVisible();
});

test('remote loads the control tab', async ({ page }) => {
  await page.goto('/remote');
  await expect(page.getByRole('button', { name: 'Sleep Display' })).toBeVisible();
});

test('login redirects to the editor while auth is disabled', async ({ page }) => {
  await page.goto('/login');
  await page.waitForURL('**/editor');
});
