import { test, expect } from '../fixtures';
import { getConfig, putConfig, seedChores, seedFamily } from '../helpers/api';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { autosaved, moduleConfig } from '../helpers/editor';

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

test('Settings Family creates a group, keeps it in sync when someone leaves, and removes it', async ({ page, request, sandboxDir }) => {
  seedFamily(sandboxDir, [{ id: 'alex', name: 'Alex', color: '#60a5fa' }, { id: 'sam', name: 'Sam', color: '#fbbf24' }]);
  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=family');
  const manager = page.getByTestId('family-manager');
  const groups = manager.getByTestId('family-groups');
  await groups.getByRole('button', { name: 'Add group' }).click();
  await groups.getByLabel('Group name').fill('Kids');
  await groups.getByRole('checkbox', { name: 'Alex' }).check();
  await groups.getByRole('checkbox', { name: 'Sam' }).check();
  await groups.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(manager.getByRole('status')).toHaveText('Groups saved.');
  await expect(groups.getByTestId('family-group')).toHaveCount(1);
  await expect(groups.getByTestId('family-group')).toContainText('Alex, Sam');
  let family = await (await request.get('/api/family')).json();
  expect(family.groups).toEqual([expect.objectContaining({ name: 'Kids', memberIds: ['alex', 'sam'] })]);

  await manager.getByRole('button', { name: 'Remove Sam?' }).click();
  await page.getByRole('dialog', { name: 'Remove Sam?' }).getByRole('button', { name: 'Remove person' }).click();
  await expect(manager.getByRole('status')).toHaveText('Family saved.');
  await expect(groups.getByTestId('family-group')).toContainText('Alex');
  await expect(groups.getByTestId('family-group')).not.toContainText('Sam');
  family = await (await request.get('/api/family')).json();
  expect(family.groups[0].memberIds).toEqual(['alex']);

  await groups.getByRole('button', { name: 'Remove Kids?' }).click();
  await page.getByRole('dialog', { name: 'Remove Kids?' }).getByRole('button', { name: 'Remove group' }).click();
  await expect(manager.getByRole('status')).toHaveText('Groups saved.');
  await expect(groups.getByTestId('family-group')).toHaveCount(0);
  family = await (await request.get('/api/family')).json();
  expect(family.groups).toEqual([]);
  expect(family.members.map((member: { name: string }) => member.name)).toEqual(['Alex']);
});

// A chore given to a group names the group, never the people in it, so the
// group form is the only thing that has to change for the chore to follow.
test('Settings Family: a group chore follows the group, and removing the group says so and keeps the chore', async ({ page, request, sandboxDir }) => {
  seedFamily(
    sandboxDir,
    [{ id: 'alex', name: 'Alex', color: '#60a5fa' }, { id: 'sam', name: 'Sam', color: '#fbbf24' }],
    [{ id: 'g-kids', name: 'Kids', memberIds: ['alex'] }],
  );
  await putConfig(request, baseConfig());
  expect((await seedChores(request, { chores: [{
    id: 'dishes', name: 'Dishes', emoji: '', points: 1, frequency: 'daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    timeOfDay: 'anytime', assigneeIds: [], assigneeGroupIds: ['g-kids'], rotation: 'fixed',
  }] })).ok()).toBe(true);
  const owing = async () => {
    const today = await (await request.get('/api/chores/today')).json() as { members: Array<{ name: string; chores: unknown[] }> };
    return today.members.filter((member) => member.chores.length > 0).map((member) => member.name);
  };
  expect(await owing()).toEqual(['Alex']);

  await page.goto('/editor/settings?section=defaults&page=family');
  const manager = page.getByTestId('family-manager');
  const groups = manager.getByTestId('family-groups');
  await groups.getByRole('button', { name: 'Edit Kids' }).click();
  await groups.getByRole('checkbox', { name: 'Sam' }).check();
  await groups.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(manager.getByRole('status')).toHaveText('Groups saved.');
  await expect.poll(owing).toEqual(['Alex', 'Sam']);

  await groups.getByRole('button', { name: 'Remove Kids?' }).click();
  const sheet = page.getByRole('dialog', { name: 'Remove Kids?' });
  await expect(sheet).toContainText('1 chore goes to Kids');
  await sheet.getByRole('button', { name: 'Remove group' }).click();
  await expect(manager.getByRole('status')).toHaveText('Groups saved.');
  const saved = await (await request.get('/api/chores/data')).json() as { chores: Array<Record<string, unknown>> };
  expect(saved.chores).toEqual([expect.objectContaining({ id: 'dishes', assigneeIds: [] })]);
  expect(saved.chores[0]).not.toHaveProperty('assigneeGroupIds');
  expect(await owing()).toEqual([]);
});

// A group is picked by name on the chore form and the calendar filter, so
// two that read the same could not be told apart.
test('Settings Family will not save a second group with the same name, and says why', async ({ page, request, sandboxDir }) => {
  seedFamily(sandboxDir, [{ id: 'alex', name: 'Alex', color: '#60a5fa' }], [{ id: 'g-kids', name: 'Kids', memberIds: ['alex'] }]);
  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=family');
  const groups = page.getByTestId('family-manager').getByTestId('family-groups');
  await groups.getByRole('button', { name: 'Add group' }).click();
  await groups.getByLabel('Group name').fill(' kids');
  await expect(groups.getByText('You already have a group called kids.')).toBeVisible();
  await expect(groups.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await groups.getByLabel('Group name').fill('Teens');
  await expect(groups.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  // Renaming a group to its own name is not a clash.
  await groups.getByRole('button', { name: 'Cancel' }).click();
  await groups.getByRole('button', { name: 'Edit Kids' }).click();
  await expect(groups.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
});

test('Settings Family refuses a group saved from a stale roster', async ({ page, request, sandboxDir }) => {
  seedFamily(sandboxDir, [{ id: 'alex', name: 'Alex', color: '#60a5fa' }]);
  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=family');
  const manager = page.getByTestId('family-manager');
  const groups = manager.getByTestId('family-groups');
  await groups.getByRole('button', { name: 'Add group' }).click();
  await groups.getByLabel('Group name').fill('Kids');
  const before = await (await request.get('/api/family')).json();
  const added = await request.put('/api/family', { data: { members: [...before.members, { name: 'Sam', color: '#fbbf24' }], revision: before.revision, removedIds: [] } });
  expect(added.ok()).toBe(true);
  const conflict = page.waitForResponse((response) => response.url().endsWith('/api/family/groups') && response.request().method() === 'PUT');
  await groups.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await conflict).status()).toBe(409);
  await expect(manager.getByRole('status')).toContainText('Please make your edit again');
  await expect(manager.getByText('Sam', { exact: true })).toBeVisible();
  expect((await (await request.get('/api/family')).json()).groups).toEqual([]);
});

test('a calendar filtered on a deleted group shows the stale choice and can go back to everyone', async ({ page, request, sandboxDir }) => {
  seedFamily(sandboxDir, [{ id: 'alex', name: 'Alex', color: '#60a5fa' }]);
  const instance = buildModuleInstance('fullscreen-calendar', { view: 'agenda', peopleFilter: { memberIds: [], groupIds: ['gone-group'], includeShared: true } });
  await putConfig(request, baseConfig({ screens: [makeScreen('s', 'S', [instance])] }));
  const config = await getConfig(request);
  config.settings.calendar.icalSources = [{ id: 'work', name: 'Work', type: 'ical', url: 'https://example.com/work.ics', color: '#60a5fa', enabled: true }];
  config.settings.calendar.personSources = { alex: ['work'] };
  await putConfig(request, config);
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await page.locator(`[data-module-id="${instance.id}"]`).click();
  const filter = page.locator('[data-field-id="peopleFilter"]');
  await expect(filter.locator('[data-stale-selection="group"]')).toBeVisible();
  await autosaved(page, () => filter.getByRole('button', { name: 'Show everyone' }).click());
  await expect(filter.locator('[data-stale-selection="group"]')).toHaveCount(0);
  await expect(filter).toContainText('Leave everything unchecked to show everyone.');
  expect((await moduleConfig(request, 'fullscreen-calendar')).peopleFilter).toBeUndefined();
});
