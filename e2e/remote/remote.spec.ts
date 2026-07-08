import { test, expect } from '../fixtures';
import { postHeartbeat, putConfig } from '../helpers/api';
import { baseConfig, choreChartModule, makeScreen, textModule } from '../helpers/config-fixtures';

test.beforeEach(async ({ request }) => {
  await putConfig(request, baseConfig());
  // Drain any commands left over from a previous test in this worker
  await request.get('/api/display/commands');
});

test('sleep button enqueues a sleep command for the display', async ({ page, request }) => {
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Sleep Display' }).click();

  // Poll the same queue the kiosk polls (legacy single-display key __default__)
  await expect
    .poll(async () => {
      const res = await request.get('/api/display/commands');
      const body = await res.json();
      return (body.commands as Array<{ type: string }>).map((c) => c.type);
    }, { timeout: 5000 })
    .toContain('sleep');
});

test('next-screen button enqueues a next command', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [
      makeScreen('a', 'A', [textModule('ALPHA')]),
      makeScreen('b', 'B', [textModule('BRAVO')]),
    ],
  }));
  // The screen-nav buttons stay disabled until a live display heartbeat reports
  // screenCount > 0, and handleNav no-ops without a status. Seed one.
  await postHeartbeat(request, { screenCount: 2, currentIndex: 0 });
  await page.goto('/remote');

  const nextButton = page.getByRole('button', { name: 'Next screen' });
  await expect(nextButton).toBeEnabled(); // waits out the 5s status poll
  await nextButton.click();

  await expect
    .poll(async () => {
      const res = await request.get('/api/display/commands');
      const body = await res.json();
      return (body.commands as Array<{ type: string }>).map((c) => c.type);
    }, { timeout: 5000 })
    .toContain('next-screen');
});

test('tab bar is hidden without chore/meal/photo modules', async ({ page }) => {
  await page.goto('/remote');
  await expect(page.getByRole('button', { name: 'Sleep Display' })).toBeVisible();
  // exact match: the backup action's accessible name contains the word "chores"
  // ("Download config, chores, meals & rewards"), so a substring match would
  // false-positive. The real tab-bar button is aria-label="Chores".
  await expect(page.getByRole('button', { name: 'Chores', exact: true })).toBeHidden();
});

test('chores tab appears when a chore-chart module exists', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [choreChartModule()])],
  }));
  await page.goto('/remote');
  await expect(page.getByRole('button', { name: 'Chores', exact: true })).toBeVisible();
});
