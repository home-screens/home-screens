import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { putConfig, seedHouseholdChores } from '../helpers/api';
import { baseConfig, choreChartModule, makeScreen } from '../helpers/config-fixtures';

/**
 * Tap safety for bonus chores: a second tap from a double tap, or a "did it
 * work?" tap a moment later, must never land on something that moved or
 * appeared under the finger, and a tap on something that stayed put must go
 * through at once. These are the ways usability testing kept finding a chore
 * ticked, and paid for, that nobody did; each test here is one of them.
 */

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const members = [
  { id: 'bt-ada', name: 'Ada', color: '#f472b6' },
  { id: 'bt-bram', name: 'Bram', color: '#60a5fa' },
];
const groups = [{ id: 'bt-kids', name: 'Kids', memberIds: ['bt-ada', 'bt-bram'] }];
const chore = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, emoji: '', points: 3, frequency: 'daily', daysOfWeek: ALL_DAYS, timeOfDay: 'anytime',
  assigneeIds: [], assigneeGroupIds: ['bt-kids'], rotation: 'fixed', ...extra,
});
const household = {
  members,
  groups,
  chores: [
    chore('bt-bed', 'Make your bed', { points: 1 }),
    chore('bt-bag', 'Pack your bag', { points: 1 }),
    chore('bt-car', 'Wash the car', { points: 5, bonus: { claim: 'first', comesBack: 'daily' } }),
    chore('bt-porch', 'Sweep the porch', { bonus: { claim: 'first', comesBack: 'daily' } }),
    chore('bt-towels', 'Fold the towels', { points: 2, bonus: { claim: 'first', comesBack: 'daily' } }),
    chore('bt-read', 'Read for 20 minutes', { points: 2, bonus: { claim: 'each', comesBack: 'daily' } }),
  ],
};

const wallModule = {
  id: 'bt-wall',
  type: 'fullscreen-chore-chart',
  position: { x: 0, y: 0 },
  size: { w: 1080, h: 1920 },
  zIndex: 1,
  style: { ...choreChartModule().style },
  config: {
    view: 'chores', showRewardsButton: false, weekStartDay: 'monday', weekProgress: 'chips', layout: 'by-time',
    showPoints: true, showStreaks: true, showTimeOfDay: true, allowDisplayComplete: true, darkMode: true,
    density: 'cozy', typographySize: 'medium', accentColor: '',
  },
};

async function marks(request: APIRequestContext) {
  return await (await request.get('/api/chores')).json() as {
    completions: Array<{ choreId: string; memberId: string; status?: string }>;
    grabs: Array<{ choreId: string; memberId: string }>;
  };
}
const done = async (request: APIRequestContext, choreId: string) =>
  (await marks(request)).completions.filter((c) => c.choreId === choreId && !c.status);

async function centre(target: Locator) {
  const box = (await target.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
/** A bonus row's own tick button (the row also has Grab it or a menu). */
const rowTick = (page: Page, id: string) => page.getByTestId(`bonus-row-${id}`).locator('button').first();

async function openKidPage(page: Page, name = 'Ada') {
  await page.goto('/chores');
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByTestId('bonus-section')).toBeVisible();
}

test.beforeEach(async ({ request, sandboxDir }) => {
  await putConfig(request, baseConfig({ screens: [makeScreen('bt-full', 'Wall', [wallModule as never])] }));
  writeFileSync(path.join(sandboxDir, 'data', 'chore-completions.json'), JSON.stringify({ completions: [] }));
  await request.put('/api/chores/settings', { data: { grabLimit: 1, grabHold: 'day' } });
  expect((await seedHouseholdChores(request, sandboxDir, household)).ok()).toBe(true);
});

test.describe('phone', () => {
  test('a second tap where Let it go was, soon or a little later, ticks nothing', async ({ page, request }) => {
    for (const gap of [300, 1600]) {
      await openKidPage(page);
      await page.getByTestId('grab-bt-car').click();
      const letGo = page.getByTestId('let-go-bt-car');
      await expect(letGo).toBeVisible();
      const spot = await centre(letGo);
      await page.mouse.click(spot.x, spot.y);
      await expect.poll(async () => (await marks(request)).grabs).toEqual([]);
      await page.waitForTimeout(gap);
      await page.mouse.click(spot.x, spot.y);
      await page.waitForTimeout(700);
      // The rows under the car slid up; none of them may have been ticked.
      expect((await marks(request)).completions).toEqual([]);
    }
  });

  test('a tap on a row that did not move goes through at once', async ({ page, request }) => {
    await openKidPage(page);
    // Ticking a regular chore moves no bonus row.
    await page.getByRole('button', { name: /: Make your bed$/ }).click();
    await rowTick(page, 'bt-car').click();
    await expect.poll(() => done(request, 'bt-car')).toHaveLength(1);
    // Grabbing the porch moves the rows below it, not the row above.
    await page.getByTestId('grab-bt-porch').click();
    await expect(page.getByTestId('yours-bt-porch')).toBeVisible();
    await rowTick(page, 'bt-read').click();
    // The read row moved when the porch row grew: that tap waits...
    await page.waitForTimeout(300);
    expect(await done(request, 'bt-read')).toHaveLength(0);
    // ...and goes through once it has stayed put.
    await page.waitForTimeout(3100);
    await rowTick(page, 'bt-read').click();
    await expect.poll(() => done(request, 'bt-read')).toHaveLength(1);
  });

  test('holding to un-tick straight after a mis-tick works', async ({ page, request }) => {
    await openKidPage(page);
    const read = rowTick(page, 'bt-read');
    await read.click();
    await expect.poll(() => done(request, 'bt-read')).toHaveLength(1);
    await page.waitForTimeout(200);
    const spot = await centre(read);
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.down();
    await page.waitForTimeout(1100);
    await page.mouse.up();
    await expect.poll(() => done(request, 'bt-read')).toHaveLength(0);
  });

  test('a second tap on a finished chore, as its hint comes and goes, ticks nothing below it', async ({ page, request }) => {
    await openKidPage(page);
    await page.getByRole('button', { name: /: Make your bed$/ }).click();
    await expect.poll(() => done(request, 'bt-bed')).toHaveLength(1);
    await page.waitForTimeout(3100);
    // A tap on the finished bed shows "Press and hold to un-check" for a while.
    const bed = page.getByRole('button', { name: /: Make your bed$/ });
    const box = (await bed.boundingBox())!;
    const lower = { x: box.x + box.width / 2, y: box.y + box.height - 6 };
    for (const gap of [0, 1900, 2300]) {
      await page.waitForTimeout(gap);
      await page.mouse.click(lower.x, lower.y);
    }
    await page.waitForTimeout(700);
    expect(await done(request, 'bt-bag')).toHaveLength(0);
    expect(await done(request, 'bt-bed')).toHaveLength(1);
  });

  test('the all-done banner does not move the bonus rows', async ({ page }) => {
    await openKidPage(page);
    const car = page.getByTestId('bonus-row-bt-car');
    const before = (await car.boundingBox())!.y;
    await page.getByRole('button', { name: /: Make your bed$/ }).click();
    await page.waitForTimeout(3100);
    await page.getByRole('button', { name: /: Pack your bag$/ }).click();
    await expect(page.getByRole('status').filter({ hasText: /Ada/ }).first()).toBeVisible();
    expect((await car.boundingBox())!.y).toBe(before);
    await page.waitForTimeout(4500);
    expect((await car.boundingBox())!.y).toBe(before);
  });
});

test.describe('phone, grown-up', () => {
  test('a double tap on a menu choice does nothing to the row the menu covered', async ({ page, request }) => {
    await page.goto('/remote');
    await page.getByRole('button', { name: 'Chores', exact: true }).click();
    await page.getByRole('button', { name: 'Ada', exact: true }).click();
    await page.getByTestId('chore-menu-bt-car').click();
    const choice = page.getByRole('button', { name: /Ada did it/ });
    await expect(choice).toBeVisible();
    const spot = await centre(choice);
    await page.mouse.click(spot.x, spot.y);
    await page.waitForTimeout(400);
    await page.mouse.click(spot.x, spot.y);
    await page.waitForTimeout(800);
    const all = (await marks(request)).completions.filter((c) => !c.status);
    expect(all).toEqual([expect.objectContaining({ choreId: 'bt-car', memberId: 'bt-ada' })]);
  });
});

test.describe('wall', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1080, height: 1920 });
    await page.goto('/display?screen=bt-full');
    await expect(page.getByTestId('fcc-bonus-bt-porch')).toContainText('Grab it');
  });

  test('a double tap on Grab it opens the picker and grabs for nobody', async ({ page, request }) => {
    const spot = await centre(page.getByTestId('fcc-bonus-bt-porch'));
    await page.mouse.click(spot.x, spot.y);
    await page.waitForTimeout(250);
    await page.mouse.click(spot.x, spot.y);
    await expect(page.getByTestId('fcc-grab-picker')).toBeVisible();
    await page.waitForTimeout(500);
    expect((await marks(request)).grabs).toEqual([]);
  });

  test('a tap elsewhere right after closing a sheet goes through', async ({ page }) => {
    await page.getByTestId('fcc-bonus-bt-porch').click();
    await page.getByTestId('fcc-grab-picker').getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForTimeout(150);
    await page.getByTestId('fcc-bonus-bt-car').click();
    await expect(page.getByTestId('fcc-grab-picker')).toContainText('Wash the car');
  });

  test('a second tap where "did it" was ticks nothing under the sheet', async ({ page, request }) => {
    await page.getByTestId('fcc-bonus-bt-porch').click();
    await page.getByTestId('fcc-grab-pick-bt-bram').click();
    await expect(page.getByTestId('fcc-bonus-bt-porch')).toContainText("Bram's on it");
    await page.waitForTimeout(1300);
    await page.getByTestId('fcc-bonus-bt-porch').click();
    const didIt = page.getByTestId('fcc-grab-done');
    const spot = await centre(didIt);
    await page.mouse.click(spot.x, spot.y);
    await page.waitForTimeout(700);
    await page.mouse.click(spot.x, spot.y);
    await page.waitForTimeout(700);
    const all = (await marks(request)).completions.filter((c) => !c.status);
    expect(all).toEqual([expect.objectContaining({ choreId: 'bt-porch', memberId: 'bt-bram' })]);
  });

  test('a sheet whose chore changes on another screen closes for good', async ({ page, request }) => {
    await page.getByTestId('fcc-bonus-bt-porch').click();
    await expect(page.getByTestId('fcc-grab-picker')).toBeVisible();
    await request.post('/api/chores/grab', { data: { choreId: 'bt-porch', memberId: 'bt-ada', action: 'grab' } });
    await expect(page.getByTestId('fcc-grab-picker')).toHaveCount(0, { timeout: 15_000 });
    await request.post('/api/chores/grab', { data: { choreId: 'bt-porch', memberId: 'bt-ada', action: 'let-go' } });
    await expect(page.getByTestId('fcc-bonus-bt-porch')).toContainText('Grab it', { timeout: 15_000 });
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('fcc-grab-picker')).toHaveCount(0);
  });
});
