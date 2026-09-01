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

// The save that fails happens in Manage, so the warning has to be visible in
// Manage. It previously rendered only inside the Today sub-view's non-empty
// branch, which is unreachable from here: the member vanished on reload with
// nothing on screen to say why.
test('a failed member save warns in the sub-view where the edit happened', async ({ page }) => {
  await page.route('**/api/chores/data', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"nope"}' });
      return;
    }
    await route.fallback();
  });

  await page.goto('/remote');
  await openManage(page);

  await page.getByRole('button', { name: 'Members' }).click();
  await page.getByRole('button', { name: 'Add Member' }).click();
  await page.getByPlaceholder('Enter name...').fill('Charlie');
  await page.getByRole('button', { name: 'Add Member' }).last().click();

  // Not getByRole('alert') — Next's route announcer is also role="alert".
  await expect(page.getByText('Failed to save. Please try again.')).toBeVisible();
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

// ── Backdating & history navigation (admin) ───────────────────────────
//
// Admins keep edit rights on past days (`canEdit = !isViewingPast || isAdmin`,
// the inverse of the kid-block already pinned above). These specs use their own
// member/chore IDs: chore-completions.json persists per-worker across tests, so
// unique IDs keep one test's backdated completion from bleeding into another.

/** Yesterday as both a YYYY-MM-DD key and the long label the history strip renders. */
function yesterdayInfo() {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const iso = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  // Matches ChoreHistoryNav's tile format under the default en-US formatting locale.
  const label = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(y);
  return { iso, label };
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

// A member + a fixed daily chore (applies on every calendar day, past or present).
const BACKDATE_DATA = {
  members: [{ id: 'm-bd', name: 'Quinn', emoji: '🦊', color: '#f59e0b' }],
  chores: [{
    id: 'c-bd',
    name: 'Wipe the table',
    emoji: '🧽',
    points: 2,
    frequency: 'daily',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    timeOfDay: 'anytime',
    assigneeIds: ['m-bd'],
    rotation: 'fixed',
  }],
};

test('admin can backdate a completion on a past day and it persists', async ({ page, request }) => {
  await seedChores(request, BACKDATE_DATA);
  const { iso, label } = yesterdayInfo();
  // Normalize to "not completed" — a CI retry (retries=1) could start with the
  // completion already present, and re-toggling would remove it instead.
  if (await completionExists(request, 'c-bd', 'm-bd', iso)) {
    await request.post('/api/chores', { data: { choreId: 'c-bd', memberId: 'm-bd', date: iso } });
  }

  await page.goto('/remote');
  await page.getByRole('button', { name: 'Chores', exact: true }).click();

  // Walk the history strip back to yesterday (tile aria-label starts "View <date>").
  await page.getByRole('button', { name: `View ${label}` }).click();

  // Admin retains the toggle on a past day (kids get a locked, non-interactive row).
  const markBtn = page.getByRole('button', { name: 'Mark complete: Wipe the table' });
  await expect(markBtn).toBeVisible();
  const toggled = page.waitForResponse(
    (r) => r.url().includes('/api/chores') && r.request().method() === 'POST' && r.ok(),
  );
  await markBtn.click();
  await toggled;

  // Completion lands on the backdated day, and the row flips to done.
  await expect.poll(async () => completionExists(request, 'c-bd', 'm-bd', iso)).toBe(true);
  await expect(page.getByRole('button', { name: 'Completed: Wipe the table' })).toBeVisible();
});

test('admin sees the editing-a-past-day banner when viewing history', async ({ page, request }) => {
  await seedChores(request, BACKDATE_DATA);
  const { label } = yesterdayInfo();

  await page.goto('/remote');
  await page.getByRole('button', { name: 'Chores', exact: true }).click();
  await page.getByRole('button', { name: `View ${label}` }).click();

  // The editable-day banner (role="status") names the day and explains that
  // backdated tickets add to today's balance — not the kid lock notice.
  const banner = page.getByRole('status').filter({ hasText: 'Editing' });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(label);
  await expect(banner).toContainText("tickets add to today's balance");
  await expect(page.getByText('Ask a grown-up to add chores you missed.')).toHaveCount(0);
});

// ── Rewards: balances + reward form edit/delete (admin) ───────────────

test('admin adjusts a ticket balance up and down from the Balances tab', async ({ page, request }) => {
  await seedChores(request, {
    members: [{ id: 'm-bal', name: 'Sasha', emoji: '🐼', color: '#3b82f6' }],
    chores: [],
  });

  await page.goto('/remote');
  await page.getByRole('button', { name: 'Chores', exact: true }).click();
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  // "Balances" is unique to the admin-only inner rewards nav.
  await page.getByRole('button', { name: 'Balances', exact: true }).click();

  const readBalance = async () => {
    const res = await request.get('/api/rewards');
    return ((await res.json()).balances as Record<string, number>)['m-bal'] ?? 0;
  };
  // Balances persist per-worker, so assert on deltas rather than an absolute start.
  const before = await readBalance();

  const addBtn = page.getByRole('button', { name: 'Add a ticket to Sasha' });
  const subBtn = page.getByRole('button', { name: 'Subtract a ticket from Sasha' });

  // Each adjust is guarded against concurrent taps, so poll between clicks.
  await addBtn.click();
  await expect.poll(readBalance).toBe(before + 1);
  await addBtn.click();
  await expect.poll(readBalance).toBe(before + 2);
  await subBtn.click();
  await expect.poll(readBalance).toBe(before + 1);
});

test('admin edits a reward through the reward form and it round-trips', async ({ page, request }) => {
  await seedChores(request, {
    members: [{ id: 'm-rw', name: 'Toby', emoji: '🦊', color: '#f59e0b' }],
    chores: [],
  });
  await request.put('/api/rewards/data', {
    data: {
      rewards: [{
        id: 'rw-edit', name: 'Movie Night', emoji: 'lucide:popcorn', cost: 5,
        description: '', memberIds: [], enabled: true,
      }],
    },
  });

  await page.goto('/remote');
  await page.getByRole('button', { name: 'Chores', exact: true }).click();
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  const innerRewardsNav = page.getByRole('button', { name: 'Balances', exact: true }).locator('..');
  await innerRewardsNav.getByRole('button', { name: 'Rewards', exact: true }).click();

  // Tapping the reward row opens RewardFormOverlay in edit mode (name pre-filled).
  await page.getByRole('button', { name: /Movie Night/ }).click();
  const nameInput = page.getByPlaceholder('e.g. Extra Screen Time');
  await expect(nameInput).toHaveValue('Movie Night');
  await nameInput.fill('Pizza Party');
  await page.getByPlaceholder('10').fill('8'); // Ticket Cost input
  await page.getByRole('button', { name: 'Save Reward' }).click();

  await expect
    .poll(async () => {
      const rewards = (await (await request.get('/api/rewards')).json()).rewards as Array<{ id: string; name: string; cost: number }>;
      const r = rewards.find((x) => x.id === 'rw-edit');
      return r ? [r.name, r.cost] : null;
    })
    .toEqual(['Pizza Party', 8]);
});

test('admin deletes a reward through the reward form and it round-trips', async ({ page, request }) => {
  await seedChores(request, {
    members: [{ id: 'm-rd', name: 'Nina', emoji: '🐼', color: '#3b82f6' }],
    chores: [],
  });
  // The only reward: deleting it empties the list, which the data route
  // refuses (guardEmptyOverwrite, 409) unless the client sends force. A
  // confirmed delete does, so the last reward can actually be deleted —
  // it used to bounce with "Failed to save. Please try again."
  await request.put('/api/rewards/data', {
    data: {
      rewards: [
        { id: 'rw-del', name: 'Bike Ride', emoji: 'lucide:bike', cost: 4, description: '', memberIds: [], enabled: true },
      ],
    },
  });

  await page.goto('/remote');
  await page.getByRole('button', { name: 'Chores', exact: true }).click();
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  const innerRewardsNav = page.getByRole('button', { name: 'Balances', exact: true }).locator('..');
  await innerRewardsNav.getByRole('button', { name: 'Rewards', exact: true }).click();

  await page.getByRole('button', { name: /Bike Ride/ }).click();
  await page.getByRole('button', { name: 'Delete Reward' }).click(); // footer → ConfirmSheet
  // ConfirmSheet confirm reads "Delete" (core.actions.delete); the footer button
  // is "Delete Reward", so exact match targets the sheet's confirm.
  await page.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect
    .poll(async () => {
      const rewards = (await (await request.get('/api/rewards')).json()).rewards as Array<{ id: string }>;
      return rewards.some((x) => x.id === 'rw-del');
    })
    .toBe(false);
});

// ── Failed writes: error surface + optimistic rollback ────────────────
//
// `editorFetch` resolves for every status except 401, so a 500 used to read as
// success: the tap stayed checked, the reward stayed in the list, and both were
// gone after a reload with nothing on screen to say why. The fix (throwIfNotOk
// + explicit rollback) is covered here on the two chores-surface shapes:
//
//   toggle  → rolls back, no error banner (the row itself is the feedback)
//   rewards → rolls back AND raises the "Failed to save" banner
//
// The meal-planner panels roll back through the same useDebouncedSave/
// throwIfNotOk pairing, so one surface is enough to pin the behavior.

/** Today as the YYYY-MM-DD key the completion store uses (local time, like todayStr). */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Own member/chore ids: chore-completions.json persists per worker, so unique
// ids keep this test's toggling out of the other specs' assertions.
const ROLLBACK_DATA = {
  members: [{ id: 'm-rb', name: 'Rowan', emoji: '🦊', color: '#f59e0b' }],
  chores: [{
    id: 'c-rb',
    name: 'Rinse the dishes',
    emoji: '🧼',
    points: 1,
    frequency: 'daily',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    timeOfDay: 'anytime',
    assigneeIds: ['m-rb'],
    rotation: 'fixed',
  }],
};

test('a failed chore toggle rolls the check back and the retry succeeds', async ({ page, request }) => {
  await seedChores(request, ROLLBACK_DATA);
  const today = todayISO();
  // Normalize to "not completed" — a CI retry could start with the completion
  // already present, and the toggle would then be an un-complete.
  if (await completionExists(request, 'c-rb', 'm-rb', today)) {
    await request.post('/api/chores', { data: { choreId: 'c-rb', memberId: 'm-rb', date: today } });
  }

  // Only the toggle POST fails. The GET must fall through: the rollback is a
  // re-read of the server's real completions, not a local undo.
  await page.route('**/api/chores', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    // Hold the response open so the optimistic check is observable.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"nope"}' });
  });

  await page.goto('/remote');
  await page.getByRole('button', { name: 'Chores', exact: true }).click();

  const markBtn = page.getByRole('button', { name: 'Mark complete: Rinse the dishes' });
  const doneBtn = page.getByRole('button', { name: 'Completed: Rinse the dishes' });
  await expect(markBtn).toBeVisible();
  await markBtn.click();

  // Optimistic: the row reads as done while the write is in flight …
  await expect(doneBtn).toBeVisible();
  // … and returns to its pre-tap state once the 500 lands.
  await expect(markBtn).toBeVisible();
  expect(await completionExists(request, 'c-rb', 'm-rb', today)).toBe(false);

  // The interception was the only failure — the same tap now sticks.
  await page.unroute('**/api/chores');
  await markBtn.click();
  await expect(doneBtn).toBeVisible();
  await expect.poll(async () => completionExists(request, 'c-rb', 'm-rb', today)).toBe(true);
});

test('a failed reward save warns and drops the reward back out of the list', async ({ page, request }) => {
  await seedChores(request, {
    members: [{ id: 'm-err', name: 'Wren', emoji: '🐼', color: '#3b82f6' }],
    chores: [],
  });
  // A pre-existing reward gives the rollback something to restore *to*, so the
  // assertion distinguishes "reverted to the snapshot" from "wiped the list".
  await request.put('/api/rewards/data', {
    data: {
      rewards: [{
        id: 'rw-snap', name: 'Board Game', emoji: 'lucide:puzzle', cost: 6,
        description: '', memberIds: [], enabled: true,
      }],
    },
  });

  // PUT is the rewards-list write; POST on the same path is a balance adjust.
  await page.route('**/api/rewards/data', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"nope"}' });
  });

  await page.goto('/remote');
  await page.getByRole('button', { name: 'Chores', exact: true }).click();
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  const innerRewardsNav = page.getByRole('button', { name: 'Balances', exact: true }).locator('..');
  await innerRewardsNav.getByRole('button', { name: 'Rewards', exact: true }).click();

  const addReward = async (name: string, cost: string) => {
    await page.getByRole('button', { name: 'Add Reward' }).click();
    await page.getByPlaceholder('e.g. Extra Screen Time').fill(name);
    await page.getByPlaceholder('10').fill(cost);
    await page.getByRole('button', { name: 'Save Reward' }).click();
  };
  const savedRewardNames = async () => {
    const rewards = (await (await request.get('/api/rewards')).json()).rewards as Array<{ name: string }>;
    return rewards.map((r) => r.name);
  };

  await addReward('Trampoline Park', '7');

  await expect(page.getByText('Failed to save. Please try again.')).toBeVisible();
  // Rolled back to the snapshot: the new reward is gone, the old one survives.
  await expect(page.getByRole('button', { name: /Trampoline Park/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Board Game/ })).toBeVisible();
  expect(await savedRewardNames()).toEqual(['Board Game']);

  await page.unroute('**/api/rewards/data');
  await addReward('Trampoline Park', '7');

  await expect(page.getByRole('button', { name: /Trampoline Park/ })).toBeVisible();
  await expect(page.getByText('Failed to save. Please try again.')).toHaveCount(0);
  await expect.poll(savedRewardNames).toContain('Trampoline Park');
});

// ── Member avatar + color pickers (admin) ─────────────────────────────

test('member avatar and color picks persist through the member form', async ({ page, request }) => {
  await seedChores(request, {
    members: [{ id: 'm-av', name: 'Pat', emoji: '🦊', color: '#f59e0b' }],
    chores: [],
  });

  await page.goto('/remote');
  await openManage(page);
  await page.getByRole('button', { name: 'Members' }).click();
  await page.getByRole('button', { name: 'Edit Pat' }).click();

  // Avatar picker: the crown icon carries the visible label "Royal" and stores
  // as "lucide:crown". (Members render initials when no avatar is picked — the
  // no-emoji-in-assignee-dots convention — but an explicit avatar still persists.)
  await page.getByRole('button', { name: 'Royal', exact: true }).click();

  // Color picker: the preset swatches carry no accessible name, so pick a known
  // index off the shared swatch class (MEMBER_COLORS[4] === '#a78bfa'). The count
  // guard fails loudly if the member overlay ever grows other press-scale-xs buttons.
  const swatches = page.locator('.press-scale-xs');
  await expect(swatches).toHaveCount(10);
  await swatches.nth(4).click();

  await page.getByRole('button', { name: 'Save Member' }).click();

  await expect
    .poll(async () => {
      const members = (await (await request.get('/api/chores/data')).json()).members as Array<{ id: string; emoji: string; color: string }>;
      const m = members.find((x) => x.id === 'm-av');
      return m ? [m.emoji, m.color] : null;
    })
    .toEqual(['lucide:crown', '#a78bfa']);
});
