import { test, expect } from '../fixtures';
import { putConfig } from '../helpers/api';
import { baseConfig } from '../helpers/config-fixtures';

/**
 * Editor › ModulePalette filtering. The palette has no single-select category
 * filter; it renders every category as an independently-collapsible group over
 * a cross-category search box (see src/components/editor/ModulePalette.tsx). So
 * "filter to a category" is expressed two ways — searching a category name, and
 * collapsing the other groups — and both are covered here. The palette-drag and
 * no-results paths already live in editor.spec.ts.
 *
 * Filtered-out and collapsed modules are unmounted (AnimatePresence exit +
 * filteredGroups pruning), so their `palette-<type>` testid drops to count 0.
 */

test.beforeEach(async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
});

test('search narrows the palette to matching modules and clearing restores them', async ({ page }) => {
  const search = page.getByPlaceholder('Search modules…');
  // All categories are expanded by default, so both are present up front.
  await expect(page.getByTestId('palette-clock')).toBeVisible();
  await expect(page.getByTestId('palette-weather')).toBeVisible();

  await search.fill('clock');
  await expect(page.getByTestId('palette-clock')).toBeVisible();
  await expect(page.getByTestId('palette-weather')).toHaveCount(0);

  await search.fill('');
  await expect(page.getByTestId('palette-clock')).toBeVisible();
  await expect(page.getByTestId('palette-weather')).toBeVisible();
});

test('searching a category name keeps that whole category and drops the others', async ({ page }) => {
  // The filter also matches a module's category label, so "weather" surfaces the
  // entire Weather & Environment group while excluding unrelated categories.
  await page.getByPlaceholder('Search modules…').fill('weather');
  await expect(page.getByTestId('palette-weather')).toBeVisible();
  await expect(page.getByTestId('palette-air-quality')).toBeVisible(); // same category
  await expect(page.getByTestId('palette-clock')).toHaveCount(0);      // Time & Date
});

test('collapsing a category hides its modules until it is re-expanded', async ({ page }) => {
  await expect(page.getByTestId('palette-clock')).toBeVisible();

  const header = page.getByRole('button', { name: /Time & Date/ });
  await header.click();
  await expect(page.getByTestId('palette-clock')).toHaveCount(0);

  await header.click();
  await expect(page.getByTestId('palette-clock')).toBeVisible();
});
