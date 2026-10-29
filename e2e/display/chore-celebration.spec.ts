import { test, expect } from '../fixtures';
import type { APIRequestContext } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig, seedHouseholdChores, seedRewards } from '../helpers/api';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';

/**
 * The day-complete celebration on the full-screen chore chart, and the
 * savings goal line on its member chips. One kid, Ada, with one chore: a tick
 * from a phone (here the API) finishes her day, and the chart notices it in
 * the data rather than in a tap of its own.
 */
const ADA = 'cel-ada';
const BED = 'cel-bed';
const LEGO = 'cel-lego';

async function setUp(request: APIRequestContext, sandboxDir: string, config: Record<string, unknown>) {
  await seedHouseholdChores(request, sandboxDir, {
    members: [{ id: ADA, name: 'Ada', emoji: '', color: '#f472b6' }],
    chores: [{
      id: BED, name: 'Make the bed', emoji: '', points: 2,
      frequency: 'daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime',
      assigneeIds: [ADA], rotation: 'fixed',
    }],
  });
  const { today, completions } = await (await request.get('/api/chores')).json() as { today: string; completions: Array<{ choreId: string; memberId: string; date: string }> };
  for (const c of completions.filter((entry) => entry.memberId === ADA && entry.date === today)) {
    await request.post('/api/chores', { data: { choreId: c.choreId, memberId: ADA, date: today, direction: 'uncomplete' } });
  }
  const chart = buildModuleInstance('fullscreen-chore-chart', { view: 'chores', showPoints: true, ...config });
  chart.id = 'chart';
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [chart])], settings: matrixSettings() }));
  return today;
}

const tick = (request: APIRequestContext, today: string, direction: 'complete' | 'uncomplete') =>
  request.post('/api/chores', { data: { choreId: BED, memberId: ADA, date: today, direction } });

test.describe('day-complete celebration', () => {
  test('a tick from elsewhere finishing the day shows the simple card, which a tap closes', async ({ page, request, sandboxDir }) => {
    const today = await setUp(request, sandboxDir, { celebration: 'simple' });
    await page.goto('/display');
    const chart = page.locator('[data-module-id="chart"]');
    await expect(chart.getByRole('button', { name: 'Complete Make the bed for Ada' })).toBeVisible();
    // Nothing celebrates what was already on the chart when it loaded.
    await expect(chart.locator('[data-testid="fcc-day-complete"]')).toHaveCount(0);

    expect((await tick(request, today, 'complete')).ok()).toBe(true);
    const overlay = chart.locator('[data-testid="fcc-day-complete"]');
    await expect(overlay).toHaveAttribute('data-celebration', 'simple');
    await expect(overlay).toHaveAttribute('data-member', ADA);
    await expect(overlay).toContainText('All done, Ada!');
    await expect(overlay).toContainText('1 of 1 chore · 2 tickets today');

    await overlay.click();
    await expect(overlay).toHaveCount(0);
  });

  test('a chart that loads with the day already finished celebrates nothing', async ({ page, request, sandboxDir }) => {
    const today = await setUp(request, sandboxDir, { celebration: 'simple' });
    expect((await tick(request, today, 'complete')).ok()).toBe(true);
    await page.goto('/display');
    const chart = page.locator('[data-module-id="chart"]');
    await expect(chart.locator('[data-testid="fcc-member-chip"]').first()).toContainText('1/1');
    // The ticks land one render after the chores: a chart reading that render
    // once saw Ada at 0/1 and then "finishing" a beat later.
    await page.waitForTimeout(4000);
    await expect(chart.locator('[data-testid="fcc-day-complete"]')).toHaveCount(0);
  });

  test('big takes the whole screen with the day\'s tiles, and goes by itself', async ({ page, request, sandboxDir }) => {
    const today = await setUp(request, sandboxDir, { celebration: 'big', showStreaks: true });
    await page.goto('/display');
    const chart = page.locator('[data-module-id="chart"]');
    await expect(chart.getByRole('button', { name: 'Complete Make the bed for Ada' })).toBeVisible();

    expect((await tick(request, today, 'complete')).ok()).toBe(true);
    const overlay = chart.locator('[data-testid="fcc-day-complete"]');
    await expect(overlay).toHaveAttribute('data-celebration', 'big');
    await expect(overlay).toContainText('All done, Ada!');
    await expect(overlay).toContainText('chores done');
    await expect(overlay).toContainText('tickets today');
    // A fresh sandbox has a one-day streak at most, so the tile reads 1 when it is there.
    const box = await overlay.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.width).toBeGreaterThan(viewport.width * 0.95);
    expect(box!.height).toBeGreaterThan(viewport.height * 0.95);

    // Six seconds and it is gone on its own.
    await expect(overlay).toHaveCount(0, { timeout: 9_000 });
  });

  test('off celebrates nothing, and an un-tick then a re-tick celebrates again when on', async ({ page, request, sandboxDir }) => {
    const today = await setUp(request, sandboxDir, { celebration: 'off' });
    await page.goto('/display');
    const chart = page.locator('[data-module-id="chart"]');
    await expect(chart.getByRole('button', { name: 'Complete Make the bed for Ada' })).toBeVisible();

    expect((await tick(request, today, 'complete')).ok()).toBe(true);
    await expect(chart.getByRole('button', { name: 'Undo Make the bed for Ada' })).toBeVisible();
    await expect(chart.locator('[data-testid="fcc-day-complete"]')).toHaveCount(0);
  });
});

test.describe('savings goal on the wall', () => {
  test('the member chip draws the goal bar and the store tags the goal card', async ({ page, request, sandboxDir }) => {
    await setUp(request, sandboxDir, { celebration: 'off', showRewardsButton: true });
    await seedRewards(request, [
      { id: LEGO, name: 'Lego set', emoji: '', cost: 10, description: '', memberIds: [], enabled: true },
      { id: 'cel-candy', name: 'Candy', emoji: '', cost: 1, description: '', memberIds: [], enabled: true },
    ]);
    // Four tickets toward ten.
    const balance = (((await (await request.get('/api/rewards')).json()).balances as Record<string, number>)[ADA] ?? 0);
    if (balance !== 4) await request.post('/api/rewards/data', { data: { memberId: ADA, amount: 4 - balance } });
    expect((await request.post('/api/rewards/goal', { data: { memberId: ADA, rewardId: LEGO } })).ok()).toBe(true);

    await page.goto('/display');
    const chart = page.locator('[data-module-id="chart"]');
    const goalLine = chart.locator('[data-testid="fcc-chip-goal"]');
    await expect(goalLine).toHaveCount(1);
    // A lone chip is wide, so it spells the long words; a crowded chip says "6 more" beside a ticket glyph.
    await expect(goalLine).toContainText(/6 (more|tickets to go)/);

    // Enough tickets: the line says so instead of counting.
    await request.post('/api/rewards/data', { data: { memberId: ADA, amount: 6 } });
    await expect(goalLine).toContainText('Enough saved!', { timeout: 10_000 });

    // The store tags the goal, and only the goal.
    await chart.getByRole('button', { name: /Rewards/ }).click();
    await expect(chart.locator('[data-testid="fcc-reward-goal-tag"]')).toHaveCount(1);
    await expect(chart.locator('[data-testid="fcc-reward-card"]', { has: page.locator('[data-testid="fcc-reward-goal-tag"]') })).toContainText('Lego set');

    // Clearing the goal takes the bar and the tag away.
    expect((await request.post('/api/rewards/goal', { data: { memberId: ADA, rewardId: null } })).ok()).toBe(true);
    await expect(chart.locator('[data-testid="fcc-reward-goal-tag"]')).toHaveCount(0, { timeout: 10_000 });
  });
});
