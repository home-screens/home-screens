import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { putConfig, seedChores } from '../helpers/api';
import { baseConfig, choreChartModule, makeScreen } from '../helpers/config-fixtures';

/**
 * /remote chore & reward management — the UI-CRUD + persistence round-trip
 * layer. Data-shape/reset semantics are covered at the lib level
 * (src/lib/__tests__/{chore,reward}-data.test.ts); these specs drive the real
 * ChoresTab / ChoresManageView / RewardsView UI and assert the write reaches
 * the on-disk stores the display reads back.
 *
 * ChoresTab is rendered on BOTH /remote (isAdmin) and /chores (kid). The final
 * block pins the dual-context invariant: the kid surface cannot manage or
 * backdate.
 */

const ONE_MEMBER = {
  members: [{ id: 'm1', name: 'Avery', emoji: '🦊', color: '#f59e0b' }],
  chores: [],
};

const TWO_MEMBERS = {
  members: [
    { id: 'm1', name: 'Avery', emoji: '🦊', color: '#f59e0b' },
    { id: 'm2', name: 'Blair', emoji: '🐼', color: '#3b82f6' },
  ],
  chores: [],
};

// A member + a fixed daily chore (appears in "today" regardless of date).
const MEMBER_AND_CHORE = {
  members: [{ id: 'm1', name: 'Avery', emoji: '🦊', color: '#f59e0b' }],
  chores: [{
    id: 'c1',
    name: 'Feed the dog',
    emoji: '🐶',
    points: 3,
    frequency: 'daily',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    timeOfDay: 'anytime',
    assigneeIds: ['m1'],
    rotation: 'fixed',
  }],
};

async function getChoreData(request: APIRequestContext) {
  const res = await request.get('/api/chores/data');
  expect(res.ok()).toBe(true);
  return res.json() as Promise<{
    members: Array<{ id: string; name: string }>;
    chores: Array<{ id: string; name: string; assigneeIds: string[]; rotation: string }>;
  }>;
}

/** Enter Chores tab → Manage sub-view (admin-only). */
async function openManage(page: Page) {
  await page.getByRole('button', { name: 'Chores', exact: true }).click();
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
}

test.beforeEach(async ({ request }) => {
  // A chore-chart module in config is what surfaces the Chores tab on /remote.
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [choreChartModule()])],
  }));
  await request.get('/api/display/commands'); // drain queue from a prior test
});

// ── Members ───────────────────────────────────────────────────────────

test('admin adds a member and it round-trips to chores.json', async ({ page, request }) => {
  await page.goto('/remote');
  await openManage(page);

  await page.getByRole('button', { name: 'Members' }).click();
  await page.getByRole('button', { name: 'Add Member' }).click();
  await page.getByPlaceholder('Enter name...').fill('Charlie');
  // The list-add and overlay-save buttons share the name "Add Member"; the
  // overlay renders after the list, so the save is the last match.
  await page.getByRole('button', { name: 'Add Member' }).last().click();

  await expect
    .poll(async () => (await getChoreData(request)).members.map((m) => m.name))
    .toContain('Charlie');
});

test('admin edits a member name and it round-trips', async ({ page, request }) => {
  await seedChores(request, ONE_MEMBER);
  await page.goto('/remote');
  await openManage(page);

  await page.getByRole('button', { name: 'Members' }).click();
  await page.getByRole('button', { name: 'Edit Avery' }).click();
  await page.getByPlaceholder('Enter name...').fill('Avery Rose');
  await page.getByRole('button', { name: 'Save Member' }).click();

  await expect
    .poll(async () => (await getChoreData(request)).members.map((m) => m.name))
    .toContain('Avery Rose');
});

test('admin deletes a member and it round-trips', async ({ page, request }) => {
  await seedChores(request, ONE_MEMBER);
  await page.goto('/remote');
  await openManage(page);

  await page.getByRole('button', { name: 'Members' }).click();
  await page.getByRole('button', { name: 'Edit Avery' }).click();
  await page.getByRole('button', { name: 'Delete Member' }).click();
  // The overlay's delete button and the ConfirmSheet's confirm both read
  // "Delete Member"; the sheet renders last.
  await page.getByRole('button', { name: 'Delete Member' }).last().click();

  await expect
    .poll(async () => (await getChoreData(request)).members.length)
    .toBe(0);
});

// ── Chores ────────────────────────────────────────────────────────────

test('admin adds a chore assigned to a member and it round-trips', async ({ page, request }) => {
  // "Add Chore" is a no-op with zero members, so seed one first.
  await seedChores(request, ONE_MEMBER);
  await page.goto('/remote');
  await openManage(page);

  await page.getByRole('button', { name: 'Add Chore' }).first().click();
  await page.getByPlaceholder('Chore name...').fill('Water the plants');
  await page.getByRole('button', { name: 'Avery' }).click(); // assignee toggle
  await page.getByRole('button', { name: 'Add Chore' }).last().click();

  await expect
    .poll(async () => {
      const chore = (await getChoreData(request)).chores.find((c) => c.name === 'Water the plants');
      return chore?.assigneeIds ?? null;
    })
    .toEqual(['m1']);
});

test('admin edits a chore name and it round-trips', async ({ page, request }) => {
  await seedChores(request, MEMBER_AND_CHORE);
  await page.goto('/remote');
  await openManage(page);

  await page.getByRole('button', { name: 'Edit Feed the dog' }).click();
  await page.getByPlaceholder('Chore name...').fill('Feed the cat');
  await page.getByRole('button', { name: 'Save Chore' }).click();

  await expect
    .poll(async () => (await getChoreData(request)).chores.map((c) => c.name))
    .toContain('Feed the cat');
});

test('admin deletes a chore and it round-trips', async ({ page, request }) => {
  await seedChores(request, MEMBER_AND_CHORE);
  await page.goto('/remote');
  await openManage(page);

  await page.getByRole('button', { name: 'Edit Feed the dog' }).click();
  await page.getByRole('button', { name: 'Delete Chore' }).click();
  await page.getByRole('button', { name: 'Delete Chore' }).last().click(); // ConfirmSheet

  await expect
    .poll(async () => (await getChoreData(request)).chores.length)
    .toBe(0);
});

// ── Rotation ──────────────────────────────────────────────────────────

test('a single-assignee chore saves as fixed rotation', async ({ page, request }) => {
  await seedChores(request, ONE_MEMBER);
  await page.goto('/remote');
  await openManage(page);

  await page.getByRole('button', { name: 'Add Chore' }).first().click();
  await page.getByPlaceholder('Chore name...').fill('Solo chore');
  await page.getByRole('button', { name: 'Avery' }).click();

  // With one assignee the Rotation control never mounts and the save coerces
  // rotation to 'fixed' (see useChoreForm.submit).
  await expect(page.getByText('Rotation', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Add Chore' }).last().click();

  await expect
    .poll(async () => {
      const chore = (await getChoreData(request)).chores.find((c) => c.name === 'Solo chore');
      return chore?.rotation ?? null;
    })
    .toBe('fixed');
});

test('a multi-assignee chore can be set to rotate daily and it round-trips', async ({ page, request }) => {
  await seedChores(request, TWO_MEMBERS);
  await page.goto('/remote');
  await openManage(page);

  await page.getByRole('button', { name: 'Add Chore' }).first().click();
  await page.getByPlaceholder('Chore name...').fill('Take out trash');
  await page.getByRole('button', { name: 'Avery' }).click();
  await page.getByRole('button', { name: 'Blair' }).click();

  // The Rotation <select> only mounts once ≥2 assignees are chosen. Target it
  // by an option only it carries.
  const rotationSelect = page.locator('select').filter({
    has: page.locator('option', { hasText: 'Fixed (all do it)' }),
  });
  await expect(rotationSelect).toBeVisible();
  await rotationSelect.selectOption({ label: 'Rotate Daily' });
  await page.getByRole('button', { name: 'Add Chore' }).last().click();

  await expect
    .poll(async () => {
      const chore = (await getChoreData(request)).chores.find((c) => c.name === 'Take out trash');
      return chore?.rotation ?? null;
    })
    .toBe('rotate-daily');
});

// ── Points display ────────────────────────────────────────────────────

test('the Today list shows a chore\'s ticket value', async ({ page, request }) => {
  await seedChores(request, MEMBER_AND_CHORE); // 3-point fixed daily chore
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Chores', exact: true }).click();
  // Today is the default sub-view; the ticket pill renders when showPoints is on.
  await expect(page.getByText('Feed the dog')).toBeVisible();
  await expect(page.getByText('3 tickets')).toBeVisible();
});

// ── Rewards ───────────────────────────────────────────────────────────

test('admin creates a reward and it round-trips to rewards.json', async ({ page, request }) => {
  await seedChores(request, ONE_MEMBER);
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Chores', exact: true }).click();
  // Outer chores sub-nav → Rewards (unambiguous: RewardsView isn't mounted yet).
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();

  // The outer sub-nav and the inner rewards nav both expose a "Rewards" button.
  // Scope to the inner nav by its "Balances" tab — a control unique to the
  // inner nav — rather than relying on render order between two peer navs.
  const innerRewardsNav = page.getByRole('button', { name: 'Balances', exact: true }).locator('..');
  await innerRewardsNav.getByRole('button', { name: 'Rewards', exact: true }).click();

  await page.getByRole('button', { name: 'Add Reward' }).click();
  await page.getByPlaceholder('e.g. Extra Screen Time').fill('Ice Cream Trip');
  await page.getByPlaceholder('10').fill('5');
  await page.getByRole('button', { name: 'Save Reward' }).click();

  await expect
    .poll(async () => {
      const res = await request.get('/api/rewards');
      const rewards = (await res.json()).rewards as Array<{ name: string; cost: number }>;
      return rewards.find((r) => r.name === 'Ice Cream Trip')?.cost ?? null;
    })
    .toBe(5);
});

test('admin redeems a reward and it records a redemption', async ({ page, request }) => {
  await seedChores(request, ONE_MEMBER);
  // Seed a reward and a balance directly so this spec is independent of the
  // create-reward flow.
  await request.put('/api/rewards/data', {
    data: {
      rewards: [{
        id: 'r1', name: 'Movie Night', emoji: '🎬', cost: 2,
        description: '', memberIds: [], enabled: true,
      }],
    },
  });
  await request.post('/api/rewards/data', { data: { memberId: 'm1', amount: 5 } });

  await page.goto('/remote');
  await page.getByRole('button', { name: 'Chores', exact: true }).click();
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();

  // Redeem is the default rewards sub-view; the reward row is a button named
  // for the reward, enabled because the balance (5) covers the cost (2).
  await page.getByRole('button', { name: /Movie Night/ }).click();
  // ConfirmSheet confirm is the last "Redeem …" button.
  await page.getByRole('button', { name: /Redeem/ }).last().click();

  await expect
    .poll(async () => {
      const res = await request.get('/api/rewards');
      const body = await res.json();
      return (body.redemptions as Array<{ rewardName: string; memberId: string }>)
        .map((r) => r.rewardName);
    })
    .toContain('Movie Night');
});

// ── Dual-context invariant + kid-friendly language ────────────────────

test('kid /chores view hides all management affordances', async ({ page, request }) => {
  await seedChores(request, MEMBER_AND_CHORE);
  await page.goto('/chores');

  // The chore is visible (kids see today's list) …
  await expect(page.getByText('Feed the dog')).toBeVisible();
  // … but the Manage sub-view and its add controls are gone.
  await expect(page.getByRole('button', { name: 'Manage', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add Chore' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add Member' })).toHaveCount(0);
});

test('kid /chores rewards view exposes only redeem and history, not management', async ({ page, request }) => {
  await seedChores(request, ONE_MEMBER);
  await page.goto('/chores');
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Redeem', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'History', exact: true })).toBeVisible();
  // Manage-tickets and Balances are admin-only inner tabs.
  await expect(page.getByRole('button', { name: 'Balances', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add Reward' })).toHaveCount(0);
});

test('kid cannot check off a chore on a past day', async ({ page, request }) => {
  await seedChores(request, MEMBER_AND_CHORE); // fixed daily chore — appears on every day

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yISO = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  // The history-strip tiles are labelled with this exact long-date format
  // (weekday/month/day, no year) via the default en-US formatting locale.
  const yLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(yesterday);

  await page.goto('/chores');
  // Today the chore is an interactive toggle for the kid …
  await expect(page.getByRole('button', { name: 'Mark complete: Feed the dog' })).toBeVisible();

  // … navigate to yesterday via the history day strip.
  await page.getByRole('button', { name: `View ${yLabel}` }).click();

  // The chore still renders, but as a read-only row (canEdit = !isViewingPast ||
  // isAdmin → false here), so no toggle button exists in either state.
  await expect(page.getByText('Feed the dog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark complete: Feed the dog' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Completed: Feed the dog' })).toHaveCount(0);

  // Tapping the read-only row must not persist a backdated completion.
  await page.getByText('Feed the dog').click();
  const res = await request.get('/api/chores');
  const completions = (await res.json()).completions as Array<{ choreId: string; date: string }>;
  expect(completions.some((c) => c.choreId === 'c1' && c.date === yISO)).toBe(false);
});

test('the chore & reward management UI avoids developer jargon', async ({ page, request }) => {
  await seedChores(request, MEMBER_AND_CHORE);
  await page.goto('/remote');

  // These family surfaces are used by kids; no "admin"/"permission"/"backfill".
  // The body check covers the current view plus any open overlay (both stay in
  // the DOM), so opening a form is enough to sweep its labels too.
  const body = page.locator('body');
  const expectNoJargon = async () => {
    await expect(body).not.toContainText(/\badmin\b/i);
    await expect(body).not.toContainText(/\bpermission\b/i);
    await expect(body).not.toContainText(/\bbackfill\b/i);
  };

  // Chore list + chore edit form (Manage defaults to the Chores section).
  await openManage(page);
  await page.getByRole('button', { name: 'Edit Feed the dog' }).click();
  await expect(page.getByPlaceholder('Chore name...')).toBeVisible();
  await expectNoJargon();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByPlaceholder('Chore name...')).toBeHidden(); // let the overlay unmount

  // Members list.
  await page.getByRole('button', { name: 'Members' }).click();
  await expectNoJargon();

  // Reward add form.
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  const innerRewardsNav = page.getByRole('button', { name: 'Balances', exact: true }).locator('..');
  await innerRewardsNav.getByRole('button', { name: 'Rewards', exact: true }).click();
  await page.getByRole('button', { name: 'Add Reward' }).click();
  await expect(page.getByPlaceholder('e.g. Extra Screen Time')).toBeVisible();
  await expectNoJargon();
});
