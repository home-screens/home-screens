import { test, expect } from '../fixtures';
import { getConfig, putConfig, seedFamily } from '../helpers/api';
import { baseConfig } from '../helpers/config-fixtures';

test('Settings Family creates and edits people without a chore module', async ({ page, request, sandboxDir }) => {
  seedFamily(sandboxDir, []);
  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=family');
  await expect(page.getByRole('heading', { name: 'Family', exact: true })).toBeVisible();
  const manager = page.getByTestId('family-manager');
  await manager.getByRole('button', { name: 'Add person' }).click();
  await manager.getByLabel('Name', { exact: true }).fill('Morgan');
  await manager.getByLabel('Emoji (optional)').fill('🌻');
  await manager.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(manager.getByRole('status')).toHaveText('Family saved.');
  await manager.getByRole('button', { name: 'Edit Morgan' }).click();
  await manager.getByLabel('Name', { exact: true }).fill('Morgan Rose');
  await manager.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(manager.getByText('Morgan Rose', { exact: true })).toBeVisible();
  const result = await request.get('/api/family');
  expect(result.ok()).toBe(true);
  expect((await result.json()).members).toEqual([expect.objectContaining({ name: 'Morgan Rose', emoji: '🌻' })]);
});

test('Settings Family shows a concurrent change and never automatically overwrites it', async ({ page, request, sandboxDir }) => {
  seedFamily(sandboxDir, [{ id: 'alex', name: 'Alex', color: '#60a5fa' }]);
  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=family');
  const manager = page.getByTestId('family-manager');
  await manager.getByRole('button', { name: 'Edit Alex' }).click();
  await manager.getByLabel('Name', { exact: true }).fill('Alicia');
  const before = await (await request.get('/api/family')).json();
  const added = await request.put('/api/family', { data: {
    members: [...before.members, { id: 'new-person', name: 'Sam', color: '#fbbf24' }],
    revision: before.revision, removedIds: [],
  } });
  expect(added.ok()).toBe(true);
  const conflict = page.waitForResponse((response) => response.url().endsWith('/api/family') && response.request().method() === 'PUT');
  await manager.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await conflict).status()).toBe(409);
  await expect(manager.getByRole('status')).toContainText('Please make your edit again');
  await expect(manager.getByText('Sam', { exact: true })).toBeVisible();
  await expect(manager.getByText('Alex', { exact: true })).toBeVisible();
  const after = await (await request.get('/api/family')).json();
  expect(after.members.map((member: { name: string }) => member.name)).toEqual(['Alex', 'Sam']);
});

test('Settings Family preserves and pages a migrated roster larger than the addition limit', async ({ page, request, sandboxDir }) => {
  seedFamily(sandboxDir, Array.from({ length: 65 }, (_, index) => ({ id: `member-${index}`, name: `Person ${index + 1}`, color: '#60a5fa' })));
  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=family');
  const manager = page.getByTestId('family-manager');
  await expect(manager.getByRole('button', { name: 'Add person' })).toBeDisabled();
  await expect(manager.getByTestId('family-member')).toHaveCount(12);
  for (let index = 0; index < 5; index++) await manager.getByRole('button', { name: 'Next' }).click();
  await expect(manager.getByText('Page 6 of 6')).toBeVisible();
  await manager.getByRole('button', { name: 'Edit Person 65' }).click();
  await manager.getByLabel('Name', { exact: true }).fill('Last person');
  await manager.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(manager.getByText('Last person', { exact: true })).toBeVisible();
  const family = await (await request.get('/api/family')).json();
  expect(family.members).toHaveLength(65);
  expect(family.members[64].name).toBe('Last person');
});

test('Calendar assigns sources to the shared family without creating another roster', async ({ page, request, sandboxDir }) => {
  seedFamily(sandboxDir, [{ id: 'alex', name: 'Alex', color: '#60a5fa' }]);
  const config = baseConfig();
  config.settings.calendar.icalSources = [{ id: 'work', name: 'Work', type: 'ical', url: 'https://example.com/work.ics', color: '#60a5fa', enabled: true }];
  await putConfig(request, config);
  await page.goto('/editor/settings?section=defaults&page=calendar');
  const member = page.getByRole('group', { name: 'Alex', exact: true });
  await member.getByRole('checkbox', { name: 'Work', exact: true }).check();
  await expect.poll(async () => (await getConfig(request)).settings.calendar.personSources).toEqual({ alex: ['work'] });
  expect((await getConfig(request)).settings.calendar.people).toBeUndefined();
  await page.getByRole('link', { name: 'Manage family' }).click();
  await expect(page).toHaveURL(/page=family/);
});
