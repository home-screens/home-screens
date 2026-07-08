import { test, expect } from '../fixtures';
import { putConfig } from '../helpers/api';
import { baseConfig, choreChartModule, makeScreen } from '../helpers/config-fixtures';

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

test.beforeEach(async ({ request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [choreChartModule()])],
  }));
  const res = await request.put('/api/chores/data', { data: CHORE_DATA });
  expect(res.ok()).toBe(true);
});

test('kid view lists today\'s chores without the Manage view', async ({ page }) => {
  await page.goto('/chores');
  await expect(page.getByText('Feed the dog')).toBeVisible();
  await expect(page.getByText('Avery')).toBeVisible();
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

test('/chores shows the empty state when no chore module is configured', async ({ page, request }) => {
  await putConfig(request, baseConfig()); // no chore-chart module
  await page.goto('/chores');
  await expect(page.getByText('Feed the dog')).toBeHidden();
});
