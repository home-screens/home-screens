import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { stubModuleData } from '../helpers/stubs';
import type { ModuleInstance, ScreenConfiguration } from '@/types/config';

/**
 * The colour key on the wall: one button that opens the Calendars sheet,
 * where a calendar is hidden from this wall or given another colour, and the
 * household's calendar order in the key and in a day's rows.
 */

const LINKS = [
  { id: 'chores', name: 'Chores', color: '#f59e0b' },
  { id: 'family', name: 'Family', color: '#3b82f6' },
];

function at(time: string, dayOffset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${time}:00`;
}

/** Chores start first, so time order and the family's order disagree. */
const eventsOn = (dayOffset: number) => [
  { id: 'c1', title: 'BINS OUT', start: at('07:00', dayOffset), end: at('07:15', dayOffset), allDay: false, calendarColor: '#f59e0b', sourceId: 'chores', sourceName: 'Chores' },
  { id: 'c2', title: 'WATER PLANTS', start: at('08:00', dayOffset), end: at('08:15', dayOffset), allDay: false, calendarColor: '#f59e0b', sourceId: 'chores', sourceName: 'Chores' },
  { id: 'f1', title: 'PIANO LESSON', start: at('16:00', dayOffset), end: at('17:00', dayOffset), allDay: false, calendarColor: '#3b82f6', sourceId: 'family', sourceName: 'Family' },
];
/** Today: a grid draws the whole day whatever the time is. */
const EVENTS = eventsOn(0);

async function openWall(page: Page, request: APIRequestContext, instances: ModuleInstance[], change: (config: ScreenConfiguration) => void = () => {}, path = '/display', events = EVENTS) {
  await stubModuleData(page, { overrides: { calendar: events } });
  const config = baseConfig({ screens: instances.map((instance, index) => makeScreen(`cal-${index}`, `Calendar ${index}`, [instance])) });
  config.settings.calendar.icalSources = LINKS.map((link) => ({ ...link, type: 'ical' as const, url: `https://example.com/${link.id}.ics`, enabled: true }));
  change(config);
  await putConfig(request, config);
  await page.goto(path);
  await expect(page.getByText('PIANO LESSON').first()).toBeVisible();
}

const month = (config: Record<string, unknown> = {}) =>
  buildModuleInstance('fullscreen-calendar', { view: 'month-grid', showLegend: 'header', monthMaxEventsPerCell: 1, ...config });

test.describe('the colour key on the wall', () => {
  test.use({ viewport: { width: 1080, height: 1920 } });

  test('opens the Calendars sheet, where a calendar is hidden from this wall and brought back', async ({ page, request }) => {
    await openWall(page, request, [month({ monthMaxEventsPerCell: 5 })]);
    const key = page.getByTestId('calendar-key-open');
    // One finger-sized button, never a target per row.
    expect((await key.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await key.click();

    const sheet = page.getByTestId('wall-calendars-sheet');
    const chores = sheet.getByTestId('wall-calendar-row').filter({ hasText: 'Chores' });
    await expect(chores).toContainText('2 events');
    await chores.getByRole('switch', { name: 'Show Chores' }).click();
    await expect(chores).toContainText('Hidden on this wall');
    await expect(page.getByText('BINS OUT')).toHaveCount(0);
    await sheet.getByTestId('wall-calendars-done').click();
    await expect(sheet).toHaveCount(0);

    // The hidden calendar keeps its row in the key, and stays hidden after a restart.
    await expect(key.locator('[data-source-hidden]')).toHaveText('Chores');
    await page.reload();
    await expect(page.getByText('PIANO LESSON').first()).toBeVisible();
    await expect(page.getByText('BINS OUT')).toHaveCount(0);

    await key.click();
    await chores.getByRole('switch', { name: 'Show Chores' }).click();
    await expect(page.getByText('BINS OUT').first()).toBeVisible();
  });

  test('a calendar hidden on the wall still shows on a screen with no key', async ({ page, request }) => {
    await openWall(page, request, [month({ monthMaxEventsPerCell: 5 }), month({ id: 'no-key', showLegend: 'off', monthMaxEventsPerCell: 5 })], undefined, '/display?screen=cal-0');
    await page.getByTestId('calendar-key-open').click();
    await page.getByRole('switch', { name: 'Show Chores' }).click();
    await page.getByTestId('wall-calendars-done').click();
    await expect(page.getByText('BINS OUT')).toHaveCount(0);

    // No key means no way back on that screen, so nothing is hidden there.
    await page.goto('/display?screen=cal-1');
    await expect(page.getByText('BINS OUT').first()).toBeVisible();
    await expect(page.getByTestId('calendar-key-open')).toHaveCount(0);
  });

  test('changes a calendar\'s colour: shown at once, saved once when the sheet closes', async ({ page, request }) => {
    const saves: string[] = [];
    page.on('request', (req) => { if (req.url().includes('/api/calendar/appearance')) saves.push(req.postData() ?? ''); });
    await openWall(page, request, [month({ monthMaxEventsPerCell: 5 })], (config) => {
      config.settings.calendar.swatches = ['#14532d', '#166534', '#15803d', '#16a34a', '#1e3a8a', '#1d4ed8', '#2563eb', '#60a5fa'];
    });
    const key = page.getByTestId('calendar-key-open');
    await key.click();
    const family = page.getByTestId('wall-calendar-row').filter({ hasText: 'Family' });
    await family.getByRole('button', { name: 'Color for Family' }).click();
    const colours = family.getByTestId('wall-calendar-colors').getByRole('button');
    // The household's own eight, from Settings.
    await expect(colours).toHaveCount(8);
    await expect(colours.first()).toHaveAccessibleName('#14532d');

    // Its colours open on their own, with the wall showing behind; the other calendars fold away.
    await expect(page.getByTestId('wall-calendar-row')).toHaveCount(1);
    await page.getByTestId('wall-calendars-all').click();
    await expect(page.getByTestId('wall-calendar-row')).toHaveCount(2);
    await family.getByRole('button', { name: 'Color for Family' }).click();

    await colours.nth(0).click();
    await colours.nth(4).click();
    // On the wall straight away, behind the sheet, with nothing saved yet.
    await expect(key.locator('[data-legend-kind="source"]', { hasText: 'Family' }).locator('span').first()).toHaveCSS('background-color', 'rgb(30, 58, 138)');
    expect(saves).toEqual([]);

    await page.getByTestId('wall-calendars-done').click();
    await expect.poll(() => saves).toEqual([JSON.stringify({ sourceIds: ['family'], color: '#1e3a8a' })]);
    // A calendar link keeps its colour on the link, where Settings shows it.
    await expect.poll(async () => (await getConfig(request)).settings.calendar.icalSources.find((s) => s.id === 'family')?.color).toBe('#1e3a8a');
    expect((await getConfig(request)).settings.calendar.calendarOverrides).toBeUndefined();
  });

  test('the key stays plain words in the editor\'s preview, and hides nothing there', async ({ page, request }) => {
    await page.addInitScript(() => localStorage.setItem('hs.calendar.hiddenSources', JSON.stringify(['chores'])));
    await openWall(page, request, [month({ monthMaxEventsPerCell: 5 })], undefined, '/display?screen=cal-0&preview=1');
    await expect(page.getByTestId('calendar-key-open')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Calendar sources' })).toContainText('Chores');
    await expect(page.getByText('BINS OUT').first()).toBeVisible();
  });

  test('the family\'s calendar order decides the key and which events keep a full day\'s rows', async ({ page, request }) => {
    await openWall(page, request, [month()], (config) => { config.settings.calendar.calendarOrder = ['family', 'chores']; });
    const rows = page.getByTestId('calendar-key-open').locator('[data-legend-kind="source"]');
    await expect(rows).toHaveText(['Family', 'Chores']);
    // One row a day: the later Family event keeps it, the earlier chores go to "+2 more".
    const cell = page.locator('[data-event-id="f1"]').locator('..');
    await expect(cell.locator('.fsc-event-block')).toHaveText(['PIANO LESSON']);
    await expect(cell).toContainText('+2 more');
  });

  test('the rows a full day keeps still read in time order', async ({ page, request }) => {
    await openWall(page, request, [month({ monthMaxEventsPerCell: 2 })], (config) => { config.settings.calendar.calendarOrder = ['family', 'chores']; });
    // Family's 4 PM keeps a row and so does the first of the chores, which is drawn above it: it is earlier.
    const cell = page.locator('[data-event-id="f1"]').locator('..');
    await expect(cell.locator('.fsc-event-block')).toHaveText(['BINS OUT', 'PIANO LESSON']);
    await expect(cell).toContainText('+1 more');
  });

  test('the small Calendar card opens the same sheet and keeps a full grid day by the same order', async ({ page, request }) => {
    const card = buildModuleInstance('calendar', { viewMode: 'week', gridMaxEventsPerCell: 2, showLegend: 'header' });
    card.size = { w: 960, h: 900 };
    await openWall(page, request, [card], (config) => { config.settings.calendar.calendarOrder = ['family', 'chores']; });
    const mod = page.locator(`[data-module-id="${card.id}"]`);
    // Two rows: Family's, and the earliest chore above it. The later chore is the one that goes.
    await expect(mod.getByText('BINS OUT')).toBeVisible();
    await expect(mod.getByText('PIANO LESSON')).toBeVisible();
    await expect(mod.getByText('WATER PLANTS')).toHaveCount(0);
    const titles = await mod.getByText(/PIANO LESSON|BINS OUT/).allTextContents();
    expect(titles).toEqual(['BINS OUT', 'PIANO LESSON']);

    const key = mod.getByTestId('calendar-key-open');
    expect((await key.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // On the Calendars pill, at the far end of a strip as wide as the card: a
    // strip that shrank under the finger would slide out from under this tap.
    await key.getByText('Calendars', { exact: true }).click();
    await page.getByRole('switch', { name: 'Show Family' }).click();
    await expect(mod.getByText('PIANO LESSON')).toHaveCount(0);
  });
});

/** Twelve calendars, each with one event today: more than a landscape wall has room to list. */
const MANY = Array.from({ length: 12 }, (_, index) => ({ id: `cal-${index}`, name: `Calendar number ${String(index + 1).padStart(2, '0')}` }));

test.describe('a household with many calendars, on a landscape wall', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('the list scrolls between the title and Done, which stays in reach, and Escape closes', async ({ page, request }) => {
    await stubModuleData(page, { overrides: { calendar: MANY.map((cal, index) => ({ ...EVENTS[0], id: `e-${index}`, title: `EVENT ${index}`, sourceId: cal.id, sourceName: cal.name })) } });
    const config = baseConfig({ screens: [makeScreen('many', 'Many', [month({ monthMaxEventsPerCell: 5 })])] });
    config.settings.displayWidth = 1920;
    config.settings.displayHeight = 1080;
    config.settings.calendar.icalSources = MANY.map((cal) => ({ ...cal, color: '#3b82f6', type: 'ical' as const, url: `https://example.com/${cal.id}.ics`, enabled: true }));
    await putConfig(request, config);
    await page.goto('/display');
    await page.getByTestId('calendar-key-open').getByText('Calendars', { exact: true }).click();

    const done = page.getByTestId('wall-calendars-done');
    await expect(done).toBeInViewport({ ratio: 1 });
    const list = page.getByTestId('wall-calendars-list');
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    // In a steady order, by name, whatever order their events come in.
    await expect(page.getByTestId('wall-calendar-row').first()).toContainText('Calendar number 01');
    await page.getByTestId('wall-calendar-row').last().scrollIntoViewIfNeeded();
    await expect(page.getByTestId('wall-calendar-row').last()).toContainText('Calendar number 12');
    await expect(done).toBeInViewport({ ratio: 1 });

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('wall-calendars-sheet')).toHaveCount(0);
  });
});

test.describe('a key at the foot of the screen', () => {
  test.use({ viewport: { width: 1080, height: 1920 } });

  test('keeps its words and its pill above the screen dots', async ({ page, request }) => {
    // Two screens, so the dots are there.
    await openWall(page, request, [month({ showLegend: 'footer', monthMaxEventsPerCell: 5 }), month({ id: 'second', showLegend: 'off' })], undefined, '/display?screen=cal-0');
    const dots = (await page.getByRole('button', { name: /Go to screen 2/ }).boundingBox())!;
    const key = page.getByTestId('calendar-key-open');
    const pill = (await key.getByText('Calendars', { exact: true }).boundingBox())!;
    const lastRow = (await key.locator('[data-legend-kind="source"]').last().boundingBox())!;
    expect(pill.y + pill.height).toBeLessThanOrEqual(dots.y);
    expect(lastRow.y + lastRow.height).toBeLessThanOrEqual(dots.y);
  });
});
