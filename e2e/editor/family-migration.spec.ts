import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import path from 'path';
import { test, expect } from '../fixtures';
import { getConfig } from '../helpers/api';
import { baseConfig } from '../helpers/config-fixtures';

/**
 * The one spec that starts from a genuinely pre-family install and drives the
 * real server through the fold over HTTP.
 *
 * Every other family spec seeds `family.json` with `migrated: true`, so the
 * migration itself only ever ran against direct library calls. This covers the
 * wiring instead: that a request arriving at a hub which has never folded gets
 * a settled roster, that the legacy fields are gone from disk afterwards, and
 * that the ids every other store hangs off survive the rewrite.
 *
 * `isolateFamily: false` turns off the auto roster reset, which would issue a
 * `GET /api/family` (and therefore settle the migration) before the legacy
 * files below were written.
 */
test.use({ isolateFamily: false });

const LEGACY_MEMBERS = [
  { id: 'legacy-avery', name: 'Avery', emoji: 'crown', color: '#f59e0b' },
  { id: 'legacy-sam', name: 'Sam', emoji: '🦊', color: '#4ade80' },
];

function writeLegacyInstall(sandboxDir: string) {
  const data = path.join(sandboxDir, 'data');
  mkdirSync(data, { recursive: true });
  // `fullyParallel` hands each test whichever worker is free, so the sandbox
  // may already have been folded by an earlier spec. Put it back to a
  // genuinely pre-family state: no roster, no evidence, no pending journal.
  // Removing these changes the source signature, which drops the server's
  // settled-migration latch and makes the next request fold again.
  for (const stale of ['family.json', 'family-migration.json', 'family-migrations', 'family-transaction.json']) {
    rmSync(path.join(data, stale), { recursive: true, force: true });
  }
  const config = baseConfig() as unknown as Record<string, unknown>;
  const settings = config.settings as Record<string, unknown>;
  // Schema 12 with the old per-calendar roster: "Sam" matches a chore member
  // by name and should fold into that identity, "Jordan" matches nobody and
  // keeps their own.
  writeFileSync(path.join(data, 'config.json'), JSON.stringify({
    ...config,
    version: 12,
    settings: {
      ...settings,
      calendar: {
        ...(settings.calendar as Record<string, unknown>),
        icalSources: [
          { id: 'school', type: 'ical', name: 'School', url: 'https://example.com/school.ics', color: '#3b82f6', enabled: true },
          { id: 'work', type: 'ical', name: 'Work', url: 'https://example.com/work.ics', color: '#a855f7', enabled: true },
        ],
        people: [
          { id: 'cal-sam', name: '  sam  ', color: '#4ade80', sourceIds: ['school'] },
          { id: 'cal-jordan', name: 'Jordan', color: '#60a5fa', sourceIds: ['work'] },
        ],
      },
    },
  }, null, 2));
  writeFileSync(path.join(data, 'chores.json'), JSON.stringify({
    members: LEGACY_MEMBERS,
    chores: [{
      id: 'legacy-chore', name: 'Feed the dog', emoji: '🐶', points: 3, frequency: 'daily',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime', assigneeIds: ['legacy-avery', 'legacy-sam'],
      rotation: 'schedule', schedule: { 'legacy-avery': [1], 'legacy-sam': [2] },
    }],
  }, null, 2));
  writeFileSync(path.join(data, 'chore-completions.json'), JSON.stringify({
    completions: [{ choreId: 'legacy-chore', memberId: 'legacy-avery', date: '2026-01-02' }],
  }, null, 2));
  writeFileSync(path.join(data, 'rewards.json'), JSON.stringify({
    rewards: [{ id: 'legacy-reward', name: 'Movie night', emoji: '🍿', description: '', cost: 5, memberIds: ['legacy-sam'], enabled: true }],
    balances: { 'legacy-avery': 7, 'legacy-sam': 2 },
    redemptions: [],
  }, null, 2));
  return data;
}

const readData = (dir: string, file: string) => JSON.parse(readFileSync(path.join(dir, file), 'utf8'));

test('a pre-family install folds its chore and calendar rosters on the first request', async ({ request, sandboxDir }) => {
  const data = writeLegacyInstall(sandboxDir);
  // The precondition the rest of this test depends on.
  expect(existsSync(path.join(data, 'family.json'))).toBe(false);

  const response = await request.get('/api/family');
  expect(response.ok(), `GET /api/family answered ${response.status()}: ${(await response.text()).slice(0, 300)}`).toBe(true);
  const family = await response.json() as { members: Array<{ id: string; name: string; emoji?: string; color: string }>; revision: string };

  // Chore ids are load-bearing and survive verbatim, in source order, with
  // their attributes. The calendar "sam" folds into the chore Sam by name;
  // Jordan matched nobody and keeps their own id.
  expect(family.members.map((member) => member.id)).toEqual(['legacy-avery', 'legacy-sam', 'cal-jordan']);
  expect(family.members[0]).toMatchObject({ name: 'Avery', emoji: 'crown', color: '#f59e0b' });
  expect(family.members[2]).toMatchObject({ name: 'Jordan', color: '#60a5fa' });
  expect(family.revision).toBeTruthy();

  // Calendar ownership moved to member ids, and the legacy list is gone.
  const config = await getConfig(request);
  expect(config.version).toBe(13);
  expect(config.settings.calendar.people).toBeUndefined();
  expect(config.settings.calendar.personSources).toEqual({ 'legacy-sam': ['school'], 'cal-jordan': ['work'] });

  // chores.json lost its members and kept everything else.
  const chores = await request.get('/api/chores/data');
  expect(chores.ok()).toBe(true);
  const choreBody = await chores.json();
  expect(choreBody.members).toBeUndefined();
  expect(choreBody.chores[0]).toMatchObject({ id: 'legacy-chore', assigneeIds: ['legacy-avery', 'legacy-sam'] });

  // On disk: the fold is durable, complete and left no pending journal.
  expect(readData(data, 'family.json').migrated).toBe(true);
  expect(readData(data, 'chores.json').members).toBeUndefined();
  expect(readData(data, 'chores.json').chores[0].schedule).toEqual({ 'legacy-avery': [1], 'legacy-sam': [2] });
  expect(readData(data, 'chore-completions.json').completions[0].memberId).toBe('legacy-avery');
  expect(readData(data, 'rewards.json').balances).toEqual({ 'legacy-avery': 7, 'legacy-sam': 2 });
  expect(existsSync(path.join(data, 'family-transaction.json'))).toBe(false);
  // The originals are kept as evidence, and the pre-migration config as a snapshot.
  expect(readData(data, 'family-migration.json').sources.chores).toContain('legacy-avery');
  expect(existsSync(path.join(data, 'backups'))).toBe(true);
});

test('the folded roster is what the editor and the display now read', async ({ page, request, sandboxDir }) => {
  writeLegacyInstall(sandboxDir);
  await request.get('/api/family');

  await page.goto('/editor/settings?section=defaults&page=family');
  const manager = page.getByTestId('family-manager');
  await expect(manager.getByTestId('family-member')).toHaveCount(3);
  await expect(manager.getByText('Avery', { exact: true })).toBeVisible();
  await expect(manager.getByText('Jordan', { exact: true })).toBeVisible();

  // Calendar ownership is now presented against the shared roster, and the
  // person who owned "School" before the fold still owns it.
  await page.goto('/editor/settings?section=defaults&page=calendar');
  await expect(page.getByRole('group', { name: 'Sam', exact: true }).getByRole('checkbox', { name: 'School', exact: true })).toBeChecked();
  await expect(page.getByRole('group', { name: 'Avery', exact: true }).getByRole('checkbox', { name: 'School', exact: true })).not.toBeChecked();

  // Chore assignments still resolve to real people after the identity rewrite.
  const today = await request.get('/api/chores/today');
  expect(today.ok()).toBe(true);
  const names = (await today.json()).members.map((member: { name: string }) => member.name);
  expect(names).toEqual(['Avery', 'Sam', 'Jordan']);
});

test('a second request does not fold again or disturb the settled roster', async ({ request, sandboxDir }) => {
  const data = writeLegacyInstall(sandboxDir);
  const first = await (await request.get('/api/family')).json();
  const familyBytes = readFileSync(path.join(data, 'family.json'), 'utf8');
  const configBytes = readFileSync(path.join(data, 'config.json'), 'utf8');

  const second = await (await request.get('/api/family')).json();
  expect(second).toEqual(first);
  expect(readFileSync(path.join(data, 'family.json'), 'utf8')).toBe(familyBytes);
  expect(readFileSync(path.join(data, 'config.json'), 'utf8')).toBe(configBytes);
});

// This spec writes legacy files straight into the worker's shared sandbox and
// opts out of the auto roster reset, so it has to put the household back
// itself. Removing every member cascades completions and balances; the chore
// and reward definitions it seeded are cleared explicitly.
test.afterEach(async ({ request }) => {
  const family = await (await request.get('/api/family')).json() as { members: Array<{ id: string }>; revision: string };
  if (family.members.length) {
    const cleared = await request.put('/api/family', { data: {
      members: [], revision: family.revision, removedIds: family.members.map((member) => member.id),
    } });
    expect(cleared.ok(), `family reset answered ${cleared.status()}`).toBe(true);
  }
  for (const [url, body] of [
    ['/api/chores/data', { chores: [], force: true }],
    ['/api/rewards/data', { rewards: [], force: true }],
  ] as const) {
    const response = await request.put(url, { data: body });
    expect(response.ok(), `${url} reset answered ${response.status()}: ${(await response.text()).slice(0, 200)}`).toBe(true);
  }
});
