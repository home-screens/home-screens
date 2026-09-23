import sharp from 'sharp';
import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { putConfig, seedMeals } from '../helpers/api';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';

/**
 * The family's own icons from the phone: add a picture from the meal form,
 * keep it, and see it on the wall in place of the meal's emoji.
 */

function isoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A 900 px sticker with a see-through margin: big enough to be shrunk. */
function sticker(): Promise<Buffer> {
  return sharp({ create: { width: 700, height: 700, channels: 4, background: '#f97316' } })
    .extend({ top: 100, bottom: 100, left: 100, right: 100, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function animatedGif(): Promise<Buffer> {
  const frames = await Promise.all(['#ef4444', '#22c55e', '#3b82f6'].map((background) =>
    sharp({ create: { width: 120, height: 120, channels: 3, background } }).png().toBuffer()));
  return sharp(frames, { join: { animated: true } }).gif().toBuffer();
}

async function clearIcons(request: APIRequestContext) {
  const { icons } = await (await request.get('/api/custom-icons')).json() as { icons: Array<{ id: string }> };
  for (const icon of icons) expect((await request.delete(`/api/custom-icons/${icon.id}`)).ok()).toBe(true);
}

async function openMealForm(page: Page, name: string) {
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Meals', exact: true }).click();
  await page.getByRole('button', { name: 'Library' }).click();
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  await expect(page.getByText('Edit Meal')).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  await clearIcons(request);
  await putConfig(request, baseConfig({
    settings: { displayTransform: 'normal' },
    screens: [makeScreen('s1', 'Meals', [buildModuleInstance('fullscreen-meal-planner', { view: 'today' })])],
  }));
});

test('a picture added from the meal form shows on the wall', async ({ page, request }) => {
  await seedMeals(request, {
    savedMeals: [{ id: 'meal-1', name: 'Taco Tuesday', emoji: '🌮' }],
    plan: [{ slot: 'dinner', mealId: 'meal-1', date: isoDate(0) }],
  });
  await openMealForm(page, 'Taco Tuesday');

  await page.getByTestId('custom-icon-file').first().setInputFiles({ name: 'taco-sticker.png', mimeType: 'image/png', buffer: await sticker() });
  const review = page.getByTestId('custom-icon-review');
  await expect(review.getByRole('button', { name: 'Use this icon' })).toBeVisible();
  await review.getByLabel('Name').fill('Taco night');
  await review.getByRole('button', { name: 'Use this icon' }).click();
  await expect(review).toHaveCount(0);
  await expect(page.getByTestId('custom-icon-section').getByRole('button', { name: 'Taco night', pressed: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save Changes' }).click();

  const { icons } = await (await request.get('/api/custom-icons')).json() as { icons: Array<{ id: string; name: string }> };
  expect(icons.map((icon) => icon.name)).toEqual(['Taco night']);
  await expect.poll(async () => {
    const meals = await (await request.get('/api/meals/data')).json() as { savedMeals: Array<{ emoji?: string }> };
    return meals.savedMeals[0].emoji;
  }).toBe(`custom:${icons[0].id}`);

  await page.goto('/display');
  const picture = page.getByRole('img', { name: 'Taco night' }).first();
  await expect(picture).toBeVisible();
  // Trimmed and shrunk to fit the icon size on the server, never larger.
  await expect.poll(() => picture.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(await picture.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeLessThanOrEqual(512);
});

test('a meal whose picture was removed shows the usual plate', async ({ page, request }) => {
  await seedMeals(request, {
    savedMeals: [{ id: 'meal-1', name: 'Mystery stew', emoji: 'custom:zzzzzzzzzzzz' }],
    plan: [{ slot: 'dinner', mealId: 'meal-1', date: isoDate(0) }],
  });
  await page.goto('/display');
  await expect(page.getByText('Mystery stew').first()).toBeVisible();
  await expect(page.getByText('🍽️').first()).toBeVisible();
  await expect(page.getByText('custom:zzzzzzzzzzzz')).toHaveCount(0);
});

test('a file that is not a picture is refused in plain words', async ({ page, request }) => {
  await seedMeals(request, { savedMeals: [{ id: 'meal-1', name: 'Soup', emoji: '🍲' }], plan: [] });
  await openMealForm(page, 'Soup');
  await page.getByTestId('custom-icon-file').first().setInputFiles({
    name: 'drawing.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  });
  await expect(page.getByTestId('custom-icon-review').getByRole('alert')).toHaveText('Only pictures work here (PNG, JPG, WebP or GIF).');
  const { icons } = await (await request.get('/api/custom-icons')).json() as { icons: unknown[] };
  expect(icons).toEqual([]);
});

test('a moving picture keeps moving, and the manage page removes it', async ({ page, request }) => {
  const res = await request.post('/api/custom-icons', {
    multipart: { file: { name: 'spin.gif', mimeType: 'image/gif', buffer: await animatedGif() }, name: 'Spinner' },
  });
  expect(res.status()).toBe(201);
  const { icon } = await res.json() as { icon: { id: string; animated: boolean } };
  expect(icon.animated).toBe(true);
  // An upload is pending until kept, as "Use this icon" does.
  expect((await request.patch(`/api/custom-icons/${icon.id}`, { data: { keep: true } })).ok()).toBe(true);

  await page.goto('/remote');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /Your icons/ }).click();
  const manage = page.getByRole('dialog', { name: 'Your icons' });
  await manage.getByRole('button', { name: 'Spinner' }).click();
  await page.getByRole('button', { name: 'Remove icon' }).click();
  await page.getByTestId('confirm-sheet').getByRole('button', { name: 'Remove' }).click();
  await expect(manage.getByRole('button', { name: 'Spinner' })).toHaveCount(0);
  const { icons } = await (await request.get('/api/custom-icons')).json() as { icons: unknown[] };
  expect(icons).toEqual([]);
});

test('removing a picture puts what used it back to a standard icon', async ({ request }) => {
  const res = await request.post('/api/custom-icons', {
    multipart: { file: { name: 'chili.png', mimeType: 'image/png', buffer: await sticker() }, name: 'Chili' },
  });
  const { icon } = await res.json() as { icon: { id: string } };
  await request.patch(`/api/custom-icons/${icon.id}`, { data: { keep: true } });
  const value = `custom:${icon.id}`;
  await seedMeals(request, { savedMeals: [{ id: 'meal-1', name: "Dad's chili", emoji: value }], plan: [] });
  const chores = await (await request.get('/api/chores/data')).json() as { revision: string };
  expect((await request.put('/api/chores/data', { data: {
    revision: chores.revision,
    chores: [{ id: 'c1', name: 'Stir the pot', emoji: value, points: 1, frequency: 'daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime', assigneeIds: [], rotation: 'fixed' }],
  } })).ok()).toBe(true);

  expect((await request.delete(`/api/custom-icons/${icon.id}`)).ok()).toBe(true);

  const meals = await (await request.get('/api/meals/data')).json() as { savedMeals: Array<{ emoji?: string }> };
  expect(meals.savedMeals[0].emoji).toBe('🍽️');
  const after = await (await request.get('/api/chores/data')).json() as { chores: Array<{ emoji: string }> };
  expect(after.chores[0].emoji).toBe('lucide:sparkles');
});
