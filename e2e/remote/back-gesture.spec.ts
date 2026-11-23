import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { putConfig } from '../helpers/api';
import { confirmSheet, formOverlay } from '../helpers/remote';
import { baseConfig } from '../helpers/config-fixtures';

/**
 * The phone's Back gesture on an open sheet.
 *
 * Every /remote form (chores, routines, meals, rewards, family) is the same
 * `FormOverlay`, so this drives the routine form and the fix lands for all of
 * them. Back used to unload the whole remote and take the typed draft with
 * it, while the sheet's own Cancel asked first; both now go through the same
 * discard guard. The routine form is used here because it needs no seeded
 * family or chore data.
 */

async function arriveAtRemote(page: Page): Promise<void> {
  // Land on /remote from somewhere else, the way a phone does, so there is a
  // page behind it for Back to fall through to.
  await page.goto('/chores');
  await page.goto('/remote');
}

async function openNewRoutine(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Timers' }).click();
  await expect(page.getByRole('heading', { name: 'Timers' })).toBeVisible();
  await page.getByRole('button', { name: 'New routine' }).click();
  await expect(formOverlay(page)).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  await putConfig(request, baseConfig());
  // A session left running by another spec in this worker would put the
  // replace-confirm sheet in front of the taps below.
  await request.post('/api/timers/session', { data: { action: 'cancel' } }).catch(() => {});
  const { revision } = await (await request.get('/api/timers/routines')).json();
  await request.put('/api/timers/routines', { data: { routines: [], revision } });
});

test('Back closes an open sheet instead of leaving the remote', async ({ page }) => {
  await arriveAtRemote(page);
  await openNewRoutine(page);

  await page.goBack();

  await expect(formOverlay(page)).toBeHidden();
  await expect(page).toHaveURL(/\/remote/);
  await expect(page.getByRole('heading', { name: 'Timers' })).toBeVisible();
});

test('Back on a form with typed edits asks first, and Keep editing brings the draft back', async ({ page }) => {
  await arriveAtRemote(page);
  await openNewRoutine(page);
  await page.getByPlaceholder('Morning routine').fill('After school');

  await page.goBack();

  // The same prompt the sheet's own Cancel raises, not a second one.
  await expect(confirmSheet(page)).toBeVisible();
  await expect(confirmSheet(page)).toContainText('Discard changes?');
  await confirmSheet(page).getByRole('button', { name: 'Keep editing' }).click();

  await expect(formOverlay(page)).toBeVisible();
  await expect(page.getByPlaceholder('Morning routine')).toHaveValue('After school');
  // The prompt gives its history entry back with history.back(), a beat after
  // it closes; a Back pressed under that lands on the prompt's spent entry.
  // A thumb's next Back comes long after, so wait until only the form's is left.
  await expect.poll(() => page.evaluate(() => (window.history.state as { hsSheets?: string[] } | null)?.hsSheets?.length ?? 0)).toBe(1);

  // Back still means Back afterwards, and discarding leaves the remote up.
  await page.goBack();
  await expect(confirmSheet(page)).toBeVisible();
  await confirmSheet(page).getByRole('button', { name: 'Discard', exact: true }).click();

  await expect(formOverlay(page)).toBeHidden();
  await expect(page).toHaveURL(/\/remote/);
});

test('a sheet dismissed by its save does not cancel a navigation already under way', async ({ page }) => {
  await arriveAtRemote(page);
  await openNewRoutine(page);
  await page.getByPlaceholder('Morning routine').fill('After school');
  await page.getByPlaceholder('What to do').nth(0).fill('Snack');

  // The sheet gives its entry back a beat after it closes, so the save is held
  // just long enough to land in the middle of the navigation below, and the
  // page itself is held long enough that it cannot be missed. Travelling then
  // used to cancel the navigation outright (net::ERR_ABORTED).
  await page.route('**/api/timers/routines', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.continue();
  });
  await page.route(
    (url) => url.pathname === '/chores',
    async (route, request) => {
      if (!request.isNavigationRequest()) return route.continue();
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    },
  );

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.goto('/chores');

  await expect(page).toHaveURL(/\/chores/);
});

test('a sheet closed with its own Back control leaves no dead step behind', async ({ page }) => {
  await arriveAtRemote(page);
  await openNewRoutine(page);

  await formOverlay(page).getByRole('button', { name: 'Back', exact: true }).click();
  await expect(formOverlay(page)).toBeHidden();

  // One Back, one page: the sheet must hand its history entry back when it
  // closes, or Back would do nothing at all the first time it is pressed.
  await page.goBack();
  await expect(page).toHaveURL(/\/chores/);
});
