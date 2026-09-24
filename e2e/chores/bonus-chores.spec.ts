import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { putConfig, seedHouseholdChores } from '../helpers/api';
import { baseConfig, choreChartModule, makeScreen } from '../helpers/config-fixtures';

/**
 * Bonus chores end to end: grabbing on the kid view and the wall, the grab
 * limit from the household settings, and a grown-up marking a chore "not
 * today". Each test seeds its own household so completions from one never
 * leak into another in this worker's sandbox.
 */

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const members = [
  { id: 'bk-ada', name: 'Ada', color: '#f472b6' },
  { id: 'bk-bram', name: 'Bram', color: '#60a5fa' },
];
const groups = [{ id: 'bk-kids', name: 'Kids', memberIds: ['bk-ada', 'bk-bram'] }];
const chore = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, emoji: '', points: 3, frequency: 'daily', daysOfWeek: ALL_DAYS, timeOfDay: 'anytime',
  assigneeIds: [], assigneeGroupIds: ['bk-kids'], rotation: 'fixed', ...extra,
});
const household = {
  members,
  groups,
  chores: [
    chore('bk-bed', 'Make your bed', { points: 1 }),
    chore('bk-car', 'Wash the car', { points: 5, bonus: { claim: 'first', comesBack: 'daily' } }),
    chore('bk-porch', 'Sweep the porch', { bonus: { claim: 'first', comesBack: 'daily' } }),
    chore('bk-garage', 'Clean out the garage', { points: 20, bonus: { claim: 'first', comesBack: 'manual' } }),
  ],
};

const fullscreenModule = {
  id: 'bk-wall',
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

/**
 * A phone row that just moved on screen ignores taps for 3 s (a second tap
 * would land on a row that slid under the finger). Tapping a row that moved,
 * a person waits that long; so does a test.
 */
const settle = (page: Page) => page.waitForTimeout(3100);

async function marks(request: APIRequestContext) {
  const res = await request.get('/api/chores');
  return await res.json() as {
    completions: Array<{ choreId: string; memberId: string; status?: string }>;
    grabs: Array<{ choreId: string; memberId: string }>;
  };
}

test.beforeEach(async ({ request, sandboxDir }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('bk-card', 'Card', [choreChartModule()]), makeScreen('bk-full', 'Wall', [fullscreenModule as never])],
  }));
  // A clean slate: no completions or grabs from an earlier test in this worker.
  writeFileSync(path.join(sandboxDir, 'data', 'chore-completions.json'), JSON.stringify({ completions: [] }));
  await request.put('/api/chores/settings', { data: { grabLimit: 1, grabHold: 'day' } });
  expect((await seedHouseholdChores(request, sandboxDir, household)).ok()).toBe(true);
});

test('a kid grabs a bonus chore, the other kid sees it taken, and the grab limit holds', async ({ page, browser, request }) => {
  await page.goto('/chores');
  await page.getByRole('button', { name: 'Ada', exact: true }).click();
  const bonus = page.getByTestId('bonus-section');
  await expect(bonus).toContainText('Wash the car');

  await page.getByTestId('grab-bk-car').click();
  await expect(page.getByTestId('bonus-row-bk-car')).toContainText('You grabbed it');
  await expect.poll(async () => (await marks(request)).grabs).toContainEqual(expect.objectContaining({ choreId: 'bk-car', memberId: 'bk-ada' }));
  // One at a time: Ada's other Grab it greys out (the row keeps its size),
  // a tap on it says why, and Let it go sits under the name, not where Grab it was.
  await expect(page.getByTestId('yours-bk-car')).toBeVisible();
  await expect(page.getByTestId('grab-bk-porch')).toHaveAttribute('data-at-limit', 'true');
  await settle(page);
  await page.getByTestId('grab-bk-porch').click();
  await expect(page.getByTestId('bonus-notice-bk-porch')).toContainText('Finish your grab first');
  expect((await marks(request)).grabs.filter((g) => g.choreId === 'bk-porch')).toEqual([]);

  // Bram, on another tablet, sees whose it is and cannot take it.
  const other = await browser.newPage();
  await other.goto(new URL('/chores', page.url()).toString());
  await other.getByRole('button', { name: 'Bram', exact: true }).click();
  await expect(other.getByTestId('bonus-row-bk-car')).toContainText("Ada's on it");
  await expect(other.getByTestId('grab-bk-car')).toHaveCount(0);
  await other.close();

  // Finishing it pays Ada and closes it to everyone. Bonus chores never count.
  await settle(page);
  await page.getByTestId('bonus-row-bk-car').getByRole('button', { name: /Wash the car/ }).click();
  await expect(page.getByTestId('bonus-row-bk-car')).toContainText('You got it! +5');
  await expect(page.getByText('0/1 complete')).toBeVisible();
  const after = await marks(request);
  expect(after.completions).toContainEqual(expect.objectContaining({ choreId: 'bk-car', memberId: 'bk-ada' }));
  expect(after.grabs.filter((g) => g.choreId === 'bk-car')).toEqual([]);
});

test('a quick second tap after Let it go does not tick the chore that slides up', async ({ page, request }) => {
  await page.goto('/chores');
  await page.getByRole('button', { name: 'Ada', exact: true }).click();
  await page.getByTestId('grab-bk-car').click();
  const letGo = page.getByTestId('let-go-bk-car');
  await expect(letGo).toBeVisible();
  // Past the list's settle time after the grab, which ignores taps on purpose.
  await settle(page);
  const box = (await letGo.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.click(x, y);
  await expect(page.getByTestId('bonus-row-bk-car')).not.toContainText('You grabbed it');
  // The same spot again, as a kid checking it worked.
  await page.waitForTimeout(400);
  await page.mouse.click(x, y);
  await page.waitForTimeout(800);
  expect((await marks(request)).completions.filter((c) => c.choreId === 'bk-porch')).toEqual([]);
});

test('the household setting lifts the grab limit', async ({ page }) => {
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Chores', exact: true }).click();
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await page.getByTestId('open-chore-settings').click();
  const sheet = page.getByTestId('chore-settings-sheet');
  await sheet.getByRole('radio', { name: /No limit/ }).click();
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/chores/settings') && r.ok());
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await saved;

  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Bram', exact: true }).click();
  await page.getByTestId('grab-bk-car').click();
  await expect(page.getByTestId('bonus-row-bk-car')).toContainText('You grabbed it');
  await settle(page);
  await page.getByTestId('grab-bk-porch').click();
  await expect(page.getByTestId('bonus-row-bk-porch')).toContainText('You grabbed it');
});

test('a slow check that read the old rules does not undo a save', async ({ page }) => {
  // The phone's check reads the file before the save and answers after it.
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  await page.route(/\/api\/chores(\?|$)/, async (route) => {
    if (held || route.request().method() !== 'GET') return route.continue();
    held = true;
    const old = await route.fetch();
    await released;
    await route.fulfill({ response: old });
  });
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Chores', exact: true }).click();
  await expect.poll(() => held).toBe(true);
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await page.getByTestId('open-chore-settings').click();
  const sheet = page.getByTestId('chore-settings-sheet');
  await sheet.getByRole('radio', { name: /No limit/ }).click();
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/chores/settings') && r.ok());
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await saved;
  release();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('grab-rules')).toContainText('No limit on grabs');
});

test('a grown-up marks a chore not today and it leaves the count', async ({ page, request }) => {
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Chores', exact: true }).click();
  await page.getByRole('button', { name: 'Bram', exact: true }).click();
  await expect(page.getByText('0/1 complete')).toBeVisible();

  // Right-click the row itself (a grown-up's row also has a "More" button).
  await page.getByRole('button', { name: /: Make your bed$/ }).click({ button: 'right' });
  await page.getByTestId('chore-action-skip').click();
  await expect(page.getByText('Not today', { exact: true })).toBeVisible();
  // Nothing left to count reads as a day off, not 0/0.
  await expect(page.getByText('Day off!')).toBeVisible();
  await expect.poll(async () => (await marks(request)).completions)
    .toContainEqual(expect.objectContaining({ choreId: 'bk-bed', memberId: 'bk-bram', status: 'skipped' }));

  // A tap takes it away again.
  await page.getByRole('button', { name: /Make your bed, not today/ }).click();
  await expect(page.getByText('0/1 complete')).toBeVisible();
});

test('the wall grabs through the picker and finishes through the grabbed tile', async ({ page, request }) => {
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.goto('/display?screen=bk-full');
  const tile = page.getByTestId('fcc-bonus-bk-porch');
  await expect(tile).toContainText('Grab it');

  await tile.click();
  await page.getByTestId('fcc-grab-pick-bk-bram').click();
  await expect(tile).toContainText('Bram\'s on it');

  await tile.click();
  await page.getByTestId('fcc-grab-done').click();
  await expect(tile).toContainText('Bram did it');
  await expect.poll(async () => (await marks(request)).completions)
    .toContainEqual(expect.objectContaining({ choreId: 'bk-porch', memberId: 'bk-bram' }));
});

test('a put-back chore done yesterday waits for a grown-up, who puts it back from the row', async ({ page, sandboxDir }) => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  writeFileSync(path.join(sandboxDir, 'data', 'chore-completions.json'), JSON.stringify({
    completions: [{ choreId: 'bk-garage', memberId: 'bk-ada', date: yesterday, at: `${yesterday}T10:00:00.000Z` }],
  }));
  // Seeding just made it a bonus chore, which starts its count now; this one
  // has been a bonus chore since long before yesterday.
  const choresFile = path.join(sandboxDir, 'data', 'chores.json');
  const saved = JSON.parse(readFileSync(choresFile, 'utf8'));
  for (const c of saved.chores) if (c.id === 'bk-garage') c.bonus.since = '2026-01-01T00:00:00.000Z';
  writeFileSync(choresFile, JSON.stringify(saved));

  // Kids: nothing left for them on it, so it is not there.
  await page.goto('/chores');
  await page.getByRole('button', { name: 'Bram', exact: true }).click();
  await expect(page.getByTestId('bonus-row-bk-car')).toBeVisible();
  await expect(page.getByTestId('bonus-row-bk-garage')).toHaveCount(0);

  // Grown-ups: shown as done, with the button that reopens it.
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Chores', exact: true }).click();
  await page.getByRole('button', { name: 'Bram', exact: true }).click();
  await expect(page.getByTestId('bonus-row-bk-garage')).toContainText('Ada did it');
  await page.getByTestId('put-back-bk-garage').click();
  // It asks first: a stray tap would let the garage be paid for twice. The
  // sheet ignores taps for half a second, so a double tap cannot confirm it unread.
  await page.waitForTimeout(600);
  await page.getByRole('dialog').getByRole('button', { name: 'Put it back' }).click();
  await expect(page.getByTestId('grab-bk-garage')).toBeVisible();
  await expect(page.getByTestId('put-back-bk-garage')).toHaveCount(0);
});

test('turning a regular chore into a bonus chore does not count this morning\'s tick', async ({ page, request }) => {
  // Ada ticks the regular "Make your bed", then a grown-up makes it up for grabs.
  await request.post('/api/chores', { data: { choreId: 'bk-bed', memberId: 'bk-ada', date: new Date().toLocaleDateString('en-CA'), direction: 'complete' } });
  const current = await (await request.get('/api/chores/data')).json();
  const chores = current.chores.map((c: { id: string }) => (c.id === 'bk-bed' ? { ...c, bonus: { claim: 'first', comesBack: 'daily' } } : c));
  expect((await request.put('/api/chores/data', { data: { chores, revision: current.revision } })).ok()).toBe(true);

  await page.goto('/chores');
  await page.getByRole('button', { name: 'Bram', exact: true }).click();
  await expect(page.getByTestId('grab-bk-bed')).toBeVisible();
});
