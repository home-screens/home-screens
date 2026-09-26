import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig, seedHouseholdChores, seedRedemptions, seedRewards } from '../helpers/api';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';

/**
 * The rewards store on the regular chore chart card. Two kids: Sol has tickets,
 * Rio has none. Balances are read as deltas because the sandbox keeps its data
 * between tests and a retry credits again.
 */
const SOL = 'crs-sol';
const RIO = 'crs-rio';

interface SetUpOptions {
  type?: 'chore-chart' | 'fullscreen-chore-chart';
  size?: { w: number; h: number };
  /** Extra people with no tickets, for the big-family cases. */
  extraMembers?: number;
  rewards?: number;
}

async function setUp(request: APIRequestContext, sandboxDir: string, config: Record<string, unknown>, options: SetUpOptions = {}) {
  const extras = Array.from({ length: options.extraMembers ?? 0 }, (_, i) => ({ id: `crs-x${i}`, name: `Kid${i}`, emoji: '', color: '#a78bfa' }));
  await seedHouseholdChores(request, sandboxDir, {
    members: [
      { id: SOL, name: 'Sol', emoji: '', color: '#f59e0b' },
      { id: RIO, name: 'Rio', emoji: '', color: '#60a5fa' },
      ...extras,
    ],
    chores: [{
      id: 'crs-c', name: 'Make the bed', emoji: '', points: 1,
      frequency: 'daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime',
      assigneeIds: [SOL], rotation: 'fixed',
    }],
  });
  seedRedemptions(sandboxDir, []);
  await seedRewards(request, [
    { id: 'crs-candy', name: 'Candy', emoji: '', cost: 2, description: '', memberIds: [], enabled: true },
    { id: 'crs-trip', name: 'Zoo Trip', emoji: '', cost: 500, description: '', memberIds: [], enabled: true },
  ].slice(0, options.rewards ?? 2));
  await request.post('/api/rewards/data', { data: { memberId: SOL, amount: 10 } });
  const mod = buildModuleInstance(options.type ?? 'chore-chart', { view: 'rewards-store', ...config });
  mod.id = 'store';
  if (options.size) mod.size = options.size;
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [mod])], settings: matrixSettings() }));
}

const balanceOf = async (request: APIRequestContext, id: string) =>
  (((await (await request.get('/api/rewards')).json()).balances as Record<string, number>)[id] ?? 0);

async function confirmRedeem(page: Page) {
  const posted = page.waitForResponse((r) => r.url().includes('/api/rewards') && r.request().method() === 'POST' && r.ok());
  await page.getByTestId('store-confirm').click();
  await posted;
}

test.describe('chore-chart rewards store', () => {
  test('list: redeeming asks first, spends the tickets and says so', async ({ page, request, sandboxDir }) => {
    await setUp(request, sandboxDir, { storeLayout: 'list' });
    const before = await balanceOf(request, SOL);
    await page.goto('/display');
    const mod = page.locator('[data-module-id="store"]');

    // Sol is picked first: Candy can be redeemed, the Zoo Trip cannot.
    await expect(mod.getByTestId('store-balance')).toContainText(String(before));
    await expect(mod.getByTestId('store-redeem')).toHaveCount(1);
    await expect(mod).toContainText(`${500 - before} more tickets to go`);

    await mod.getByTestId('store-redeem').click();
    await expect(mod.getByTestId('store-confirm-sheet')).toContainText('Candy for Sol?');
    await expect(mod.getByTestId('store-confirm-sheet')).toContainText(`Sol will have ${before - 2} left`);
    await confirmRedeem(page);

    await expect(mod.getByTestId('store-redeemed')).toContainText('Sol spent 2 tickets on Candy');
    await expect(mod.getByTestId('store-balance')).toContainText(String(before - 2));
    await expect.poll(() => balanceOf(request, SOL)).toBe(before - 2);

    // Rio has nothing, so nothing is on offer to tap.
    await mod.getByRole('button', { name: 'Rio' }).click();
    await expect(mod.getByTestId('store-redeem')).toHaveCount(0);
  });

  test('list: Not now spends nothing', async ({ page, request, sandboxDir }) => {
    await setUp(request, sandboxDir, { storeLayout: 'list' });
    const before = await balanceOf(request, SOL);
    await page.goto('/display');
    const mod = page.locator('[data-module-id="store"]');

    await mod.getByTestId('store-redeem').click();
    await mod.getByTestId('store-cancel').click();
    await expect(mod.getByTestId('store-confirm-sheet')).toHaveCount(0);
    expect(await balanceOf(request, SOL)).toBe(before);
  });

  test('price list: a reward asks who it is for, and only offers people who can afford it', async ({ page, request, sandboxDir }) => {
    await setUp(request, sandboxDir, { storeLayout: 'price-list' });
    const before = await balanceOf(request, SOL);
    await page.goto('/display');
    const mod = page.locator('[data-module-id="store"]');

    await expect(mod.getByTestId('store-reward').filter({ hasText: 'Candy' })).toContainText('1 can get it');
    // Nobody can afford the trip, so its row is not a button anyone can press.
    await expect(mod.getByTestId('store-reward').filter({ hasText: 'Zoo Trip' })).toBeDisabled();

    await mod.getByTestId('store-reward').filter({ hasText: 'Candy' }).click();
    const sheet = mod.getByTestId('store-who-sheet');
    await expect(sheet).toContainText('Who is Candy for?');
    await expect(sheet.getByRole('button', { name: 'Rio' })).toBeDisabled();
    await sheet.getByRole('button', { name: 'Sol' }).click();

    await expect(mod.getByTestId('store-confirm-sheet')).toContainText('Candy for Sol?');
    await confirmRedeem(page);
    await expect.poll(() => balanceOf(request, SOL)).toBe(before - 2);
    await expect(mod.getByTestId('store-who-sheet')).toHaveCount(0);
  });

  test('with tapping off it is a price list with nothing to press', async ({ page, request, sandboxDir }) => {
    await setUp(request, sandboxDir, { storeLayout: 'list', allowDisplayComplete: false });
    await page.goto('/display');
    const mod = page.locator('[data-module-id="store"]');

    await expect(mod.getByTestId('store-reward')).toHaveCount(2);
    await expect(mod.getByTestId('store-redeem')).toHaveCount(0);
    await expect(mod).not.toContainText('more tickets to go');
  });

  test('History opens the reward history in place and comes back', async ({ page, request, sandboxDir }) => {
    await setUp(request, sandboxDir, { storeLayout: 'tiles' });
    await page.goto('/display');
    const mod = page.locator('[data-module-id="store"]');

    // Nothing redeemed yet: no History button.
    await expect(mod.getByTestId('store-reward')).toHaveCount(2);
    await expect(mod.getByTestId('store-history')).toHaveCount(0);

    await mod.getByTestId('store-redeem').click();
    await confirmRedeem(page);
    await mod.getByTestId('store-history').click();
    await expect(mod).toContainText('Reward History');
    await expect(mod.locator('[data-chore-row]')).toContainText(['Candy']);

    await mod.getByTestId('history-back').click();
    await expect(mod.getByTestId('store-view')).toBeVisible();
  });

  /**
   * The chores and family polls rebuild everyone's balances from the shared
   * rewards data. A redeem that only told the store about itself was undone by
   * the next one: 8 of 10 spent, then 10 again with Redeem back on, while the
   * server held 2. The rewards poll is held here so nothing else can paper
   * over it.
   */
  for (const type of ['chore-chart', 'fullscreen-chore-chart'] as const) {
    test(`${type}: a spent balance survives the next poll of something else`, async ({ page, request, sandboxDir }) => {
      await setUp(request, sandboxDir, { storeLayout: 'list' }, { type });
      const before = await balanceOf(request, SOL);
      await page.goto('/display');
      const mod = page.locator('[data-module-id="store"]');
      const redeemButton = type === 'chore-chart' ? mod.getByTestId('store-redeem') : mod.getByTestId('fcc-redeem-pill');
      await expect(redeemButton).toHaveCount(1);

      await page.route('**/api/rewards', (route) => (route.request().method() === 'GET' ? new Promise<void>(() => {}) : route.continue()));
      await redeemButton.click();
      const posted = page.waitForResponse((r) => r.url().includes('/api/rewards') && r.request().method() === 'POST' && r.ok());
      await mod.getByRole('button', { name: 'Yes!' }).click();
      await posted;
      await expect(mod).toContainText(String(before - 2));

      // Two more chores reads land; the balance they rebuild must be the spent
      // one. A wall reads the chores when they change, so change them twice
      // (from another screen) without touching the rewards.
      for (const grabLimit of [2, 1]) {
        const read = page.waitForResponse((r) => /\/api\/chores(\?|$)/.test(r.url()) && r.request().method() === 'GET');
        expect((await request.put('/api/chores/settings', { data: { grabLimit, grabHold: 'day' } })).ok()).toBe(true);
        await read;
      }
      await expect(mod.getByText(String(before), { exact: true })).toHaveCount(0);
      await expect(mod).toContainText(String(before - 2));
    });
  }

  test('a big family in a short card can still get out of the who-is-it-for sheet', async ({ page, request, sandboxDir }) => {
    await setUp(request, sandboxDir, { storeLayout: 'price-list' }, { size: { w: 900, h: 300 }, extraMembers: 5 });
    await page.goto('/display');
    const mod = page.locator('[data-module-id="store"]');

    await mod.getByTestId('store-reward').filter({ hasText: 'Candy' }).click();
    const cancel = mod.getByTestId('store-who-cancel');
    const [card, button] = await Promise.all([mod.boundingBox(), cancel.boundingBox()]);
    expect(button!.y + button!.height).toBeLessThanOrEqual(card!.y + card!.height);
    // And everyone is on show without scrolling the sheet.
    await expect(mod.getByTestId('store-who')).toHaveCount(7);
    const lastPerson = (await mod.getByTestId('store-who').last().boundingBox())!;
    expect(lastPerson.y + lastPerson.height).toBeLessThanOrEqual(button!.y);
    await cancel.click();
    await expect(mod.getByTestId('store-who-sheet')).toHaveCount(0);
  });

  test('a big family in a very short card keeps the balance and every person in reach', async ({ page, request, sandboxDir }) => {
    await setUp(request, sandboxDir, { storeLayout: 'list' }, { size: { w: 900, h: 240 }, extraMembers: 5, rewards: 1 });
    await page.goto('/display');
    const mod = page.locator('[data-module-id="store"]');
    await expect(mod.getByTestId('store-rail')).toBeVisible();

    const card = (await mod.boundingBox())!;
    const bottom = card.y + card.height;
    const balance = (await mod.getByTestId('store-balance').boundingBox())!;
    expect(balance.y + balance.height).toBeLessThanOrEqual(bottom);

    const last = mod.getByTestId('store-member').last();
    await last.scrollIntoViewIfNeeded();
    const chip = (await last.boundingBox())!;
    expect(chip.y + chip.height).toBeLessThanOrEqual(bottom);
    await last.click();
    await expect(mod.getByTestId('store-balance')).toContainText('Kid4');
  });
});
