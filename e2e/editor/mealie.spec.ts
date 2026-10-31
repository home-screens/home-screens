import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { connectFakeMealie, defaultFakeEntries, disconnectFakeMealie, FAKE_MEALIE_TOKEN, startFakeMealie, type FakeMealie } from '../helpers/fake-mealie';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { selectModule } from '../helpers/editor';

/**
 * Connecting Mealie on Settings > API keys: the card saves the address and the
 * token, and its Test says which household the plan will come from, or what
 * is wrong in a plain sentence. Mealie is the in-process fake in
 * helpers/fake-mealie.ts.
 */

const API_KEYS = '/editor/settings?section=defaults&page=integrations';
let mealie: FakeMealie | null = null;

test.afterEach(async ({ request }) => {
  await disconnectFakeMealie(request);
  await mealie?.close();
  mealie = null;
});

async function fillCard(page: Page, url: string, token: string) {
  await page.goto(API_KEYS);
  const card = page.locator('[data-field-id="integrations.mealie"]');
  await card.locator('button[aria-expanded]').first().click();
  for (const [placeholder, value] of [['e.g. http://192.168.1.50:9925', url], ['Paste your Mealie API token', token]]) {
    const field = card.getByPlaceholder(placeholder);
    await field.fill(value);
    const saved = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/secrets' && r.request().method() === 'PUT');
    await field.locator('xpath=following-sibling::button').click();
    expect((await saved).ok()).toBe(true);
  }
  await card.getByRole('button', { name: 'Test' }).click();
  return card;
}

test('the Mealie card connects and names the household', async ({ page }) => {
  mealie = await startFakeMealie();
  const card = await fillCard(page, mealie.url, FAKE_MEALIE_TOKEN);
  await expect(card.getByTestId('mealie-test-result')).toContainText('Connected to the Family household, Mealie 3.29.0');
});

test('a token Mealie refuses is said plainly', async ({ page }) => {
  mealie = await startFakeMealie();
  const card = await fillCard(page, mealie.url, 'not-the-token');
  await expect(card.getByTestId('mealie-test-result')).not.toContainText('Connected');
  await expect(card.getByTestId('mealie-test-result')).toContainText(/token/i);
  // The pill says so too, and still does when the page is opened again.
  await page.reload();
  await expect(page.locator('[data-field-id="integrations.mealie"] button[aria-expanded]').first()).toContainText('Token not accepted');
});

test('a passing Test shows the saved address in its box and links to the Meals page', async ({ page }) => {
  mealie = await startFakeMealie();
  const card = await fillCard(page, mealie.url, FAKE_MEALIE_TOKEN);
  const result = card.getByTestId('mealie-test-result');
  await expect(card.getByPlaceholder('e.g. http://192.168.1.50:9925')).toHaveValue(mealie.url);
  await result.getByRole('link', { name: /Meals settings/ }).click();
  await expect(page).toHaveURL(/page=meals/);
  await expect(page.locator('[data-field-id="meals.planSource"]')).toBeVisible();
});

test('Suggest in the planner window fills only the empty dinners in Mealie, and Undo takes them back', async ({ page, request }) => {
  mealie = await startFakeMealie();
  await connectFakeMealie(request, mealie);
  await selectModule(page, request, buildModuleInstance('meal-planner'));
  await page.getByRole('button', { name: 'Edit Meal Plan' }).click();
  // The window's own week, not the canvas behind it, which shows the plan first.
  await expect(page.locator('[data-meal-cell]').getByText('Harvest Chili')).toBeVisible();

  const before = mealie.entries.map((e) => e.id);
  const plannedDinners = new Set(defaultFakeEntries().filter((e) => e.entryType === 'dinner').map((e) => e.date));
  await page.getByRole('button', { name: 'Suggest', exact: true }).click();
  await expect(page.getByText(/Planned (a dinner|dinners) for /)).toBeVisible();

  const added = mealie.entries.filter((e) => !before.includes(e.id));
  expect(added.length).toBeGreaterThan(0);
  expect(added.every((e) => e.entryType === 'dinner' && !plannedDinners.has(e.date))).toBe(true);

  // The toast's Undo, not the editor toolbar's (an icon with the same name).
  await page.getByRole('button', { name: 'Undo', exact: true }).filter({ hasText: 'Undo' }).click();
  await expect.poll(() => mealie!.entries.map((e) => e.id).sort()).toEqual([...before].sort());
});

test('removing the token asks first while the meal plan lives in Mealie', async ({ page, request }) => {
  mealie = await startFakeMealie();
  await connectFakeMealie(request, mealie);
  await page.goto(API_KEYS);
  const card = page.locator('[data-field-id="integrations.mealie"]');
  await card.locator('button[aria-expanded]').first().click();
  const tokenRow = card.getByPlaceholder('Paste your Mealie API token').locator('xpath=../..');
  const status = async () => (await (await request.get('/api/secrets')).json()) as Record<string, boolean>;

  await tokenRow.getByRole('button', { name: 'Remove' }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Stop showing the meal plan?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect((await status()).mealie_api_key).toBe(true);

  await tokenRow.getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('dialog').filter({ hasText: 'Stop showing the meal plan?' }).getByRole('button', { name: 'Remove' }).click();
  await expect.poll(async () => (await status()).mealie_api_key).toBeFalsy();
});

