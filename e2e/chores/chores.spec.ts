import { seedHouseholdChores, seedRewards } from '../helpers/api';
import { test, expect } from '../fixtures';
import type { APIRequestContext } from '@playwright/test';
import { putConfig } from '../helpers/api';
import { confirmSheet } from '../helpers/remote';
import { baseConfig, choreChartModule, makeScreen } from '../helpers/config-fixtures';

/** Local YYYY-MM-DD for today, matching how the chore store keys completions. */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function completionExists(
  request: APIRequestContext,
  choreId: string,
  memberId: string,
  date: string,
): Promise<boolean> {
  const res = await request.get('/api/chores');
  const completions = (await res.json()).completions as Array<{ choreId: string; memberId: string; date: string }>;
  return completions.some((c) => c.choreId === choreId && c.memberId === memberId && c.date === date);
}

const CHORE_DATA = {
  members: [{ id: 'm1', name: 'Avery', emoji: '🦊', color: '#f59e0b' }],
  chores: [{
    id: 'c1',
    name: 'Feed the dog',
    emoji: '🐶',
    points: 1,
    frequency: 'daily',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    timeOfDay: 'anytime',
    assigneeIds: ['m1'],
    rotation: 'fixed',
  }],
};

test.beforeEach(async ({ request, sandboxDir }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [choreChartModule()])],
  }));
  const res = await seedHouseholdChores(request, sandboxDir, CHORE_DATA);
  expect(res.ok()).toBe(true);
});

test('kid view lists today\'s chores without the Manage view', async ({ page }) => {
  await page.goto('/chores');
  await expect(page.getByText('Feed the dog')).toBeVisible();
  // The heading says whose chart this is: a shared tablet opens on whoever
  // used it last, and the name pill alone never said so.
  await expect(page.getByRole('heading', { name: 'Avery\u2019s chores' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Avery', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manage', exact: true })).toBeHidden();
});

test('kid can check off a chore and it persists', async ({ page, request }) => {
  await page.goto('/chores');
  const toggled = page.waitForResponse(
    (r) => r.url().includes('/api/chores') && r.request().method() === 'POST' && r.ok(),
  );
  await page.getByText('Feed the dog').click();
  await toggled;

  await expect
    .poll(async () => {
      const res = await request.get('/api/chores');
      const body = await res.json();
      return body.completions as Array<{ choreId: string; memberId: string }>;
    })
    .toContainEqual(expect.objectContaining({ choreId: 'c1', memberId: 'm1' }));

  // Survives a reload — state lives in data/chore-completions.json, not the DOM
  await page.reload();
  await expect(page.getByText('Feed the dog')).toBeVisible();
});

test('admin view on /remote shows the Manage view', async ({ page }) => {
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Chores', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Manage', exact: true })).toBeVisible();
});

test('the Manage view offers the starter list and adds the picked chores to the group', async ({ page, request, sandboxDir }) => {
  // An empty chore list with a Kids group: the start card replaces "No chores yet".
  await seedHouseholdChores(request, sandboxDir, {
    members: [
      { id: 'k1', name: 'Ada', emoji: '', color: '#f472b6' },
      { id: 'k2', name: 'Bram', emoji: '', color: '#60a5fa' },
      { id: 'p1', name: 'Mom', emoji: '', color: '#94a3b8' },
    ],
    groups: [{ id: 'g-kids', name: 'Kids', memberIds: ['k1', 'k2'] }],
    chores: [],
  });

  await page.goto('/remote');
  await page.getByRole('button', { name: 'Chores', exact: true }).click();
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await expect(page.getByText('Start with ready-made chores')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Write your own' })).toBeVisible();
  await page.getByTestId('starter-open').click();

  const sheet = page.getByRole('dialog', { name: 'Starter chores' });
  await expect(sheet).toBeVisible();
  // The Kids group is picked by default; the people are not.
  await expect(sheet.getByRole('button', { name: /Kids/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.getByRole('button', { name: 'Ada', exact: true })).toHaveAttribute('aria-pressed', 'false');
  const add = page.getByTestId('starter-add');
  await expect(add).toBeDisabled();
  await expect(add).toHaveText('Pick some chores');

  await page.getByTestId('starter-make-bed').click();
  await page.getByTestId('starter-take-out-trash').click();
  await expect(add).toHaveText('Add 2 chores');
  // Weekly starters land on Saturday unless another day is picked for the section.
  await expect(page.getByTestId('starter-weekly-day-6')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('starter-weekly-day-2').click();
  // "All" on a section ticks every row in it; the footer counts them.
  await page.getByTestId('starter-section-afternoon').getByRole('button', { name: 'All', exact: true }).click();
  await expect(add).toHaveText('Add 7 chores');
  await page.getByTestId('starter-section-afternoon').getByRole('button', { name: 'None', exact: true }).click();
  await expect(add).toHaveText('Add 2 chores');

  const saved = page.waitForResponse((r) => r.url().includes('/api/chores/data') && r.request().method() === 'PUT' && r.ok());
  await add.click();
  await saved;
  await expect(sheet).toBeHidden();
  await expect(page.getByText('Make your bed')).toBeVisible();
  await expect(page.getByText('Take out the trash')).toBeVisible();
  await expect(page.getByText('Start with ready-made chores')).toBeHidden();

  // Saved as ordinary chores: daily morning for the bed, weekly on Tuesday for the trash, both to the Kids group.
  const data = await (await request.get('/api/chores/data')).json();
  const chores = data.chores as Array<{ name: string; frequency: string; daysOfWeek: number[]; timeOfDay: string; points: number; emoji: string; assigneeIds: string[]; assigneeGroupIds?: string[]; rotation: string }>;
  expect(chores.map((c) => c.name)).toEqual(['Make your bed', 'Take out the trash']);
  expect(chores[0]).toMatchObject({ frequency: 'daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'morning', points: 1, emoji: 'lucide:bed', assigneeIds: [], assigneeGroupIds: ['g-kids'], rotation: 'fixed' });
  expect(chores[1]).toMatchObject({ frequency: 'weekly', daysOfWeek: [2], timeOfDay: 'anytime', points: 3, emoji: 'lucide:trash', assigneeGroupIds: ['g-kids'] });

  // Reopened from the link under Add Chore, the two are marked and cannot be picked again.
  await page.getByTestId('starter-link').click();
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId('starter-make-bed')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('starter-make-bed')).toContainText('Already added');
  // Playwright refuses a normal click on an aria-disabled control; dispatch one to prove the row ignores taps.
  await page.getByTestId('starter-make-bed').dispatchEvent('click');
  await expect(add).toBeDisabled();
});

test('/chores shows the empty state when no chore module is configured', async ({ page, request }) => {
  await putConfig(request, baseConfig()); // no chore-chart module
  await page.goto('/chores');
  await expect(page.getByText('Feed the dog')).toBeHidden();

  // With no chore module the page renders ChoresEmptyState. Pin the verbatim
  // string (remote.choresKidView.notConfigured): a kid opens this page from a
  // fridge QR code, so it has to speak to the kid and point the grown-up at
  // the phone surface, not at "modules" and "the editor".
  await expect(
    page.getByText('No chores yet. Ask a grown-up to add a chore chart to the display.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Grown-ups: open the family remote' })).toHaveAttribute('href', '/remote');
});

// ── Rewards on the kid surface ────────────────────────────────────────
//
// The kid rewards view is redeem + history only (no manage/balances). These
// specs use their own member/reward IDs because reward balances and chore
// completions persist per-worker across tests.

test('kid redeems a reward and the balance decrements with a history entry', async ({ page, request, sandboxDir }) => {
  await seedHouseholdChores(request, sandboxDir, { members: [{ id: 'm-kr', name: 'Remy', emoji: '🦊', color: '#f59e0b' }], chores: [] });
  await seedRewards(request, [{
        id: 'rw-kr', name: 'Movie Night', emoji: 'lucide:popcorn', cost: 2,
        description: '', memberIds: [], enabled: true,
      }]);
  await request.post('/api/rewards/data', { data: { memberId: 'm-kr', amount: 5 } });

  const readRewards = async () => (await (await request.get('/api/rewards')).json());
  // Delta assertion (a CI retry credits again, so the absolute start can vary).
  const before = ((await readRewards()).balances as Record<string, number>)['m-kr'] ?? 0;

  await page.goto('/chores');
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();

  // Redeem is the default kid rewards view; the reward is affordable (5 ≥ 2).
  const redeemed = page.waitForResponse(
    (r) => r.url().includes('/api/rewards') && r.request().method() === 'POST' && r.ok(),
  );
  await page.getByRole('button', { name: /Movie Night/ }).click();
  await confirmSheet(page).getByRole('button', { name: /Redeem/ }).click();
  await redeemed;

  await expect
    .poll(async () => ((await readRewards()).balances as Record<string, number>)['m-kr'] ?? 0)
    .toBe(before - 2);
  await expect
    .poll(async () => ((await readRewards()).redemptions as Array<{ rewardName: string }>).map((r) => r.rewardName))
    .toContain('Movie Night');

  // The redemption also shows up in the kid-facing History tab.
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByText('Movie Night')).toBeVisible();
});

test('an unaffordable reward is shown disabled in the kid view', async ({ page, request, sandboxDir }) => {
  await seedHouseholdChores(request, sandboxDir, { members: [{ id: 'm-af', name: 'Kai', emoji: '🦊', color: '#f59e0b' }], chores: [] });
  await seedRewards(request, [{
        id: 'rw-af', name: 'Theme Park Day', emoji: 'lucide:ticket', cost: 50,
        description: '', memberIds: [], enabled: true,
      }]);
  await request.post('/api/rewards/data', { data: { memberId: 'm-af', amount: 3 } }); // well below cost

  await page.goto('/chores');
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();

  // Cost outstrips the balance, so the row renders as a disabled button.
  const rewardBtn = page.getByRole('button', { name: /Theme Park Day/ });
  await expect(rewardBtn).toBeVisible();
  await expect(rewardBtn).toBeDisabled();
});

test('kid sees a previously-redeemed reward in the History tab', async ({ page, request, sandboxDir }) => {
  // Unlike the redeem-flow spec above (which redeems through the UI then checks
  // History), this seeds the redemption entirely through the API and asserts the
  // kid can *read back* an existing history entry. Unique IDs keep the redemption
  // out of the other rewards specs (redemptions persist per-worker).
  await seedHouseholdChores(request, sandboxDir, { members: [{ id: 'm-hist', name: 'Pip', emoji: '🦊', color: '#f59e0b' }], chores: [] });
  await seedRewards(request, [{
        id: 'rw-hist', name: 'Ice Cream Trip', emoji: 'lucide:ice-cream', cost: 2,
        description: '', memberIds: [], enabled: true,
      }]);
  await request.post('/api/rewards/data', { data: { memberId: 'm-hist', amount: 5 } }); // balance
  // Redeem through the real POST /api/rewards endpoint — this writes the
  // denormalized redemption record (memberName + rewardName) the History tab reads.
  const redeemed = await request.post('/api/rewards', { data: { rewardId: 'rw-hist', memberId: 'm-hist' } });
  expect(redeemed.ok()).toBe(true);

  await page.goto('/chores');
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await page.getByRole('button', { name: 'History', exact: true }).click();

  // History is Pip's own ticket feed: the reward as a spent row with its cost.
  const feed = page.getByTestId('tickets-feed');
  const row = feed.getByTestId('tickets-row').filter({ hasText: 'Ice Cream Trip' }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText('−2');
  await expect(row).toContainText('Reward');
  // Kids see their own history, never a picker for someone else's.
  await expect(feed.getByRole('button', { name: 'Pip' })).toHaveCount(0);
});

// ── Kid completion toggle & multi-member view ─────────────────────────

test('kid unchecks a completed chore and the completion is removed', async ({ page, request, sandboxDir }) => {
  await seedHouseholdChores(request, sandboxDir, {
      members: [{ id: 'm-uc', name: 'Devon', emoji: '🦊', color: '#f59e0b' }],
      chores: [{
        id: 'c-uc', name: 'Water the plants', emoji: '🌱', points: 1,
        frequency: 'daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime',
        assigneeIds: ['m-uc'], rotation: 'fixed',
      }],
    });
  const today = todayISO();
  // Normalize to "not completed" (completions persist per-worker; a CI retry
  // could start already checked).
  if (await completionExists(request, 'c-uc', 'm-uc', today)) {
    await request.post('/api/chores', { data: { choreId: 'c-uc', memberId: 'm-uc', date: today } });
  }

  await page.goto('/chores');
  const markBtn = page.getByRole('button', { name: 'Mark complete: Water the plants' });
  const doneBtn = page.getByRole('button', { name: 'Completed: Water the plants' });

  // Check on.
  let posted = page.waitForResponse(
    (r) => r.url().includes('/api/chores') && r.request().method() === 'POST' && r.ok(),
  );
  await markBtn.click();
  await posted;
  await expect(doneBtn).toBeVisible();

  // A plain tap does not un-check in the kid view: it shows the hold hint and
  // leaves the completion alone (un-checking a sibling's chore is the number
  // one sibling-war button in a five-kid house).
  await doneBtn.click();
  await expect(page.getByText('Press and hold to un-check')).toBeVisible();
  await expect(doneBtn).toBeVisible();
  expect(await completionExists(request, 'c-uc', 'm-uc', today)).toBe(true);

  // Press and hold un-checks. `delay` keeps the pointer down past the hold
  // duration; the trailing click after the hold must not re-check it.
  posted = page.waitForResponse(
    (r) => r.url().includes('/api/chores') && r.request().method() === 'POST' && r.ok(),
  );
  await doneBtn.click({ delay: 1000 });
  await posted;
  await expect(markBtn).toBeVisible();

  // The un-check persisted — no completion for today remains.
  await expect.poll(async () => completionExists(request, 'c-uc', 'm-uc', today)).toBe(false);
});

test('five-member kid view filters chores by member and keeps an aggregate day summary', async ({ page, request, sandboxDir }) => {
  const members = [
    { id: 'k1', name: 'Ada', emoji: '', color: '#f472b6' },
    { id: 'k2', name: 'Bram', emoji: '', color: '#60a5fa' },
    { id: 'k3', name: 'Cleo', emoji: '', color: '#4ade80' },
    { id: 'k4', name: 'Dax', emoji: '', color: '#fbbf24' },
    { id: 'k5', name: 'Esme', emoji: '', color: '#a78bfa' },
  ];
  const mkChore = (id: string, name: string, memberId: string) => ({
    id, name, emoji: '', points: 1, frequency: 'daily',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime',
    assigneeIds: [memberId], rotation: 'fixed',
  });
  await seedHouseholdChores(request, sandboxDir, {
      members,
      chores: [
        mkChore('kc1', 'Set the table', 'k1'),
        mkChore('kc2', 'Sweep the floor', 'k2'),
        mkChore('kc3', 'Fold laundry', 'k3'),
        mkChore('kc4', 'Wipe counters', 'k4'),
        mkChore('kc5', 'Take out recycling', 'k5'),
      ],
    });

  await page.goto('/chores');

  // All five members render as pills — the view must stay usable past 2-3 kids.
  for (const m of members) {
    await expect(page.getByRole('button', { name: m.name, exact: true })).toBeVisible();
  }

  // The first member with chores is selected by default: only their chore shows.
  await expect(page.getByText('Set the table')).toBeVisible();
  await expect(page.getByText('Sweep the floor')).toBeHidden();

  // Switching members filters the Today list.
  await page.getByRole('button', { name: 'Bram', exact: true }).click();
  await expect(page.getByText('Sweep the floor')).toBeVisible();
  await expect(page.getByText('Set the table')).toBeHidden();

  // The pick is remembered on this device: a reload opens on Bram, not on
  // whoever is first in the list.
  await page.reload();
  await expect(page.getByText('Sweep the floor')).toBeVisible();
  await expect(page.getByText('Set the table')).toBeHidden();

  // Kids get a Yesterday/Today toggle, not the 90-day strip.
  await expect(page.getByRole('button', { name: 'Yesterday', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /View .*, /i })).toHaveCount(0);

  // The grown-up strip on /remote summarizes progress as an aggregate
  // "N of 5" fraction, not five separate per-member visuals.
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Chores', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /of 5 kids earned all their chores/ }).first(),
  ).toBeVisible();
});

test('kid view opens on the first member who has chores today, not the first member', async ({ page, request, sandboxDir }) => {
  await seedHouseholdChores(request, sandboxDir, {
      members: [
        { id: 'p1', name: 'Big Guns', emoji: '', color: '#94a3b8' }, // a grown-up, no chores
        { id: 'k9', name: 'Tenley', emoji: '', color: '#f472b6' },
      ],
      chores: [{
        id: 'kc9', name: 'Make the bed', emoji: '', points: 1, frequency: 'daily',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime', assigneeIds: ['k9'], rotation: 'fixed',
      }],
    });
  await page.goto('/chores');
  await expect(page.getByText('Make the bed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tenley', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('finishing the last chore celebrates and the ticket balance shows on Today', async ({ page, request, sandboxDir }) => {
  await seedHouseholdChores(request, sandboxDir, {
      members: [{ id: 'm-cel', name: 'Wren', emoji: '', color: '#4ade80' }],
      chores: [{
        id: 'c-cel', name: 'Feed the cat', emoji: '', points: 2, frequency: 'daily',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime', assigneeIds: ['m-cel'], rotation: 'fixed',
      }],
    });
  const today = todayISO();
  if (await completionExists(request, 'c-cel', 'm-cel', today)) {
    await request.post('/api/chores', { data: { choreId: 'c-cel', memberId: 'm-cel', date: today } });
  }
  const before = ((await (await request.get('/api/rewards')).json()).balances as Record<string, number>)['m-cel'] ?? 0;

  await page.goto('/chores');
  const balanceChip = page.getByTestId('ticket-balance');
  await expect(balanceChip).toContainText(`${before} ticket${before === 1 ? '' : 's'}`);

  const posted = page.waitForResponse(
    (r) => r.url().includes('/api/chores') && r.request().method() === 'POST' && r.ok(),
  );
  await page.getByRole('button', { name: 'Mark complete: Feed the cat' }).click();
  await posted;

  // The sheet rises with the day's numbers, and Nice! closes it.
  const sheet = page.getByTestId('day-complete-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('All done, Wren!');
  await expect(sheet).toContainText('1 of 1 chore · earned 2 tickets today');
  await sheet.getByRole('button', { name: 'Nice!' }).click();
  await expect(sheet).toBeHidden();
  await expect(balanceChip).toContainText(`${before + 2} tickets`);
});

test('the celebration stays off when the full-screen chart says Off', async ({ page, request, sandboxDir }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [{ ...choreChartModule(), type: 'fullscreen-chore-chart', config: { ...choreChartModule().config, celebration: 'off' } }])],
  }));
  await seedHouseholdChores(request, sandboxDir, {
      members: [{ id: 'm-off', name: 'Ola', emoji: '', color: '#4ade80' }],
      chores: [{
        id: 'c-off', name: 'Water the fern', emoji: '', points: 1, frequency: 'daily',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime', assigneeIds: ['m-off'], rotation: 'fixed',
      }],
    });
  const today = todayISO();
  if (await completionExists(request, 'c-off', 'm-off', today)) {
    await request.post('/api/chores', { data: { choreId: 'c-off', memberId: 'm-off', date: today } });
  }
  await page.goto('/chores');
  const posted = page.waitForResponse((r) => r.url().includes('/api/chores') && r.request().method() === 'POST' && r.ok());
  await page.getByRole('button', { name: 'Mark complete: Water the fern' }).click();
  await posted;
  await expect(page.getByText('All done!')).toBeVisible();
  await expect(page.getByTestId('day-complete-sheet')).toHaveCount(0);
});

// ── Savings goal, steps and the ticket history ────────────────────────

test('kid picks something to save for and sees the bar on Rewards and Today', async ({ page, request, sandboxDir }) => {
  // One chore, so Today has a list (and the header the goal line sits under) rather than the empty state.
  await seedHouseholdChores(request, sandboxDir, {
    members: [{ id: 'm-goal', name: 'Bram', emoji: '', color: '#60a5fa' }],
    chores: [{ id: 'c-goal', name: 'Feed the fish', emoji: '', points: 1, frequency: 'daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime', assigneeIds: ['m-goal'], rotation: 'fixed' }],
  });
  await seedRewards(request, [
    { id: 'rw-lego', name: 'Lego set', emoji: 'lucide:blocks', cost: 10, description: '', memberIds: [], enabled: true },
    { id: 'rw-ice', name: 'Ice cream', emoji: 'lucide:ice-cream', cost: 3, description: '', memberIds: [], enabled: true },
  ]);
  // Four tickets on top of whatever this worker already gave Bram, so the
  // numbers below are read back from the hub rather than assumed.
  await request.post('/api/rewards/data', { data: { memberId: 'm-goal', amount: 4 } });
  await request.post('/api/rewards/goal', { data: { memberId: 'm-goal', rewardId: null } });
  const balance = ((await (await request.get('/api/rewards')).json()).balances as Record<string, number>)['m-goal'] ?? 0;

  await page.goto('/chores');
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await expect(page.getByTestId('savings-goal-empty')).toBeVisible();
  await page.getByTestId('savings-goal-empty').click();

  const saved = page.waitForResponse((r) => r.url().includes('/api/rewards/goal') && r.ok());
  await page.getByTestId('savings-goal-option-rw-lego').click();
  await saved;

  const card = page.getByTestId('savings-goal-card');
  await expect(card).toContainText('Lego set');
  await expect(card).toContainText(`${Math.min(balance, 10)} of 10 tickets`);
  await expect(page.getByTestId('savings-goal-chip')).toBeVisible();
  await expect.poll(async () => ((await (await request.get('/api/rewards')).json()).goals ?? {})['m-goal']).toBe('rw-lego');

  // Today carries one line for it, and a tap goes back to Rewards.
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  const line = page.getByTestId('today-goal-line');
  await expect(line).toContainText('Lego set');
  await line.click();
  await expect(card).toBeVisible();

  // Stop saving empties the card again.
  await card.click();
  await page.getByTestId('savings-goal-stop').click();
  await expect(page.getByTestId('savings-goal-empty')).toBeVisible();
  await expect.poll(async () => ((await (await request.get('/api/rewards')).json()).goals ?? {})['m-goal']).toBeUndefined();
});

test('a chore with steps opens its list under the row', async ({ page, request, sandboxDir }) => {
  await seedHouseholdChores(request, sandboxDir, {
    members: [{ id: 'm-steps', name: 'Cleo', emoji: '', color: '#4ade80' }],
    chores: [
      {
        id: 'c-steps', name: 'Tidy your room', emoji: '', points: 2, frequency: 'daily',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'evening', assigneeIds: ['m-steps'], rotation: 'fixed',
        steps: 'Clothes in the hamper\nBooks on the shelf\nLego in the bin',
      },
      {
        id: 'c-plain', name: 'Feed the cat', emoji: '', points: 1, frequency: 'daily',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'evening', assigneeIds: ['m-steps'], rotation: 'fixed',
      },
    ],
  });
  await page.goto('/chores');
  await expect(page.getByTestId('chore-steps-list-c-steps')).toHaveCount(0);
  await expect(page.getByTestId('chore-steps-c-plain')).toHaveCount(0);
  await page.getByRole('button', { name: 'How to do Tidy your room' }).click();
  const list = page.getByTestId('chore-steps-list-c-steps');
  await expect(list).toBeVisible();
  // Each step is numbered by hand; the words are the second span.
  await expect(list.locator('li > span:last-child')).toHaveText(['Clothes in the hamper', 'Books on the shelf', 'Lego in the bin']);
  await expect(list.locator('li').first()).toContainText('1.');
  await page.getByRole('button', { name: 'Hide the steps for Tidy your room' }).click();
  await expect(list).toHaveCount(0);
});

test('a chore given to a group shows for everyone in it, and follows the group when someone joins', async ({ page, request, sandboxDir }) => {
  await seedHouseholdChores(request, sandboxDir, {
    members: [
      { id: 'k1', name: 'Ada', emoji: '', color: '#f472b6' },
      { id: 'k2', name: 'Bram', emoji: '', color: '#60a5fa' },
      { id: 'k3', name: 'Cleo', emoji: '', color: '#4ade80' },
    ],
    groups: [{ id: 'g-kids', name: 'Kids', memberIds: ['k1', 'k2'] }],
    chores: [{
      id: 'gc1', name: 'Tidy the playroom', emoji: '', points: 1, frequency: 'daily',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime',
      assigneeIds: [], assigneeGroupIds: ['g-kids'], rotation: 'fixed',
    }],
  });

  await page.goto('/chores');
  await expect(page.getByText('Tidy the playroom')).toBeVisible();
  await page.getByRole('button', { name: 'Bram', exact: true }).click();
  await expect(page.getByText('Tidy the playroom')).toBeVisible();
  await page.getByRole('button', { name: 'Cleo', exact: true }).click();
  await expect(page.getByText('Tidy the playroom')).toBeHidden();

  // Each person ticks their own copy.
  await page.getByRole('button', { name: 'Bram', exact: true }).click();
  await page.getByText('Tidy the playroom').click();
  await expect.poll(() => completionExists(request, 'gc1', 'k2', todayISO())).toBe(true);
  expect(await completionExists(request, 'gc1', 'k1', todayISO())).toBe(false);

  // Cleo joins Kids; nothing about the chore is edited.
  const family = await (await request.get('/api/family')).json();
  const saved = await request.put('/api/family/groups', {
    data: { revision: family.revision, groups: [{ id: 'g-kids', name: 'Kids', memberIds: ['k1', 'k2', 'k3'] }] },
  });
  expect(saved.ok()).toBe(true);

  await page.reload();
  await page.getByRole('button', { name: 'Cleo', exact: true }).click();
  await expect(page.getByText('Tidy the playroom')).toBeVisible();
});
