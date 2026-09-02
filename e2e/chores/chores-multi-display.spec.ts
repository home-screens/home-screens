import { test, expect } from '../fixtures';
import { putConfig } from '../helpers/api';
import { baseConfig, choreChartModule, makeScreen, textModule } from '../helpers/config-fixtures';

/**
 * Once a display is added, `config.screens` becomes a frozen snapshot that the
 * editor never writes to again — every later edit lands on
 * `config.displays[*].screens`. Both phone surfaces used to read the frozen
 * pool, so a chore chart living on any display other than the one that
 * inherited the globals was invisible to them: `/chores` showed kids the empty
 * state while a chore chart was live on the wall.
 */

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

/** Chore chart lives ONLY on a display, and only on a non-first one. */
function displayOwnedConfig() {
  return baseConfig({
    // The frozen legacy pool has no chore module at all.
    screens: [makeScreen('ghost', 'Ghost', [textModule('E2E STALE POOL')])],
    displays: [
      {
        id: 'main',
        name: 'Main',
        screens: [makeScreen('s-main', 'Main Screen', [textModule('E2E MAIN')])],
      },
      {
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('s-kitchen', 'Kitchen Screen', [choreChartModule()])],
      },
    ],
  });
}

test.beforeEach(async ({ request }) => {
  const res = await request.put('/api/chores/data', { data: CHORE_DATA });
  expect(res.ok()).toBe(true);
});

test('/chores finds a chore chart that lives only on a non-inherited display', async ({ page, request }) => {
  await putConfig(request, displayOwnedConfig());

  await page.goto('/chores');

  // Renders the real chore board, not the empty state.
  await expect(page.getByText('Feed the dog')).toBeVisible();
  await expect(page.getByText('Avery')).toBeVisible();
});

test('/remote finds a chore chart on a non-inherited display', async ({ page, request }) => {
  await putConfig(request, displayOwnedConfig());

  await page.goto('/remote');
  await page.getByRole('button', { name: 'Chores', exact: true }).click();

  // The tab is always on the bar now, so the real assertion is that it opens on
  // the household's chores rather than the "no chore chart yet" panel.
  await expect(page.getByText('No chore chart yet')).toBeHidden();
  await expect(page.getByText('Feed the dog')).toBeVisible();
});

test('/chores shows the empty state when no display has a chore chart, even if the frozen pool does', async ({ page, request }) => {
  // The chore chart was removed from every real display but lingers in the
  // stale pool. Kids must see the empty state, not ghost config.
  await putConfig(request, baseConfig({
    screens: [makeScreen('ghost', 'Ghost', [choreChartModule()])],
    displays: [
      {
        id: 'main',
        name: 'Main',
        screens: [makeScreen('s-main', 'Main Screen', [textModule('E2E MAIN')])],
      },
    ],
  }));

  await page.goto('/chores');

  await expect(page.getByText('Feed the dog')).toBeHidden();
});

test('legacy single-display mode still reads the global screen pool', async ({ page, request }) => {
  // No `displays` key at all — the pool is authoritative and must keep working.
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [choreChartModule()])],
  }));

  await page.goto('/chores');

  await expect(page.getByText('Feed the dog')).toBeVisible();
});
