import { test, expect } from '../fixtures';
import { putConfig, seedMeals } from '../helpers/api';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';

// The Meals tab only appears when a meal-planner module exists in the config.
test.beforeEach(async ({ request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [buildModuleInstance('meal-planner')])],
  }));
  await seedMeals(request); // one saved meal: "Spaghetti Night"
});

test('the Meals tab library lists a seeded meal', async ({ page }) => {
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Meals', exact: true }).click();
  await page.getByRole('button', { name: 'Library' }).click();

  await expect(page.getByText('Spaghetti Night')).toBeVisible();
});

test('favoriting a meal round-trips to meals.json', async ({ page, request }) => {
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Meals', exact: true }).click();
  await page.getByRole('button', { name: 'Library' }).click();
  await expect(page.getByText('Spaghetti Night')).toBeVisible();

  // exact: the outer meal-card button's accessible name also contains this text.
  await page.getByRole('button', { name: 'Add to favorites', exact: true }).click();

  await expect
    .poll(async () => {
      const res = await request.get('/api/meals/data');
      const meal = (await res.json()).savedMeals.find((m: { id: string }) => m.id === 'meal-1');
      return meal?.isFavorite;
    })
    .toBe(true);
});

// ── MealsSettingsSheet (the Meals tab's own settings sub-sheet) ──

/** Open the Meals tab and its settings sheet, waiting for the sheet header. */
async function openMealsSettings(page: import('@playwright/test').Page) {
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Meals', exact: true }).click();
  await page.getByRole('button', { name: 'Open meal settings' }).click();
  await expect(page.getByRole('heading', { name: 'Meal Settings' })).toBeVisible();
}

test('switching the meal time format persists to meals.json and drives the UI on reload', async ({ page, request }) => {
  await openMealsSettings(page);

  // Seed defaults are 12-hour; switch to 24-hour. The button's accessible name
  // is "24-hour 18:30" (label + sample), so match on the label substring.
  await page.getByRole('button', { name: '24-hour' }).click();
  await page.getByRole('button', { name: 'Save Settings' }).click();

  // A successful settings-only PUT round-trips to disk...
  await expect
    .poll(async () => {
      const res = await request.get('/api/meals/data');
      return (await res.json()).settings.timeFormat;
    })
    .toBe('24h');

  // ...and closes the sheet.
  await expect(page.getByRole('heading', { name: 'Meal Settings' })).toBeHidden();

  // Reload so settings come fresh from disk, then reopen: the 24-hour option is
  // now the selected one, proving the persisted value drives the UI.
  await page.reload();
  await page.getByRole('button', { name: 'Meals', exact: true }).click();
  await page.getByRole('button', { name: 'Open meal settings' }).click();
  await expect(page.getByRole('button', { name: '24-hour' })).toHaveAttribute('aria-pressed', 'true');
});

test('toggling a meal slot on persists to meals.json', async ({ page, request }) => {
  await openMealsSettings(page);

  // Seed defaults enable breakfast/lunch/dinner; snack starts off.
  const snackToggle = page.getByRole('button', { name: 'Snack, disabled' });
  await expect(snackToggle).toBeVisible();
  await snackToggle.click();
  // The toggle flips to the enabled label immediately (optimistic draft state).
  await expect(page.getByRole('button', { name: 'Snack, enabled' })).toBeVisible();

  await page.getByRole('button', { name: 'Save Settings' }).click();

  await expect
    .poll(async () => {
      const res = await request.get('/api/meals/data');
      return (await res.json()).settings.enabledSlots as string[];
    })
    .toContain('snack');
});
