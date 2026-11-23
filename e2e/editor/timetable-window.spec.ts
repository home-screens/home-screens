import { test, expect } from '../fixtures';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import {
  E2E_TIMETABLE_MEMBER_IDS,
  E2E_TIMETABLE_SCHOOL_IDS,
  E2E_TIMETABLE_SEED_MEMBER_IDS,
  putConfig,
  seedTimetables,
  timetableHouseholdSeed,
  timetableSeed,
  type TimetableSeed,
} from '../helpers/api';
import { renderOnDisplay } from '../helpers/display';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
import { selectModule } from '../helpers/editor';
import type { TimetableData } from '@/types/timetables';

/**
 * The timetables window, end to end.
 *
 * The window is the only place a week is written, and it saves as it goes
 * against a whole document with a revision on it. So every case here ends at
 * the store: the edit is made in the browser and then read back out of
 * `/api/timetables`, because an edit that only changed what is on screen is
 * exactly the failure the window is built to make impossible.
 *
 * Two things this file covers that live either side of the window: the family
 * removal cascade, which takes a person's week with them, and the wall's
 * holiday lookup, which must not happen at all until a region is picked. The
 * holiday guard is here rather than in the display matrices because those are
 * data-driven registries with no room for a one-off assertion, and because the
 * lookup is the only part of this module that reaches outside the house.
 */

/**
 * The region list the Schools tab asks for on mount. It is the one call in this
 * feature that leaves the machine, and it is made by the route handler on the
 * server, where `stubModuleData`'s external block cannot see it, so it is
 * answered at the browser boundary instead, before it can get that far.
 */
const NO_REGIONS = {
  country: 'US',
  subdivisions: [],
  regionCategory: [],
  hasSchoolHolidays: false,
  fetchedAt: '2026-01-01T00:00:00.000Z',
};

/** A country with regions and school dates behind them, so the row is a picker. */
const GERMAN_REGIONS = {
  country: 'DE',
  subdivisions: [
    { code: 'DE-NW', label: 'North Rhine-Westphalia', shortName: 'NW', names: [{ language: 'EN', text: 'North Rhine-Westphalia' }] },
  ],
  regionCategory: [{ language: 'EN', text: 'federal state' }],
  hasSchoolHolidays: true,
  fetchedAt: '2026-01-01T00:00:00.000Z',
};

/** One tab of a sheet, already matched to Leon, with one code nobody has yet. */
const SHEET_CHECK = {
  ok: true,
  tabsListed: true,
  tabs: [
    {
      gid: '0',
      name: 'Leon 7c',
      memberId: E2E_TIMETABLE_MEMBER_IDS.leon,
      preview: {
        headerRow: 0,
        days: ['mon', 'tue'],
        rows: [
          {
            kind: 'period',
            n: 1,
            cells: {
              mon: { text: 'Bio', code: 'Bio' },
              tue: { text: 'Ma 112', code: 'Ma', subjectId: 'ma', room: '112' },
            },
          },
        ],
        unknownCodes: [{ code: 'Bio', count: 1 }],
      },
    },
  ],
};

/**
 * The country in the answer is echoed back from the question, because the row
 * throws away an answer about a country other than the one it just asked
 * about: what the editor resolves here is the display locale's own region, and
 * a fixture that named a country of its own would leave it resolving forever.
 */
async function stubHolidayLookup(page: Page, body: unknown = NO_REGIONS): Promise<void> {
  await page.route('**/api/timetables/holidays*', (route) => {
    const asked = new URL(route.request().url()).searchParams.get('country');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(asked ? { ...(body as object), country: asked } : body),
    });
  });
}

/** The whole saved document, which is what every case here asserts against. */
async function savedTimetables(request: APIRequestContext): Promise<{ data: TimetableData; revision: string }> {
  const res = await request.get('/api/timetables');
  expect(res.ok(), `GET /api/timetables answered ${res.status()}`).toBe(true);
  return res.json() as Promise<{ data: TimetableData; revision: string }>;
}

/**
 * The next save the window makes. Register it BEFORE the edit: the debounce is
 * 400ms, so a wait started afterwards is a race with it.
 */
function savedOnce(page: Page): Promise<unknown> {
  return page.waitForResponse((r) =>
    r.url().includes('/api/timetables') && r.request().method() === 'PUT' && r.ok());
}

/** Select a timetable module in the editor and open its window on the panel's button. */
async function openWindow(
  page: Page,
  request: APIRequestContext,
  sandboxDir: string,
  seed?: TimetableSeed,
  holidays: unknown = NO_REGIONS,
): Promise<Locator> {
  seedTimetables(sandboxDir, seed);
  await stubHolidayLookup(page, holidays);
  await selectModule(page, request, buildModuleInstance('timetable'));
  await page.getByRole('button', { name: 'Edit timetables' }).click();
  const window = page.getByRole('dialog');
  // The window says "Loading…" until the document is in hand; the tab strip is
  // the first thing that exists once it is.
  await expect(window.getByRole('tab', { name: 'Timetables', exact: true })).toBeVisible();
  return window;
}

test('the window opens from the panel, starts a week for whoever the Add button names, and closes with Done', async ({ page, request, sandboxDir }) => {
  // Lina is on the roster with no week, so her row is the one carrying Add.
  const seed = timetableSeed();
  const withLina: TimetableSeed = {
    data: seed.data,
    members: [...seed.members, { id: E2E_TIMETABLE_MEMBER_IDS.lina, name: 'Lina' }],
  };

  const window = await openWindow(page, request, sandboxDir, withLina);
  const editButton = page.getByRole('button', { name: 'Edit timetables' });
  await expect(editButton).toHaveAttribute('aria-expanded', 'true');
  await window.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(editButton).toHaveAttribute('aria-expanded', 'false');

  // The other way in: the row of somebody who has no week yet.
  const addForLina = page.getByRole('button', { name: 'Add a timetable for Lina' });
  await addForLina.click();
  const reopened = page.getByRole('dialog');
  await expect(addForLina).toHaveAttribute('aria-expanded', 'true');
  await expect(reopened.getByText('In your family, no timetable yet')).toBeVisible();

  const saved = savedOnce(page);
  await reopened.getByRole('button', { name: /Lina/ }).click();
  await saved;
  await reopened.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const { data } = await savedTimetables(request);
  expect(data.timetables.map((timetable) => timetable.memberId)).toContain(E2E_TIMETABLE_MEMBER_IDS.lina);
  // Closing re-reads who has a week, so Lina's row turns from an Add button
  // into a tick box without the panel being reopened.
  await expect(page.getByRole('checkbox', { name: 'Show Lina' })).toBeVisible();
});

test('painting a cell saves it on the person whose week is showing', async ({ page, request, sandboxDir }) => {
  const window = await openWindow(page, request, sandboxDir);

  // Leon leads the rail (first on the roster, and he has a week). His Monday
  // sixth period is free in the seed, and the default brush is the first
  // subject on the shared list.
  const cell = window.locator('button[data-day="mon"][data-period="6"]');
  await expect(cell).toBeVisible();

  const saved = savedOnce(page);
  await cell.click();
  await saved;

  await expect(cell).toContainText('Deu');
  const { data } = await savedTimetables(request);
  const leon = data.timetables.find((timetable) => timetable.memberId === E2E_TIMETABLE_MEMBER_IDS.leon);
  expect(leon?.weeks.A.mon?.[6]).toEqual({ subjectId: 'deu' });
});

test('a school added on the Schools tab arrives with the bell times of the template it was started from', async ({ page, request, sandboxDir }) => {
  const window = await openWindow(page, request, sandboxDir);
  await window.getByRole('tab', { name: 'Schools & times' }).click();
  await window.getByRole('button', { name: 'Add school' }).click();

  // The add form sits in the left rail, ahead of the selected school's own
  // name field on the right, so both answer to the same caption.
  await window.getByLabel('School name').first().fill('E2E Gesamtschule');
  const saved = savedOnce(page);
  await window.getByRole('button', { name: 'Add', exact: true }).click();
  await saved;

  const { data } = await savedTimetables(request);
  const added = data.schools.find((school) => school.name === 'E2E Gesamtschule');
  expect(added, 'the new school is in the saved document').toBeDefined();
  expect(added?.slots.filter((slot) => slot.kind === 'period')).toHaveLength(10);
  expect(added?.slots[0].start).toBe('07:50');
});

test('a bell time is edited on the school, which is what everybody at it shares', async ({ page, request, sandboxDir }) => {
  const window = await openWindow(page, request, sandboxDir);
  await window.getByRole('tab', { name: 'Schools & times' }).click();

  // Leon's school is the one selected, because his week is the one showing.
  const firstStart = window.getByLabel('Starts').first();
  await expect(firstStart).toHaveValue('07:50');

  const saved = savedOnce(page);
  await firstStart.fill('07:30');
  await saved;

  const { data } = await savedTimetables(request);
  const school = data.schools.find((entry) => entry.id === E2E_TIMETABLE_SCHOOL_IDS.secondary);
  expect(school?.slots[0]).toMatchObject({ kind: 'period', n: 1, start: '07:30' });
});

test('a subject added from the palette joins the shared list and becomes the brush', async ({ page, request, sandboxDir }) => {
  const window = await openWindow(page, request, sandboxDir);

  await window.getByRole('button', { name: 'Add subject' }).click();
  const saved = savedOnce(page);
  await window.getByLabel('Short').fill('Bio');
  await window.getByRole('button', { name: 'Add', exact: true }).click();
  await saved;

  await expect(window.getByRole('button', { name: 'Bio' })).toHaveAttribute('aria-pressed', 'true');
  const { data } = await savedTimetables(request);
  expect(data.subjects.map((subject) => subject.code)).toContain('Bio');
});

test('a save somebody else got in ahead of says so and hands back what is saved now', async ({ page, request, sandboxDir }) => {
  const window = await openWindow(page, request, sandboxDir);

  // One edit of our own first, so the window is holding the revision the other
  // save is about to move on from.
  const first = savedOnce(page);
  await window.locator('button[data-day="mon"][data-period="6"]').click();
  await first;

  const snapshot = await savedTimetables(request);
  const elsewhere = structuredClone(snapshot.data);
  elsewhere.schools[0].name = 'Umbenannt';
  const wrote = await request.put('/api/timetables', { data: { data: elsewhere, revision: snapshot.revision } });
  expect(wrote.ok(), `PUT /api/timetables answered ${wrote.status()}: ${(await wrote.text()).slice(0, 300)}`).toBe(true);

  const refused = page.waitForResponse((r) =>
    r.url().includes('/api/timetables') && r.request().method() === 'PUT' && r.status() === 409);
  await window.locator('button[data-day="tue"][data-period="5"]').click();
  await refused;

  // The banner says what actually happened to the edit rather than asking the
  // household to go and check a change the window has already thrown away, so
  // there is no Refresh button to offer either.
  await expect(window.getByRole('alert')).toContainText('so we loaded theirs');
  await expect(window.getByRole('button', { name: 'Refresh' })).toHaveCount(0);

  // The refusal carried the saved document with it and the window adopted it,
  // rather than leaving the household looking at an edit nothing has.
  await window.getByRole('tab', { name: 'Schools & times' }).click();
  // The school's own row in the rail, named by its periods as well, so the match
  // is not also the Remove button that carries the school's name.
  await expect(window.getByRole('button', { name: /Umbenannt \d+ periods/ })).toBeVisible();
});

test('an import maps a sheet tab to a person and writes their week', async ({ page, request, sandboxDir }) => {
  const window = await openWindow(page, request, sandboxDir);

  // The sheet is downloaded by the route handler on the server, where
  // page.route cannot reach it, so the hub's own check endpoint is what gets
  // stubbed. Nothing in this case touches Google.
  await page.route('**/api/timetables/import/check', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(SHEET_CHECK),
  }));

  await window.getByRole('button', { name: 'Import from a spreadsheet' }).click();
  await window.getByLabel('Link to the sheet').fill('https://docs.google.com/spreadsheets/d/e2e-timetable/edit');
  await window.getByRole('button', { name: 'Check', exact: true }).click();

  await expect(window.getByText(/Found 1 tab in/)).toBeVisible();
  // The tab is named after Leon, so it comes back already pointed at him.
  await expect(window.getByLabel('Who is this tab for?')).toHaveValue(E2E_TIMETABLE_MEMBER_IDS.leon);
  // Bio is not one of the household's subjects, so the screen asks about it.
  await expect(window.getByText(/1 code in the sheet is not in your subjects/)).toBeVisible();

  const saved = savedOnce(page);
  await window.getByRole('button', { name: 'Import 1 timetable' }).click();
  await saved;

  const { data } = await savedTimetables(request);
  const bio = data.subjects.find((subject) => subject.code === 'Bio');
  expect(bio, 'the code nobody had became a subject of its own').toBeDefined();
  const leon = data.timetables.find((timetable) => timetable.memberId === E2E_TIMETABLE_MEMBER_IDS.leon);
  expect(leon?.weeks.A.mon?.[1]).toEqual({ subjectId: bio?.id });
  // A code the household already had keeps its subject, and the room rides along.
  expect(leon?.weeks.A.tue?.[1]).toEqual({ subjectId: 'ma', room: '112' });
  // The tab it was read from, not just the link: one link holds a tab per child,
  // so a source with no tab sends every hourly re-read to whichever tab the
  // sheet hands out first.
  expect(leon?.source).toMatchObject({ kind: 'sheet', sync: false, tab: '0' });
  // And the answer this screen asked for, so a re-read makes the same sense of
  // "Bio" instead of emptying that period an hour later. Keyed folded, so every
  // spelling the sheet uses for it finds the same answer.
  expect(leon?.source?.codes).toEqual({ bio: bio?.id });
});

test('removing somebody from Family takes their timetable with them', async ({ page, request, sandboxDir }) => {
  seedTimetables(sandboxDir);
  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=family');

  const manager = page.getByTestId('family-manager');
  await expect(manager.getByText('Mia', { exact: true })).toBeVisible();
  // The roster knows who has a week, so the warning can name it before
  // anything is removed.
  await expect(manager.getByText('Has a timetable').first()).toBeVisible();

  await manager.getByRole('button', { name: 'Remove Mia?' }).click();
  await expect(page.getByText('Mia has a school timetable, and it is removed as well.')).toBeVisible();

  const removed = page.waitForResponse((r) => r.url().endsWith('/api/family') && r.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Remove person' }).click();
  expect((await removed).ok()).toBe(true);

  const { data } = await savedTimetables(request);
  expect(data.timetables.map((timetable) => timetable.memberId)).toEqual([E2E_TIMETABLE_MEMBER_IDS.leon]);
  // Only her week goes: the schools and the subject list belong to everybody.
  expect(data.schools).toHaveLength(2);
  expect(data.subjects.length).toBeGreaterThan(0);
});

test('with nobody in Family the panel says where to start and the window stays shut', async ({ page, request, sandboxDir }) => {
  seedTimetables(sandboxDir, { members: [] });
  await stubHolidayLookup(page);
  await selectModule(page, request, buildModuleInstance('timetable'));

  await expect(page.getByText('Nobody is in Family yet. Add people on the Family page, then give them a timetable here.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Manage family' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit timetables' })).toBeDisabled();
  // Nothing below the picker can be set for people who are not there yet.
  await expect(page.getByRole('radiogroup', { name: 'Layout' })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a wall asks the holiday service nothing until a region is picked', async ({ page, request, sandboxDir }) => {
  seedTimetables(sandboxDir);
  const stub = await stubModuleData(page);
  const holidayCalls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/timetables/holidays')) holidayCalls.push(r.url());
  });

  const display = await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [
      buildModuleInstance('timetable', { memberIds: E2E_TIMETABLE_SEED_MEMBER_IDS }),
    ])],
    settings: matrixSettings(),
  }));
  await expect(display.module('timetable')).toContainText('Leon');
  expect(holidayCalls, 'no region is configured, so no holiday lookup may happen at all').toEqual([]);
  expect(stub.externalHits, 'the wall must not reach any outside host').toEqual([]);

  // With a region on the schools it does ask, and the stub is what answers: the
  // route handler is the one thing here that would otherwise call an upstream
  // from Node. The two schools are in two states, which is the case the region
  // moved onto the school for, and they are asked about in one request.
  const seed = timetableSeed();
  seedTimetables(sandboxDir, {
    ...seed,
    data: {
      ...seed.data,
      schools: seed.data.schools.map((school, index) => ({
        ...school,
        holidayRegion: index === 0 ? 'DE-NW' : 'DE-BY',
      })),
    },
  });
  await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [
      buildModuleInstance('timetable', { memberIds: E2E_TIMETABLE_SEED_MEMBER_IDS }),
    ])],
    settings: matrixSettings(),
  }));
  await expect(display.module('timetable')).toContainText('Leon');
  await expect.poll(() => holidayCalls.length, { message: 'a school with a region is what drives the lookup' })
    .toBeGreaterThan(0);
  expect(decodeURIComponent(holidayCalls[0])).toContain('region=DE-BY,DE-NW');
  expect(stub.externalHits).toEqual([]);
});

test('the region a school follows is picked in the window and saved on the school', async ({ page, request, sandboxDir }) => {
  // Whose holidays close a school belongs beside the days the school does
  // differently, and it lands on the school rather than on the module: two
  // children at schools in two states need two answers.
  const window = await openWindow(page, request, sandboxDir, undefined, GERMAN_REGIONS);
  await window.getByRole('tab', { name: 'Schools & times' }).click();

  const picker = window.getByLabel('School holidays');
  await expect(picker).toBeVisible();
  const saved = savedOnce(page);
  await picker.selectOption('DE-NW');
  await saved;

  const { data } = await savedTimetables(request);
  // Leon's school is the one selected, because his week is the one showing.
  const leon = data.timetables.find((timetable) => timetable.memberId === E2E_TIMETABLE_MEMBER_IDS.leon);
  expect(data.schools.find((school) => school.id === leon?.schoolId)?.holidayRegion).toBe('DE-NW');
  // And only that school: the other one is somewhere else.
  expect(data.schools.filter((school) => school.holidayRegion).length).toBe(1);
});

test('a room typed on a lesson reaches the wall, and copying it fills every one of that subject', async ({ page, request, sandboxDir }) => {
  const window = await openWindow(page, request, sandboxDir);

  // Leon's Monday first period. The pencil only appears on a lesson, so its
  // presence is half the assertion.
  const cell = window.locator('button[data-day="mon"][data-period="1"]');
  await expect(cell).toBeVisible();
  const pencil = window.locator('button[aria-label*="Room and course"]').first();
  await expect(pencil).toBeVisible();

  const saved = savedOnce(page);
  await pencil.click();
  const popover = page.getByRole('dialog').filter({ hasText: 'Course group' }).last();
  await expect(popover).toBeVisible();
  await popover.getByLabel('Room').fill('A107');
  // Commits when the field is left, not on the keystroke.
  await popover.getByLabel('Course group').click();
  await saved;

  const first = await savedTimetables(request);
  const leonWeek = first.data.timetables.find((t) => t.memberId === E2E_TIMETABLE_MEMBER_IDS.leon)?.weeks.A;
  expect(leonWeek?.mon?.[1]).toMatchObject({ room: 'A107' });

  // "Copy to every X" reaches both weeks, because a fixed room does not alternate.
  const copied = savedOnce(page);
  await popover.getByRole('button', { name: /Copy to every/ }).click();
  await copied;

  const { data } = await savedTimetables(request);
  const leon = data.timetables.find((t) => t.memberId === E2E_TIMETABLE_MEMBER_IDS.leon);
  const subjectId = (leon?.weeks.A.mon?.[1] as { subjectId: string }).subjectId;
  const everyLesson = Object.values(leon?.weeks.A ?? {}).flatMap((day) => Object.values(day));
  const sameSubject = everyLesson.filter((c) => 'subjectId' in c && c.subjectId === subjectId);
  expect(sameSubject.length).toBeGreaterThan(1);
  expect(sameSubject.every((c) => 'room' in c && c.room === 'A107')).toBe(true);
});

test('a week that follows a spreadsheet says so, and stops following it the moment somebody paints on it', async ({ page, request, sandboxDir }) => {
  const seed = timetableSeed();
  const followed: TimetableSeed = {
    members: seed.members,
    data: {
      ...seed.data,
      timetables: seed.data.timetables.map((timetable) =>
        timetable.memberId === E2E_TIMETABLE_MEMBER_IDS.leon
          ? {
              ...timetable,
              source: {
                kind: 'sheet' as const,
                url: 'https://docs.google.com/spreadsheets/d/1abcDEF/edit#gid=7',
                importedAt: '2026-09-04T08:00:00.000Z',
                sync: true,
                tab: '7',
                // Looked at a moment ago, so the hourly check is not due: an
                // E2E run must not make a real request to Google, and this one
                // would come from the server where page.route cannot see it.
                lastCheckedAt: new Date().toISOString(),
              },
            }
          : timetable,
      ),
    },
  };

  const window = await openWindow(page, request, sandboxDir, followed);

  // The way back to the sheet an import came from, which used to exist nowhere.
  // A pill in the header row rather than a card above the grid: the grid is what
  // the window is for, and this is read once and then ignored for a term.
  await window.getByRole('button', { name: /From a spreadsheet/ }).click();
  await expect(window.getByText('Keep in sync with the sheet')).toBeVisible();
  await expect(window.getByRole('link', { name: /Open the sheet/ })).toHaveAttribute(
    'href',
    'https://docs.google.com/spreadsheets/d/1abcDEF/edit#gid=7',
  );
  await page.keyboard.press('Escape');

  // Painting is a hand edit, and a hand edit must never be thrown away by an
  // hourly check. The week stops following the sheet instead, and says so.
  const saved = savedOnce(page);
  await window.locator('button[data-day="mon"][data-period="6"]').click();
  await saved;

  await expect(window.getByText(/no longer following the sheet/)).toBeVisible();
  const { data } = await savedTimetables(request);
  const leon = data.timetables.find((t) => t.memberId === E2E_TIMETABLE_MEMBER_IDS.leon);
  expect(leon?.source?.sync).toBe(false);

  // And it is reversible, because it was the app's decision rather than theirs.
  const back = savedOnce(page);
  await window.getByRole('button', { name: 'Undo' }).click();
  await back;
  expect((await savedTimetables(request)).data.timetables.find(
    (t) => t.memberId === E2E_TIMETABLE_MEMBER_IDS.leon,
  )?.source?.sync).toBe(true);
});

test('a spreadsheet saved on this computer can be imported, and records no sheet to follow', async ({ page, request, sandboxDir }) => {
  const window = await openWindow(page, request, sandboxDir);
  await window.getByRole('button', { name: 'Import from a spreadsheet' }).click();

  // The resting screen teaches the shape rather than showing a link box over
  // an empty panel: laying the sheet out is the slowest part of a first import.
  await expect(window.getByText('What the spreadsheet should look like')).toBeVisible();

  // Named after the person it is for, which is how a file finds its owner.
  await window.locator('input[type="file"]').setInputFiles({
    name: 'Leon.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      [
        'Period,Time,Monday,Tuesday,Wednesday',
        '1,07:50-08:35,Ma,Deu,Ma',
        '2,08:40-09:25,Deu,Ma,Deu',
      ].join('\n'),
    ),
  });

  await expect(window.getByText(/2 periods, Monday to Wednesday/)).toBeVisible();
  // Nothing to keep in sync with, so nothing offers to.
  await expect(window.getByText('Keep in sync with the sheet')).toHaveCount(0);

  const saved = savedOnce(page);
  await window.getByRole('button', { name: /Import 1 timetable/ }).click();
  await saved;

  const { data } = await savedTimetables(request);
  const leon = data.timetables.find((t) => t.memberId === E2E_TIMETABLE_MEMBER_IDS.leon);
  expect(leon?.weeks.A.mon?.[1]).toBeDefined();
  expect(leon?.weeks.A.tue?.[2]).toBeDefined();
  // A file has no link behind it, so there is nothing to go back to and the
  // week is simply theirs.
  expect(leon?.source).toBeUndefined();
});

test('a timetable added by mistake can be taken away again', async ({ page, request, sandboxDir }) => {
  // Adding one used to be a one-way door: somebody picked by mistake, or a child
  // who has left school, stayed on the list for good, and the only way out was
  // removing them from Family, which takes their chores and their calendar too.
  const window = await openWindow(page, request, sandboxDir);

  const before = await savedTimetables(request);
  expect(before.data.timetables.map((timetable) => timetable.memberId))
    .toContain(E2E_TIMETABLE_MEMBER_IDS.leon);

  const saved = savedOnce(page);
  await window.getByRole('button', { name: /^Delete .*timetable$/ }).click();
  await page.getByRole('button', { name: 'Delete timetable' }).click();
  await saved;

  const { data } = await savedTimetables(request);
  expect(data.timetables.map((timetable) => timetable.memberId))
    .not.toContain(E2E_TIMETABLE_MEMBER_IDS.leon);
  // The person is untouched: only their week went.
  await expect(window.getByText('In your family, no timetable yet')).toBeVisible();
  // And the school and the shared subject list, which belong to everybody, stay.
  expect(data.schools.length).toBeGreaterThan(0);
  expect(data.subjects.length).toBeGreaterThan(0);
});

test('a school nobody is at can be removed, and one in use says who is there', async ({ page, request, sandboxDir }) => {
  const window = await openWindow(page, request, sandboxDir);
  await window.getByRole('tab', { name: 'Schools & times' }).click();

  // The seeded school has somebody at it, so it cannot go, and the reason names
  // them rather than leaving a dead button.
  const inUse = window.getByRole('button', { name: 'Delete Gymnasium am Rhein' });
  await expect(inUse).toBeDisabled();
  await expect(inUse).toHaveAttribute('title', /still in use by Leon/);
});

test('an import into a two-school household asks which school, and warns when the week is too long for it', async ({ page, request, sandboxDir }) => {
  // This is the case the import used to get silently wrong: it always wrote
  // `schools[0]`, so a household with a secondary and a primary school got the
  // secondary for both children. The wrong bell schedule is visible, but a
  // lesson in a period that school has no bell for is drawn nowhere at all -
  // not on the wall and not in the paint grid - while sitting in the saved file.
  const window = await openWindow(page, request, sandboxDir, timetableHouseholdSeed());

  // Nine periods, which the primary school (eight) cannot hold.
  const longWeek = {
    ok: true,
    tabsListed: true,
    tabs: [{
      gid: '0',
      name: 'Lina',
      memberId: E2E_TIMETABLE_MEMBER_IDS.lina,
      preview: {
        headerRow: 0,
        days: ['mon'],
        rows: Array.from({ length: 9 }, (_, index) => ({
          kind: 'period',
          n: index + 1,
          cells: { mon: { text: 'Ma', code: 'Ma', subjectId: 'ma' } },
        })),
        unknownCodes: [],
      },
    }],
  };
  await page.route('**/api/timetables/import/check', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(longWeek),
  }));

  await window.getByRole('button', { name: 'Import from a spreadsheet' }).click();
  await window.getByLabel('Link to the sheet').fill('https://docs.google.com/spreadsheets/d/e2e-two-schools/edit');
  await window.getByRole('button', { name: 'Check', exact: true }).click();

  // The school is asked for, because there is more than one to choose from.
  const picker = window.getByLabel('Which school these weeks are at');
  await expect(picker).toBeVisible();

  // Pointed at the primary school, the nine-period week is too long and the
  // screen says so rather than letting the extra lesson vanish after the save.
  await picker.selectOption('ggs');
  await expect(window.getByText(/GGS Lindenweg only has times for 8 lessons a day/)).toBeVisible();

  // Pointed at the secondary school, which has ten, there is nothing to warn about.
  await picker.selectOption('gar');
  await expect(window.getByText(/only has times for .* lessons a day/)).toHaveCount(0);

  const saved = savedOnce(page);
  await window.getByRole('button', { name: 'Import 1 timetable' }).click();
  await saved;

  const { data } = await savedTimetables(request);
  const lina = data.timetables.find((timetable) => timetable.memberId === E2E_TIMETABLE_MEMBER_IDS.lina);
  // The school somebody picked, not whichever one happened to be first.
  expect(lina?.schoolId).toBe('gar');
  // And every one of the nine periods is on a school that rings a bell for it.
  expect(Object.keys(lina?.weeks.A.mon ?? {})).toHaveLength(9);
});

test('a date added on the Dates tab reaches the wall: the Day view packs it the evening before', async ({ page, request, sandboxDir }) => {
  const window = await openWindow(page, request, sandboxDir);
  await window.getByRole('tab', { name: 'Dates', exact: true }).click();
  await expect(window.getByText('Nothing coming up')).toBeVisible();

  // Tomorrow, worked out from the real clock, so the wall's Day view (which
  // shows tomorrow from 16:00) or today's card (before it) can carry the pill
  // either way: the row is asserted on the saved document, the wall on the
  // packing card for whichever day it shows.
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await window.getByRole('button', { name: 'Add a date' }).click();
  const form = window.getByTestId('timetable-note-form');
  await form.getByRole('button', { name: /^Leon/ }).click();
  await form.getByLabel('Day').fill(tomorrow);
  await form.getByRole('radio', { name: 'Something to bring' }).click();
  await form.getByLabel('What to bring').fill('Wanderschuhe');
  const saved = savedOnce(page);
  await form.getByRole('button', { name: 'Add', exact: true }).click();
  await saved;
  await expect(window.getByTestId('timetable-note-row')).toHaveCount(1);
  await expect(window.getByRole('tab', { name: /Dates/ })).toContainText('1');
  await window.getByRole('button', { name: 'Done', exact: true }).click();

  const { data } = await savedTimetables(request);
  const leon = data.timetables.find((timetable) => timetable.memberId === E2E_TIMETABLE_MEMBER_IDS.leon);
  expect(leon?.notes).toEqual([{ id: expect.any(String), date: tomorrow, kind: 'bring', text: 'Wanderschuhe' }]);

  // The wall: Leon's Day view row lists the bag for the day it shows. Before
  // the switch time that is today, so only a wall already on tomorrow carries
  // the pill; the store is what the test holds to, the wall is checked when
  // it is showing the right day.
  await stubModuleData(page);
  const wall = await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [buildModuleInstance('timetable', { memberIds: [E2E_TIMETABLE_MEMBER_IDS.leon], view: 'day', layout: 'stacked' })])],
    settings: matrixSettings(),
  }));
  const day = wall.module('timetable').locator('[data-testid="timetable-day-view"]');
  await expect(day).toBeVisible();
  if ((await day.getAttribute('data-date')) === tomorrow) {
    await expect(wall.module('timetable').locator('[data-testid="timetable-bring"]', { hasText: 'Wanderschuhe' })).toBeVisible();
  }
});
