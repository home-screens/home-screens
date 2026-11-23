import { test, expect } from '../fixtures';
import type { APIRequestContext } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig, seedHouseholdChores, seedRedemptions, seedRewards } from '../helpers/api';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
import { localDate } from '../helpers/dates';

/**
 * The grown-up code: the hub refuses a ticked job without an unlock, the wall
 * and the kids' chores page ask for the code and send the job again, and a
 * right code keeps that page unlocked for the minutes set. The sandbox has no
 * password, so the editor's routes need no session.
 */
const SOL = 'guc-sol';
const CODE = '2468';

async function setUp(request: APIRequestContext, sandboxDir: string) {
  await seedHouseholdChores(request, sandboxDir, {
    members: [{ id: SOL, name: 'Sol', emoji: '', color: '#f59e0b' }],
    chores: [{
      id: 'guc-bed', name: 'Make the bed', emoji: '', points: 3,
      frequency: 'daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime',
      assigneeIds: [SOL], rotation: 'fixed',
    }],
  });
  seedRedemptions(sandboxDir, []);
  await seedRewards(request, [{ id: 'guc-candy', name: 'Candy', emoji: '', cost: 2, description: '', memberIds: [], enabled: true }]);
  await request.post('/api/rewards/data', { data: { memberId: SOL, amount: 10 } });
  const store = buildModuleInstance('chore-chart', { view: 'rewards-store', storeLayout: 'list' });
  store.id = 'store';
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [store])], settings: matrixSettings() }));
}

async function setCode(request: APIRequestContext, prefs: Record<string, unknown> = {}) {
  const set = await request.put('/api/grown-up-code', { data: { code: CODE } });
  expect(set.ok()).toBe(true);
  if (Object.keys(prefs).length) expect((await request.put('/api/grown-up-code', { data: prefs })).ok()).toBe(true);
}

test.afterEach(async ({ request }) => {
  await request.delete('/api/grown-up-code');
});

test.describe('grown-up code on the hub', () => {
  test('a ticked job is refused without an unlock and goes through with one', async ({ request, sandboxDir }) => {
    await setUp(request, sandboxDir);
    await setCode(request, { actions: ['redeem', 'untick'] });

    const status = await (await request.get('/api/grown-up-code')).json();
    expect(status).toMatchObject({ set: true, actions: ['redeem', 'untick'], unlockMinutes: 5 });
    expect(JSON.stringify(status)).not.toContain(CODE);

    const redeem = (headers: Record<string, string> = {}) => request.post('/api/rewards', { data: { rewardId: 'guc-candy', memberId: SOL }, headers });
    const refused = await redeem();
    expect(refused.status()).toBe(403);
    expect(await refused.json()).toMatchObject({ needsGrownUpCode: true, action: 'redeem' });

    expect((await request.post('/api/grown-up-code/unlock', { data: { code: '1111' } })).status()).toBe(422);
    const unlock = await request.post('/api/grown-up-code/unlock', { data: { code: CODE } });
    expect(unlock.ok()).toBe(true);
    const { token } = await unlock.json();
    expect((await redeem({ 'x-hs-grown-up': token })).ok()).toBe(true);

    // A tick needs nothing; the untick of it does.
    const today = localDate(0);
    const tick = await request.post('/api/chores', { data: { choreId: 'guc-bed', memberId: SOL, date: today, direction: 'complete' } });
    expect(tick.ok()).toBe(true);
    const untick = await request.post('/api/chores', { data: { choreId: 'guc-bed', memberId: SOL, date: today, direction: 'uncomplete' } });
    expect(untick.status()).toBe(403);
    expect((await request.post('/api/chores', { data: { choreId: 'guc-bed', memberId: SOL, date: today, direction: 'uncomplete' }, headers: { 'x-hs-grown-up': token } })).ok()).toBe(true);
  });

  test('removing the code lets every job through again', async ({ request, sandboxDir }) => {
    await setUp(request, sandboxDir);
    await setCode(request);
    expect((await request.delete('/api/grown-up-code')).ok()).toBe(true);
    expect(await (await request.get('/api/grown-up-code')).json()).toMatchObject({ set: false });
    expect((await request.post('/api/rewards', { data: { rewardId: 'guc-candy', memberId: SOL } })).ok()).toBe(true);
    expect((await request.post('/api/grown-up-code/unlock', { data: { code: CODE } })).status()).toBe(409);
  });
});

test.describe('grown-up code on the wall', () => {
  test('the store asks before it spends, takes the code, and stays unlocked until Lock now', async ({ page, request, sandboxDir }) => {
    await setUp(request, sandboxDir);
    await setCode(request);
    await page.goto('/display');
    const mod = page.locator('[data-module-id="store"]');

    await mod.getByTestId('store-redeem').click();
    await expect(mod.getByTestId('store-confirm')).toHaveText('Ask a grown-up');
    await mod.getByTestId('store-confirm').click();

    const pad = page.getByTestId('grown-up-pad');
    await expect(pad).toBeVisible();
    await expect(pad).toContainText('To spend 2 of Sol\'s tickets on Candy');
    for (const digit of '1111') await pad.getByTestId(`grown-up-key-${digit}`).click();
    await expect(pad.getByTestId('grown-up-message')).toHaveText("That's not it. Try again.");
    await expect(pad.getByTestId('grown-up-dots')).toHaveAttribute('data-filled', '0');

    const redeemed = page.waitForResponse((r) => r.url().endsWith('/api/rewards') && r.request().method() === 'POST' && r.ok());
    for (const digit of CODE) await pad.getByTestId(`grown-up-key-${digit}`).click();
    await redeemed;
    await expect(pad).toBeHidden();
    await expect(mod.getByTestId('store-redeemed')).toContainText('Sol spent 2 tickets on Candy');

    // Unlocked: the next spend says plain Yes and asks nothing.
    const chip = page.getByTestId('grown-up-unlocked');
    await expect(chip).toContainText('Unlocked for 5 more minutes');
    await mod.getByTestId('store-redeem').click();
    await expect(mod.getByTestId('store-confirm')).not.toHaveText('Ask a grown-up');
    await mod.getByTestId('store-cancel').click();

    await chip.getByTestId('grown-up-lock-now').click();
    await expect(chip).toBeHidden();
    await mod.getByTestId('store-redeem').click();
    await expect(mod.getByTestId('store-confirm')).toHaveText('Ask a grown-up');
  });

  test('Cancel sends nothing and leaves the sheet up', async ({ page, request, sandboxDir }) => {
    await setUp(request, sandboxDir);
    await setCode(request);
    const before = (await (await request.get('/api/rewards')).json()).balances[SOL];
    await page.goto('/display');
    const mod = page.locator('[data-module-id="store"]');
    await mod.getByTestId('store-redeem').click();
    await mod.getByTestId('store-confirm').click();
    await page.getByTestId('grown-up-pad').getByTestId('grown-up-cancel').click();
    await expect(page.getByTestId('grown-up-pad')).toBeHidden();
    await expect(mod.getByTestId('store-confirm-sheet')).toBeVisible();
    await expect(mod.getByTestId('store-error')).toHaveCount(0);
    expect((await (await request.get('/api/rewards')).json()).balances[SOL]).toBe(before);
  });

  test('five wrong codes make the pad wait', async ({ page, request, sandboxDir }) => {
    await setUp(request, sandboxDir);
    await setCode(request);
    await page.goto('/display');
    const mod = page.locator('[data-module-id="store"]');
    await mod.getByTestId('store-redeem').click();
    await mod.getByTestId('store-confirm').click();
    const pad = page.getByTestId('grown-up-pad');
    for (let i = 0; i < 5; i++) {
      for (const digit of '9999') await pad.getByTestId(`grown-up-key-${digit}`).click();
      if (i < 4) await expect(pad.getByTestId('grown-up-dots')).toHaveAttribute('data-filled', '0');
    }
    await expect(pad.getByTestId('grown-up-message')).toContainText('Too many tries');
    await expect(pad.getByTestId('grown-up-key-1')).toBeDisabled();
  });
});

test.describe('grown-up code on the kids\' chores page', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('a kid spending tickets is asked for the code, and the right one spends them', async ({ page, request, sandboxDir }) => {
    await setUp(request, sandboxDir);
    await setCode(request);
    await page.goto('/chores');
    await page.getByRole('tab', { name: 'Rewards' }).first().click();
    await page.getByText('Candy', { exact: true }).first().click();
    const sheet = page.getByTestId('confirm-sheet');
    await expect(sheet).toContainText('Ask a grown-up');
    await sheet.getByRole('button', { name: 'Ask a grown-up' }).click();
    const pad = page.getByTestId('grown-up-sheet');
    await expect(pad).toBeVisible();
    const redeemed = page.waitForResponse((r) => r.url().endsWith('/api/rewards') && r.request().method() === 'POST' && r.ok());
    for (const digit of CODE) await pad.getByTestId(`grown-up-key-${digit}`).click();
    await redeemed;
    await expect(pad).toBeHidden();
  });
});
