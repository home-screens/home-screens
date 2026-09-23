import sharp from 'sharp';
import type { APIRequestContext } from '@playwright/test';
import { test, expect } from '../fixtures';
import { autosaved, moduleConfig, selectModule } from '../helpers/editor';
import { buildModuleInstance } from '../helpers/module-fixtures';

/**
 * The family's own icons in the editor: the Your icons settings page, and the
 * "Your icons" tab of the shared icon picker.
 */

async function clearIcons(request: APIRequestContext) {
  const { icons } = await (await request.get('/api/custom-icons')).json() as { icons: Array<{ id: string }> };
  for (const icon of icons) expect((await request.delete(`/api/custom-icons/${icon.id}`)).ok()).toBe(true);
}

async function square(background: string): Promise<Buffer> {
  return sharp({ create: { width: 96, height: 96, channels: 3, background } }).png().toBuffer();
}

test.beforeEach(async ({ request }) => {
  await clearIcons(request);
});

test('the Your icons page adds, renames and removes pictures', async ({ page, request }) => {
  await page.goto('/editor/settings?section=defaults&page=icons');
  await expect(page.getByRole('heading', { name: 'Your icons' })).toBeVisible();

  await page.getByTestId('custom-icon-file').setInputFiles([
    { name: 'pizza-night.png', mimeType: 'image/png', buffer: await square('#f59e0b') },
    { name: 'game-day.png', mimeType: 'image/png', buffer: await square('#22c55e') },
  ]);
  const tiles = page.getByTestId('custom-icon-tile');
  await expect(tiles).toHaveCount(2);
  // A batch opens its first new picture for naming: a file name is rarely
  // what the family wants to see.
  const name = tiles.nth(0).getByRole('textbox', { name: 'Name' });
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('pizza night');
  await name.fill('Pizza Friday');
  await name.press('Enter');
  await expect(tiles.nth(0)).toContainText('Pizza Friday');
  // Focus goes back to the tile rather than dropping to the page.
  await expect(tiles.nth(0).getByRole('button', { name: /Rename/ })).toBeFocused();

  await tiles.nth(1).hover();
  await tiles.nth(1).getByRole('button', { name: /Remove icon/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expect(tiles).toHaveCount(1);

  const { icons } = await (await request.get('/api/custom-icons')).json() as { icons: Array<{ name: string }> };
  expect(icons.map((icon) => icon.name)).toEqual(['Pizza Friday']);
});

test('an event rule can use one of the family\'s pictures', async ({ page, request }) => {
  const res = await request.post('/api/custom-icons', {
    multipart: { file: { name: 'soccer.png', mimeType: 'image/png', buffer: await square('#16a34a') }, name: 'Game day' },
  });
  const { icon } = await res.json() as { icon: { id: string } };
  expect((await request.patch(`/api/custom-icons/${icon.id}`, { data: { keep: true } })).ok()).toBe(true);

  await selectModule(page, request, buildModuleInstance('fullscreen-calendar'));
  await page.getByRole('button', { name: /Advanced looks/i }).click();
  await autosaved(page, async () => {
    await page.getByRole('button', { name: 'Add an event rule' }).click();
  });
  const card = page.locator('[data-rules-list="events"] [data-rule-card]').first();
  await card.getByLabel('Icon', { exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose an icon' });
  await picker.getByRole('tab', { name: /Your icons/ }).click();
  await autosaved(page, async () => {
    await picker.getByRole('button', { name: 'Game day' }).click();
  });

  const rules = (await moduleConfig(request, 'fullscreen-calendar')).eventRules as Array<{ icon?: string }>;
  expect(rules[0].icon).toBe(`custom:${icon.id}`);
  // The field names the picture it holds, not its token.
  await expect(card.getByLabel('Icon', { exact: true })).toContainText('Game day');
});
