import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { putConfig, seedDayNotes, seedNotes } from '../helpers/api';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';

/**
 * /remote Notes tab, Calendar page: the calendar's day notes in
 * data/day-notes.json, driven through the real page. What a write does to
 * the store (the cap, past days, the sweep) is covered by the unit tests
 * beside src/lib/day-notes.ts and the route tests; these prove each phone
 * gesture reaches the store every calendar reads. The sandbox sets no
 * household zone, so the hub's today is this machine's.
 */

function isoIn(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** What the hub holds, as day and words (ids are the hub's own). */
async function stored(request: APIRequestContext): Promise<Array<{ date: string; text: string }>> {
  const res = await request.get('/api/day-notes');
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { notes: Array<{ date: string; text: string }> }).notes.map(({ date, text }) => ({ date, text }));
}

async function openCalendarPage(page: Page) {
  await page.goto('/remote?tab=notes');
  await page.getByTestId('notes-page-calendar').click();
  await expect(page.getByTestId('day-notes-page')).toBeVisible();
}

const day = (page: Page, offset: number) => page.locator(`[data-testid="day-notes-day"][data-date="${isoIn(offset)}"]`);
const sheet = (page: Page) => page.getByTestId('day-note-sheet');

async function useScreens(request: APIRequestContext, modules: Parameters<typeof makeScreen>[2]) {
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', modules)], settings: matrixSettings() }));
}

test.beforeEach(async ({ request, sandboxDir }) => {
  await useScreens(request, [buildModuleInstance('notes'), buildModuleInstance('calendar')]);
  seedNotes(sandboxDir, { notes: [] });
  seedDayNotes(sandboxDir, {});
});
// Later specs in this worker may draw calendars; leave no note behind.
test.afterEach(({ sandboxDir }) => seedDayNotes(sandboxDir, {}));

test('the Notes tab has a Board and a Calendar page, and the Calendar page lists seven days from today', async ({ page }) => {
  await page.goto('/remote?tab=notes');
  await expect(page.getByTestId('notes-page-board')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('notes-add-input')).toBeVisible();

  await page.getByTestId('notes-page-calendar').click();
  await expect(page.getByTestId('notes-page-calendar')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('day-notes-day')).toHaveCount(7);
  await expect(day(page, 0)).toContainText('Today');
  await expect(day(page, 6)).toBeVisible();
  await expect(day(page, -1)).toHaveCount(0);
  await expect(page.getByText('Next 7 days')).toBeVisible();
  // The board's write bar belongs to the Board page only.
  await expect(page.getByTestId('notes-add-input')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Previous week' })).toBeDisabled();
});

test('tapping an empty day opens the box ready to type, and writes a note for it', async ({ page, request }) => {
  await openCalendarPage(page);
  await day(page, 2).getByTestId('day-notes-add').click();
  await expect(sheet(page)).toBeVisible();
  const box = sheet(page).getByTestId('day-note-sheet-text');
  await expect(box).toBeFocused();
  const submit = sheet(page).getByTestId('day-note-sheet-submit');
  await expect(submit).toHaveText('Put it on the calendar');
  await expect(submit).toBeDisabled();
  // Only spaces: nothing to save, and the counter says so.
  await box.fill('   ');
  await expect(sheet(page).getByText('0 / 60')).toBeVisible();
  await expect(submit).toBeDisabled();
  await box.fill('  Picture   day ');
  await submit.click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(day(page, 2).getByTestId('day-notes-note')).toHaveText('Picture day');
  await expect.poll(() => stored(request)).toEqual([{ date: isoIn(2), text: 'Picture day' }]);
});

test('the box wraps long words, counts an emoji as one and says when it is full', async ({ page }) => {
  await openCalendarPage(page);
  await day(page, 1).getByTestId('day-notes-add').click();
  const box = sheet(page).getByTestId('day-note-sheet-text');
  await box.fill(`Field trip 🚌 ${'x'.repeat(47)}`);
  await expect(sheet(page).getByText('60 / 60')).toBeVisible();
  await expect(sheet(page).getByText("That's as long as a day note can be.")).toBeVisible();
  await box.press('End');
  await box.pressSequentially('more');
  await expect(box).toHaveValue(`Field trip 🚌 ${'x'.repeat(47)}`);
  expect(await box.evaluate((el) => el.tagName)).toBe('TEXTAREA');
});

test('a day takes up to three notes, each its own row', async ({ page, request }) => {
  await openCalendarPage(page);
  for (const [i, text] of ['Pajama day', 'Library books', 'Bring boots'].entries()) {
    const add = day(page, 1).getByTestId('day-notes-add');
    await expect(add).toHaveText(i === 0 ? 'Add a note for this day' : 'Add another note');
    await add.click();
    await sheet(page).getByTestId('day-note-sheet-text').fill(text);
    await sheet(page).getByTestId('day-note-sheet-submit').click();
    await expect(sheet(page)).toHaveCount(0);
  }
  await expect(day(page, 1).getByTestId('day-notes-note')).toHaveText(['Pajama day', 'Library books', 'Bring boots']);
  await expect(day(page, 1).getByTestId('day-notes-add')).toHaveCount(0);
  await expect.poll(() => stored(request)).toEqual(
    ['Pajama day', 'Library books', 'Bring boots'].map((text) => ({ date: isoIn(1), text })),
  );
});

test('a note can be changed without touching the others, removed, and put back with Undo', async ({ page, request, sandboxDir }) => {
  seedDayNotes(sandboxDir, { 1: ['Pajama day', 'Library books'] });
  await openCalendarPage(page);
  const notes = day(page, 1).getByTestId('day-notes-note');
  await expect(notes).toHaveText(['Pajama day', 'Library books']);

  await notes.first().click();
  await sheet(page).getByTestId('day-note-sheet-text').fill('Pajama day, wear red');
  await sheet(page).getByTestId('day-note-sheet-submit').click();
  await expect(notes).toHaveText(['Pajama day, wear red', 'Library books']);
  await expect.poll(() => stored(request)).toEqual([
    { date: isoIn(1), text: 'Pajama day, wear red' },
    { date: isoIn(1), text: 'Library books' },
  ]);

  await notes.first().click();
  await sheet(page).getByTestId('day-note-sheet-remove').click();
  await expect(notes).toHaveText(['Library books']);
  await expect.poll(() => stored(request)).toEqual([{ date: isoIn(1), text: 'Library books' }]);

  await page.getByTestId('remote-toast-action').click();
  await expect(notes).toHaveText(['Library books', 'Pajama day, wear red']);
  await expect.poll(() => stored(request)).toEqual([
    { date: isoIn(1), text: 'Library books' },
    { date: isoIn(1), text: 'Pajama day, wear red' },
  ]);
});

test('closing the sheet without saving keeps the words for that day', async ({ page, request }) => {
  await openCalendarPage(page);
  await day(page, 3).getByTestId('day-notes-add').click();
  await sheet(page).getByTestId('day-note-sheet-text').fill('Swim bag');
  await sheet(page).getByTestId('sheet-close').click();
  await expect(sheet(page)).toHaveCount(0);
  expect(await stored(request)).toEqual([]);

  await day(page, 3).getByTestId('day-notes-add').click();
  await expect(sheet(page).getByTestId('day-note-sheet-text')).toHaveValue('Swim bag');
  // Another day starts empty.
  await sheet(page).getByTestId('sheet-close').click();
  await day(page, 4).getByTestId('day-notes-add').click();
  await expect(sheet(page).getByTestId('day-note-sheet-text')).toHaveValue('');
});

test('the arrows stay put while they page seven days at a time, and Today comes back', async ({ page }) => {
  await openCalendarPage(page);
  const next = page.getByRole('button', { name: 'Next week' });
  const before = await next.boundingBox();
  await next.click();
  await expect(day(page, 7)).toBeVisible();
  await expect(day(page, 0)).toHaveCount(0);
  await expect(page.getByText('Next 7 days')).toHaveCount(0);
  // A second tap in the same spot goes on, not back to this week.
  expect(await next.boundingBox()).toEqual(before);
  await page.mouse.click(before!.x + before!.width / 2, before!.y + before!.height / 2);
  await expect(day(page, 14)).toBeVisible();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(day(page, 0)).toBeVisible();
});

test('the board points the way to the Calendar page', async ({ page }) => {
  await page.goto('/remote?tab=notes');
  await page.getByTestId('notes-to-calendar').click();
  await expect(page.getByTestId('notes-page-calendar')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('day-notes-page')).toBeVisible();
});

test('with only a calendar on the screens, the tab opens on the Calendar page', async ({ page, request }) => {
  await useScreens(request, [buildModuleInstance('calendar')]);
  await page.goto('/remote?tab=notes');
  await expect(page.getByTestId('day-notes-page')).toBeVisible();
  await page.getByTestId('notes-page-board').click();
  await expect(page.getByText('No notes board yet')).toBeVisible();
});

test('when no calendar shows day notes, the Calendar page says how to get one', async ({ page, request }) => {
  await useScreens(request, [buildModuleInstance('notes'), buildModuleInstance('calendar', { showDayNotes: false })]);
  await page.goto('/remote?tab=notes');
  await page.getByTestId('notes-page-calendar').click();
  await expect(page.getByText('No calendar shows day notes yet')).toBeVisible();
  await expect(page.getByTestId('day-notes-page')).toHaveCount(0);
});
