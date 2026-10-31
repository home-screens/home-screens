import { test, expect } from '../fixtures';
import type { APIRequestContext } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig } from '../helpers/api';
import { buildModuleInstance } from '../helpers/module-fixtures';
import {
  connectFakeMealie,
  defaultFakeEntries,
  disconnectFakeMealie,
  fakeMealieDay,
  FAKE_RECIPES,
  startFakeMealie,
  type FakeEntry,
  type FakeMealie,
} from '../helpers/fake-mealie';

/**
 * The wall with the meal plan living in Mealie: every meal view reads
 * Mealie's plan through the hub (sides, desserts and drinks as courses of the
 * dinner, recipe photos in the emoji's place), a change sent to the hub lands
 * in Mealie, and a wall whose Mealie never answers says so instead of
 * claiming nothing is planned. Mealie here is the in-process fake in
 * helpers/fake-mealie.ts; the hub reaches it over the loopback.
 */

let mealie: FakeMealie | null = null;

async function showModule(request: APIRequestContext, type: 'meal-planner' | 'fullscreen-meal-planner', view: string, size = { w: 520, h: 640 }) {
  const mod = buildModuleInstance(type, { view });
  mod.id = 'meals';
  mod.size = type === 'fullscreen-meal-planner' ? { w: 1080, h: 1920 } : size;
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [mod])] }));
}

test.describe('meal plan from Mealie on the wall', () => {
  test.afterEach(async ({ request }) => {
    await disconnectFakeMealie(request);
    await mealie?.close();
    mealie = null;
  });

  test('Today lists the dinner with its courses and draws the recipe photo', async ({ page, request }) => {
    mealie = await startFakeMealie();
    await connectFakeMealie(request, mealie);
    await showModule(request, 'meal-planner', 'today');
    await page.goto('/display');

    const mod = page.locator('[data-module-id="meals"]');
    await expect(mod).toContainText('Harvest Chili');
    const courses = mod.locator('[data-meal-courses]');
    await expect(courses).toContainText('Skillet Cornbread');
    await expect(courses).toContainText('Apple Crumble');
    await expect(courses).toContainText('Lemonade');
    await expect(courses).toContainText(/side/i);
    // The lunch note shows as typed text; the pancakes and the chili have photos.
    await expect(mod).toContainText('School lunch');
    await expect(mod.locator('img')).toHaveCount(2);
  });

  test('Week shows the dish and a count of its courses', async ({ page, request }) => {
    mealie = await startFakeMealie();
    await connectFakeMealie(request, mealie);
    await showModule(request, 'meal-planner', 'week');
    await page.goto('/display');

    const mod = page.locator('[data-module-id="meals"]');
    await expect(mod).toContainText('Harvest Chili');
    await expect(mod.locator('[data-meal-course-count]')).toHaveText(['+3']);
  });

  test('List and the full-screen Week name the other dishes instead of counting them', async ({ page, request }) => {
    mealie = await startFakeMealie();
    await connectFakeMealie(request, mealie);
    for (const [type, view] of [['meal-planner', 'list'], ['fullscreen-meal-planner', 'week']] as const) {
      await showModule(request, type, view);
      await page.goto('/display');
      const names = page.locator('[data-module-id="meals"] [data-meal-course-names]');
      await expect(names).toHaveCount(1);
      await expect(names).toContainText(/^with /);
      for (const dish of ['Skillet Cornbread', 'Apple Crumble', 'Lemonade']) await expect(names).toContainText(dish);
      await expect(page.locator('[data-module-id="meals"] [data-meal-course-count]')).toHaveCount(0);
    }
  });

  test('the note written on the plan shows with the meal', async ({ page, request }) => {
    mealie = await startFakeMealie();
    await connectFakeMealie(request, mealie);
    await showModule(request, 'fullscreen-meal-planner', 'menu-board');
    await page.goto('/display');
    // Mealie keeps "School lunch" with the text "Pizza day" on today's plan.
    await expect(page.locator('[data-module-id="meals"]')).toContainText('Pizza day');
  });

  test('Full-screen Next Meal puts the dish photo behind the name', async ({ page, request }) => {
    // Every meal of today and tomorrow has a photo, so the next one does at any hour.
    const r = (slug: string) => FAKE_RECIPES.find((x) => x.slug === slug)!.id;
    const entries: FakeEntry[] = [
      ...defaultFakeEntries().filter((e) => e.entryType !== 'lunch'),
      { id: 40, date: fakeMealieDay(0), entryType: 'lunch', title: '', text: '', recipeId: r('cheese-board') },
    ];
    mealie = await startFakeMealie(entries);
    await connectFakeMealie(request, mealie);
    await showModule(request, 'fullscreen-meal-planner', 'next-meal');
    await page.goto('/display');

    await expect(page.locator('[data-testid="fmp-photo-backdrop"]')).toBeVisible();
  });

  test('a change sent to the hub lands in Mealie, and a stale copy is refused', async ({ request }) => {
    mealie = await startFakeMealie();
    await connectFakeMealie(request, mealie);
    const tomorrow = fakeMealieDay(1);
    // Which entry tomorrow's dinner is, as the hub names it (number and fingerprint).
    const read = await (await request.get('/api/meals/data')).json();
    const entry: string = read.mealie.plan.find((p: { date: string; slot: string }) => p.date === tomorrow && p.slot === 'dinner').sourceId;
    expect(entry).toMatch(/^mealie:17\./);

    const ok = await request.put('/api/mealie/plan', {
      data: {
        cells: [{
          date: tomorrow,
          slot: 'dinner',
          before: [entry],
          after: { mealId: `mealie:${FAKE_RECIPES[4].id}`, sourceId: entry, time: '18:30', courses: [{ kind: 'dessert', customText: 'Ice cream' }] },
        }],
      },
    });
    expect(ok.status()).toBe(200);
    expect(mealie.entries.filter((e) => e.date === tomorrow).map((e) => [e.entryType, e.title])).toEqual([
      ['dinner', ''],
      ['dessert', 'Ice cream'],
    ]);
    const answer = await ok.json();
    const dinner = answer.mealie.plan.find((p: { date: string; slot: string }) => p.date === tomorrow && p.slot === 'dinner');
    expect(dinner.time).toBe('18:30');
    expect(dinner.courses.map((c: { customText?: string }) => c.customText)).toEqual(['Ice cream']);

    // The same change again quotes entries the meal no longer has.
    const stale = await request.put('/api/mealie/plan', {
      data: { cells: [{ date: tomorrow, slot: 'dinner', before: [entry], after: null }] },
    });
    expect(stale.status()).toBe(409);
    expect((await stale.json()).reason).toBe('revision');
    expect(mealie.entries.filter((e) => e.date === tomorrow)).toHaveLength(2);
  });

  test('says so when Mealie cannot be reached, rather than "nothing planned"', async ({ page, request }) => {
    mealie = await startFakeMealie();
    const gone = mealie.url;
    await mealie.close();
    mealie = null;
    await connectFakeMealie(request, { url: gone });
    await showModule(request, 'meal-planner', 'today');
    await page.goto('/display');

    await expect(page.locator('[data-module-id="meals"]')).toContainText("Can't reach Mealie right now");
  });
});
