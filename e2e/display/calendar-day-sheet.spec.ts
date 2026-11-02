import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { putConfig, seedFamily } from '../helpers/api';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
import { stubModuleData } from '../helpers/stubs';
import { DOUBLE_TAP_MS } from '@/lib/sheet-tap-guard';

/**
 * The day sheet: with "Tap an event to see details" on, a grid cell's
 * "+N more", its day number and the rest of the cell open every event of that
 * day, in time order; a row opens that event's detail on top, and closing the
 * detail comes back to the sheet. A double tap leaves the sheet open. With the
 * setting off "+N more" stays plain text.
 */

/** Local YYYY-MM-DD, `offsetDays` from today. */
function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TODAY = localDate();
/** The sheet's accessible name: the whole day, as en-US writes it. */
const TODAY_NAME = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());

/** A busy day (the mockup's Friday), listed out of order so the sheet has to sort it. */
const BUSY_DAY: Array<[string, string, string, string, string, string]> = [
  ['ds-swim', 'Swim lessons', '17:00', '17:45', 'Ben', '#8b5cf6'],
  ['ds-dentist', 'Dentist', '07:30', '08:15', 'Ella', '#eab308'],
  ['ds-soccer', 'Soccer practice', '17:30', '19:00', 'Soccer', '#f59e0b'],
  ['ds-pickup', 'Early pickup', '13:15', '13:45', 'School', '#22c55e'],
  ['ds-date', 'Date night', '19:00', '22:00', 'Dad', '#6366f1'],
  ['ds-piano', 'Piano lesson', '16:00', '16:45', 'Cora', '#14b8a6'],
  ['ds-pizza', 'Pizza night', '18:30', '19:30', 'Family', '#3b82f6'],
];
const IN_TIME_ORDER = ['ds-dentist', 'ds-pickup', 'ds-piano', 'ds-swim', 'ds-soccer', 'ds-pizza', 'ds-date'];

function busyEvents(source?: { id: string; name: string }) {
  return BUSY_DAY.map(([id, title, start, end, cal, color]) => ({
    id,
    title,
    start: `${TODAY}T${start}:00`,
    end: `${TODAY}T${end}:00`,
    allDay: false,
    calendarColor: color,
    sourceId: source?.id ?? `cal-${cal.toLowerCase()}`,
    sourceName: source?.name ?? cal,
    description: 'Bring a water bottle.',
  }));
}

function screen(type: 'calendar' | 'fullscreen-calendar', config: Record<string, unknown>, size?: { w: number; h: number }) {
  const instance = buildModuleInstance(type, config);
  if (size) instance.size = size;
  return baseConfig({ screens: [makeScreen('s1', 'S1', [instance])], settings: matrixSettings() });
}

/** "+N more" as a button, for today's cell. */
function moreButton(mod: Locator): Locator {
  return mod.locator(`button[data-open-day="${TODAY}"]`);
}

/** Today's whole day cell (a finger's way into the day). */
function dayCell(mod: Locator): Locator {
  return mod.locator(`[data-day-cell="${TODAY}"]`);
}

/**
 * A tap on the scrim right after a sheet opens is taken as the second half of
 * the tap that opened it and ignored; a deliberate one comes later.
 */
async function tapScrim(page: Page, sheet: Locator) {
  await page.waitForTimeout(DOUBLE_TAP_MS);
  await sheet.click({ position: { x: 10, y: 10 } });
}

/**
 * Taps a spot of the cell that is neither an event nor the cell's own day
 * button or "+N more": the blank room a finger lands on.
 */
async function tapCellOutsideEvents(cell: Locator) {
  const point = await cell.evaluate((el) => {
    const r = el.getBoundingClientRect();
    for (let y = r.bottom - 2; y > r.top; y -= 3) {
      for (const x of [r.left + r.width / 2, r.right - 4, r.left + 4]) {
        const hit = document.elementFromPoint(x, y);
        if (hit && el.contains(hit) && !hit.closest('[data-event-id], [data-open-day]')) return { x: x - r.left, y: y - r.top };
      }
    }
    return null;
  });
  if (!point) throw new Error('no blank spot in the day cell');
  await cell.click({ position: point });
}

/** The day sheet for today. */
function daySheet(page: Page): Locator {
  return page.getByRole('dialog', { name: TODAY_NAME });
}

/** Opens a row's detail, closes it back to the sheet, then closes the sheet. */
async function rowToDetailAndBack(page: Page, sheet: Locator) {
  await sheet.locator('[data-day-sheet-row="ds-pizza"]').click();
  const detail = page.getByRole('dialog', { name: 'Pizza night' });
  await expect(detail).toBeVisible();
  await expect(detail.getByText('Bring a water bottle.')).toBeVisible();
  await detail.getByRole('button', { name: 'Close' }).click();
  await expect(detail).toBeHidden();
  // Back on the day sheet, which stayed open under the detail.
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(sheet).toBeHidden();
}

async function expectWholeDay(sheet: Locator) {
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('7 events');
  await expect(sheet.locator('[data-day-sheet-row]')).toHaveCount(7);
  const ids = await sheet.locator('[data-day-sheet-row]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-day-sheet-row')));
  expect(ids).toEqual(IN_TIME_ORDER);
  // Time, "to" its end, title and calendar on each row.
  const dentist = sheet.locator('[data-day-sheet-row="ds-dentist"]');
  await expect(dentist).toContainText('7:30 AM');
  await expect(dentist).toContainText('to 8:15 AM');
  await expect(dentist).toContainText('Dentist');
  await expect(dentist).toContainText('Ella');
}

test.describe('small Calendar module', () => {
  for (const [label, config] of [
    ['month, banner look', { viewMode: 'month', gridTheme: 'banner' }],
    ['month, clean look', { viewMode: 'month', gridTheme: 'clean' }],
    ['multi-week', { viewMode: 'multi-week', weeksToShow: 2 }],
    ['week', { viewMode: 'week' }],
  ] as const) {
    test(`${label}: "+N more" opens the whole day, a row opens its detail and comes back`, async ({ page, request }) => {
      await stubModuleData(page, { overrides: { calendar: busyEvents() } });
      const display = await renderOnDisplay(page, request, screen('calendar', { ...config, eventTapDetails: true, gridMaxEventsPerCell: 2 }, { w: 760, h: 720 }));
      const mod = display.module('calendar');

      const more = moreButton(mod);
      await expect(more).toHaveText('+5 more');
      await more.click();
      const sheet = daySheet(page);
      await expectWholeDay(sheet);
      await expect(sheet.locator('[data-day-sheet-style="sheet"]')).toBeVisible();
      await rowToDetailAndBack(page, sheet);

      // The day itself opens the same sheet.
      await mod.locator(`[role="button"][data-open-day="${TODAY}"]`).click();
      await expect(sheet).toBeVisible();
      await expect(sheet.locator('[data-day-sheet-row]')).toHaveCount(7);
      // The scrim closes it (the sheet leaves the top of the screen uncovered).
      await tapScrim(page, sheet);
      await expect(sheet).toBeHidden();

      // So does the rest of the cell, below its events.
      await tapCellOutsideEvents(dayCell(mod));
      await expect(sheet.locator('[data-day-sheet-row]')).toHaveCount(7);
      await sheet.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(sheet).toBeHidden();

      // An event in the cell still opens its own detail, not the day.
      await dayCell(mod).locator('[data-event-id="ds-dentist"]').click();
      const detail = page.getByRole('dialog', { name: 'Dentist' });
      await expect(detail).toBeVisible();
      await expect(sheet).toBeHidden();
      await detail.getByRole('button', { name: 'Close' }).click();
      await expect(detail).toBeHidden();

      // A double tap on "+N more" opens the day and leaves it open.
      await moreButton(mod).dblclick();
      await expect(sheet).toBeVisible();
      await page.waitForTimeout(DOUBLE_TAP_MS);
      await expect(sheet).toBeVisible();
    });
  }

  test('a double tap on an event leaves its detail open', async ({ page, request }) => {
    await stubModuleData(page, { overrides: { calendar: busyEvents() } });
    const display = await renderOnDisplay(page, request, screen('calendar', { viewMode: 'week', eventTapDetails: true, gridMaxEventsPerCell: 2 }, { w: 760, h: 720 }));

    await display.module('calendar').locator('[data-event-id="ds-dentist"]').dblclick();
    const detail = page.getByRole('dialog', { name: 'Dentist' });
    await expect(detail).toBeVisible();
    await page.waitForTimeout(DOUBLE_TAP_MS);
    await expect(detail).toBeVisible();
    // A deliberate tap on the scrim still closes it.
    await tapScrim(page, detail);
    await expect(detail).toBeHidden();
  });

  test('with taps off, "+N more" stays plain text and nothing opens', async ({ page, request }) => {
    await stubModuleData(page, { overrides: { calendar: busyEvents() } });
    const display = await renderOnDisplay(page, request, screen('calendar', { viewMode: 'month', gridMaxEventsPerCell: 2, eventTapDetails: false }, { w: 760, h: 720 }));
    const mod = display.module('calendar');

    await expect(mod.getByText('+5 more')).toBeVisible();
    await expect(mod.locator('button')).toHaveCount(0);
    await expect(mod.locator('[data-open-day]')).toHaveCount(0);
    await expect(mod.locator('[data-day-cell]')).toHaveCount(0);
    await mod.getByText('+5 more').click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('full-screen Calendar', () => {
  test('month grid: "+N more" opens the whole day, a row opens its detail and comes back', async ({ page, request }) => {
    await stubModuleData(page, { overrides: { calendar: busyEvents() } });
    const display = await renderOnDisplay(page, request, screen('fullscreen-calendar', { view: 'month-grid', eventTapDetails: true, monthMaxEventsPerCell: 3 }));
    const mod = display.module('fullscreen-calendar');

    const more = moreButton(mod);
    await expect(more).toHaveText('+4 more');
    await more.click();
    const sheet = daySheet(page);
    await expectWholeDay(sheet);
    await expect(sheet.locator('[data-day-sheet-style="sheet"]')).toBeVisible();
    await rowToDetailAndBack(page, sheet);

    await mod.locator(`[role="button"][data-open-day="${TODAY}"]`).click();
    await expect(sheet.locator('[data-day-sheet-row]')).toHaveCount(7);
    await tapScrim(page, sheet);
    await expect(sheet).toBeHidden();

    // The rest of the cell opens the day; an event in it opens its own detail.
    await tapCellOutsideEvents(dayCell(mod));
    await expect(sheet.locator('[data-day-sheet-row]')).toHaveCount(7);
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await dayCell(mod).locator('[data-event-id="ds-dentist"]').click();
    const detail = page.getByRole('dialog', { name: 'Dentist' });
    await expect(detail).toBeVisible();
    await expect(sheet).toBeHidden();
    await detail.getByRole('button', { name: 'Close' }).click();
    await expect(detail).toBeHidden();
  });

  test('month grid: a double tap opens the day, or an event, and leaves it open', async ({ page, request }) => {
    await stubModuleData(page, { overrides: { calendar: busyEvents() } });
    const display = await renderOnDisplay(page, request, screen('fullscreen-calendar', { view: 'month-grid', eventTapDetails: true, monthMaxEventsPerCell: 3 }));
    const mod = display.module('fullscreen-calendar');

    await moreButton(mod).dblclick();
    const sheet = daySheet(page);
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(DOUBLE_TAP_MS);
    await expect(sheet).toBeVisible();

    await sheet.locator('[data-day-sheet-row="ds-pizza"]').dblclick();
    const detail = page.getByRole('dialog', { name: 'Pizza night' });
    await expect(detail).toBeVisible();
    await page.waitForTimeout(DOUBLE_TAP_MS);
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toBeVisible();
    await tapScrim(page, sheet);
    await expect(sheet).toBeHidden();

    await mod.locator('[data-event-id="ds-dentist"]').first().dblclick();
    const dentist = page.getByRole('dialog', { name: 'Dentist' });
    await expect(dentist).toBeVisible();
    await page.waitForTimeout(DOUBLE_TAP_MS);
    await expect(dentist).toBeVisible();
  });

  test('an event with no length reads as its start alone, in the day sheet and its detail', async ({ page, request }) => {
    const trash = {
      id: 'ds-trash', title: 'Trash out', start: `${TODAY}T21:00:00`, end: `${TODAY}T21:00:00`, allDay: false,
      calendarColor: '#8e24aa', sourceId: 'cal-house', sourceName: 'House',
    };
    await stubModuleData(page, { overrides: { calendar: [...busyEvents(), trash] } });
    const display = await renderOnDisplay(page, request, screen('fullscreen-calendar', { view: 'month-grid', eventTapDetails: true, monthMaxEventsPerCell: 3 }));

    await moreButton(display.module('fullscreen-calendar')).click();
    const sheet = daySheet(page);
    const row = sheet.locator('[data-day-sheet-row="ds-trash"]');
    await expect(row).toContainText('9:00 PM');
    await expect(row).not.toContainText('to 9:00 PM');
    // An event with a length keeps its end.
    await expect(sheet.locator('[data-day-sheet-row="ds-date"]')).toContainText('to 10:00 PM');

    await row.click();
    const detail = page.getByRole('dialog', { name: 'Trash out' });
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('9:00 PM');
    await expect(detail).not.toContainText('9:00 PM – 9:00 PM');
  });

  test('agenda: an event with no length shows no length and no range', async ({ page, request }) => {
    // Tomorrow, so a run after 9 PM does not find it finished and left out.
    const tomorrow = localDate(1);
    const trash = {
      id: 'ag-trash', title: 'Trash out', start: `${tomorrow}T21:00:00`, end: `${tomorrow}T21:00:00`, allDay: false,
      calendarColor: '#8e24aa', sourceId: 'cal-house', sourceName: 'House',
    };
    await stubModuleData(page, { overrides: { calendar: [trash] } });
    const display = await renderOnDisplay(page, request, screen('fullscreen-calendar', { view: 'agenda', eventTapDetails: true }));
    const row = display.module('fullscreen-calendar').locator('[data-event-id="ag-trash"]');
    await expect(row).toContainText('9:00 PM');
    await expect(row).not.toContainText('–');
    await expect(row).toHaveAttribute('aria-label', 'Trash out, 9:00 PM');

    const small = await renderOnDisplay(page, request, screen('calendar', { viewMode: 'agenda', daysToShow: 2 }, { w: 540, h: 400 }));
    const smallRow = small.module('calendar').locator('[data-event-id="ag-trash"]');
    await expect(smallRow).toContainText('9:00 PM');
    await expect(smallRow).not.toContainText('0m');
  });

  test("month grid, 'card' style: the day opens as a centered card", async ({ page, request }) => {
    await stubModuleData(page, { overrides: { calendar: busyEvents() } });
    const display = await renderOnDisplay(page, request, screen('fullscreen-calendar', {
      view: 'month-grid', eventTapDetails: true, eventTapStyle: 'card', monthMaxEventsPerCell: 3,
    }));

    await moreButton(display.module('fullscreen-calendar')).click();
    const sheet = daySheet(page);
    await expect(sheet.locator('[data-day-sheet-style="card"]')).toBeVisible();
    await expect(sheet.locator('[data-day-sheet-row]')).toHaveCount(7);
    // Centered, so the top-left corner is scrim.
    await tapScrim(page, sheet);
    await expect(sheet).toBeHidden();
  });

  test('family grid: a row\'s "+N" lists that person\'s day, the day heading lists everyone\'s', async ({ page, request, sandboxDir }) => {
    seedFamily(sandboxDir, [{ id: 'ava', name: 'Ava', color: '#ec4899' }]);
    const shared = {
      id: 'ds-house', title: 'Recycling', start: TODAY, end: localDate(1), allDay: true,
      calendarColor: '#64748b', sourceId: 'cal-house', sourceName: 'House',
    };
    await stubModuleData(page, { overrides: { calendar: [...busyEvents({ id: 'cal-ava', name: 'Ava' }), shared] } });
    const config = screen('fullscreen-calendar', { view: 'family-grid', eventTapDetails: true, familyShowDescription: true });
    const settings = config.settings as unknown as { calendar: Record<string, unknown> };
    settings.calendar.icalSources = [
      { id: 'cal-ava', name: 'Ava', type: 'ical', url: 'https://example.com/ava.ics', color: '#ec4899', enabled: true },
      { id: 'cal-house', name: 'House', type: 'ical', url: 'https://example.com/house.ics', color: '#64748b', enabled: true },
    ];
    settings.calendar.personSources = { ava: ['cal-ava'] };
    await putConfig(request, config);
    await page.goto('/display');
    const mod = page.locator('[data-module-type="fullscreen-calendar"]');
    await expect(mod.getByRole('rowheader').filter({ hasText: 'Ava' })).toBeVisible();

    await moreButton(mod).click();
    const sheet = daySheet(page);
    await expect(sheet.locator('[data-day-sheet-row]')).toHaveCount(7);
    await expect(sheet.locator('[data-day-sheet-row="ds-house"]')).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(sheet).toBeHidden();

    // The rest of Ava's cell opens her day too.
    const avaCell = mod.locator(`[data-day-cell="${TODAY}"]`).filter({ has: page.locator('[data-event-id="ds-dentist"]') });
    await tapCellOutsideEvents(avaCell);
    await expect(sheet.locator('[data-day-sheet-row]')).toHaveCount(7);
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(sheet).toBeHidden();

    // The column heading gathers every row's events for the day, the shared one first (all day).
    await mod.locator(`[role="columnheader"][data-open-day="${TODAY}"]`).click();
    await expect(sheet.locator('[data-day-sheet-row]')).toHaveCount(8);
    await expect(sheet.locator('[data-day-sheet-row]').first()).toHaveAttribute('data-day-sheet-row', 'ds-house');
    await expect(sheet.locator('[data-day-sheet-row="ds-house"]')).toContainText('All day');
  });

  test('with taps off, "+N more" stays plain text', async ({ page, request }) => {
    await stubModuleData(page, { overrides: { calendar: busyEvents() } });
    const display = await renderOnDisplay(page, request, screen('fullscreen-calendar', { view: 'month-grid', monthMaxEventsPerCell: 3, eventTapDetails: false }));
    const mod = display.module('fullscreen-calendar');

    await expect(mod.getByText('+4 more')).toBeVisible();
    await expect(mod.locator('[data-open-day]')).toHaveCount(0);
    await expect(mod.locator('button')).toHaveCount(0);
    await mod.getByText('+4 more').click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('the sheet closes itself 45 seconds after the last touch, and waits while a detail is open', async ({ page, request }) => {
    await page.clock.install();
    await stubModuleData(page, { overrides: { calendar: busyEvents() } });
    const display = await renderOnDisplay(page, request, screen('fullscreen-calendar', { view: 'month-grid', eventTapDetails: true, monthMaxEventsPerCell: 3 }));

    await moreButton(display.module('fullscreen-calendar')).click();
    const sheet = daySheet(page);
    await expect(sheet).toBeVisible();

    // A touch on the sheet starts the 45 seconds again.
    await page.clock.runFor(30_000);
    await sheet.getByText(/7 events/).click();
    await page.clock.runFor(30_000);
    await expect(sheet).toBeVisible();

    // An open detail holds the sheet; the detail closes on its own clock.
    await sheet.locator('[data-day-sheet-row="ds-dentist"]').click();
    const detail = page.getByRole('dialog', { name: 'Dentist' });
    await expect(detail).toBeVisible();
    await page.clock.runFor(46_000);
    await expect(detail).toBeHidden();
    await expect(sheet).toBeVisible();

    await page.clock.runFor(46_000);
    await expect(sheet).toBeHidden();
  });
});
