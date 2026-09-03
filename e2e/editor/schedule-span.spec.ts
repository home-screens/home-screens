import { test, expect } from '../fixtures';
import { getConfig } from '../helpers/api';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { autosaved, selectModule } from '../helpers/editor';

/**
 * Spans longer than a day (`ModuleSchedule.endDayOffset`).
 *
 * Repeating a daily window is not the same as one long stretch: "Monday 08:00
 * until Thursday 20:00" written as four daily windows goes dark every night.
 * These drive the two ways a user reaches a real span, the keyboard select and
 * dragging the strip's end onto a lower row, and check the strip draws one
 * unbroken run either way.
 */

const openSchedule = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await expect(page.getByTestId('schedule-week-strip')).toBeVisible();
};

const bandsOn = (page: import('@playwright/test').Page, day: number) =>
  page.getByTestId(`schedule-track-${day}`).getByTestId('schedule-band');

test('a Monday to Thursday span draws as one unbroken run', async ({ page, request }) => {
  const mod = buildModuleInstance('clock');
  mod.schedule = { daysOfWeek: [1], startTime: '08:00', endTime: '20:00', endDayOffset: 3 };
  await selectModule(page, request, mod);
  await openSchedule(page);

  // Exactly one lit run on each of Mon-Thu, and nothing on Fri, Sat or Sun.
  for (const day of [1, 2, 3, 4]) await expect(bandsOn(page, day)).toHaveCount(1);
  for (const day of [5, 6, 0]) await expect(bandsOn(page, day)).toHaveCount(0);

  // Only Monday is picked; the other three rows are lit by the span reaching
  // into them, which is the distinction the old day chips could not show.
  await expect(page.getByTestId('schedule-day-1')).toHaveAttribute('aria-checked', 'true');
  for (const day of [2, 3, 4]) {
    await expect(page.getByTestId(`schedule-day-${day}`)).toHaveAttribute('aria-checked', 'false');
  }

  // Tuesday and Wednesday run the full width; the run never goes dark overnight.
  for (const day of [2, 3]) {
    const box = await bandsOn(page, day).boundingBox();
    const track = await page.getByTestId(`schedule-track-${day}`).boundingBox();
    expect(box!.width).toBeCloseTo(track!.width, 0);
  }

  await expect(page.getByTestId('schedule-week-strip')).toHaveScreenshot('span-mon-to-thu.png');
});

test('a span names the weekday it ends on, not a number of days', async ({ page, request }) => {
  const mod = buildModuleInstance('clock');
  mod.schedule = { daysOfWeek: [1], startTime: '08:00', endTime: '20:00', endDayOffset: 3 };
  await selectModule(page, request, mod);
  await openSchedule(page);

  await expect(page.getByTestId('schedule-shape')).toHaveValue('span');
  // Starting Monday with an offset of 3, the end select reads "Thursday".
  const select = page.getByTestId('schedule-end-day-offset');
  await expect(select).toHaveValue('3');
  await expect(select.locator('option:checked')).toHaveText('Thursday');

  await autosaved(page, async () => {
    await select.selectOption({ label: 'Saturday' });
  });
  expect((await getConfig(request)).screens[0].modules[0].schedule?.endDayOffset).toBe(5);
  for (const day of [1, 2, 3, 4, 5, 6]) await expect(bandsOn(page, day)).toHaveCount(1);
  await expect(bandsOn(page, 0)).toHaveCount(0);
});

test('a repeating schedule offers no span control at all', async ({ page, request }) => {
  const mod = buildModuleInstance('clock');
  mod.schedule = { daysOfWeek: [1, 2], startTime: '08:00', endTime: '20:00' };
  await selectModule(page, request, mod);
  await openSchedule(page);

  await expect(page.getByTestId('schedule-shape')).toHaveValue('repeat');
  await expect(page.getByTestId('schedule-end-day-offset')).toHaveCount(0);
});

test('switching to one stretch keeps a single start day, and back again drops the span', async ({ page, request }) => {
  const mod = buildModuleInstance('clock');
  mod.schedule = { daysOfWeek: [1, 2, 3], startTime: '08:00', endTime: '19:00' };
  await selectModule(page, request, mod);
  await openSchedule(page);

  await autosaved(page, async () => {
    await page.getByTestId('schedule-shape').selectOption('span');
  });
  let saved = (await getConfig(request)).screens[0].modules[0].schedule;
  // Collapsed to the first picked day, with a span that actually spans.
  expect(saved?.daysOfWeek).toEqual([1]);
  expect(saved?.endDayOffset).toBe(1);

  // Chips are now radios: picking one replaces the start day rather than adding.
  await autosaved(page, async () => {
    await page.getByRole('radio', { name: 'Thursday', exact: true }).click();
  });
  saved = (await getConfig(request)).screens[0].modules[0].schedule;
  expect(saved?.daysOfWeek).toEqual([4]);

  await autosaved(page, async () => {
    await page.getByTestId('schedule-shape').selectOption('repeat');
  });
  saved = (await getConfig(request)).screens[0].modules[0].schedule;
  expect(saved?.endDayOffset).toBeUndefined();
  await expect(page.getByRole('switch', { name: 'Thursday', exact: true })).toBeVisible();
});

test('dragging a stretch end onto a lower row extends it across days', async ({ page, request }) => {
  const mod = buildModuleInstance('clock');
  // A span of one day to begin with, so the drag has somewhere to go.
  mod.schedule = { daysOfWeek: [1], startTime: '08:00', endTime: '20:00', endDayOffset: 1 };
  await selectModule(page, request, mod);
  await openSchedule(page);

  await expect(bandsOn(page, 1)).toHaveCount(1);
  await expect(bandsOn(page, 3)).toHaveCount(0);

  // The span already reaches Tuesday, so that is where its end grip sits.
  // hover() first: it waits for the accordion's open animation to settle, and
  // a box measured while the panel is still moving points at empty space.
  const grip = page.getByTestId('schedule-track-2').getByTestId('schedule-grip-end');
  await grip.hover();
  const wed = (await page.getByTestId('schedule-track-3').boundingBox())!;

  await autosaved(page, async () => {
    await page.mouse.down();
    // Move in steps so the pointermove handler runs more than once.
    await page.mouse.move(wed.x + wed.width * 0.5, wed.y + wed.height / 2, { steps: 8 });
    await page.mouse.up();
  });

  const saved = (await getConfig(request)).screens[0].modules[0].schedule;
  expect(saved?.endDayOffset).toBe(2);
  expect(saved?.endTime).toBe('12:00');
  // Monday, Tuesday and Wednesday now carry one continuous stretch.
  for (const day of [1, 2, 3]) await expect(bandsOn(page, day)).toHaveCount(1);
  await expect(bandsOn(page, 4)).toHaveCount(0);
});

/**
 * Reported from the editor: three days picked with a four-day span, then a
 * nudge of the last grip filled the whole week. Overlapping windows are what
 * made that possible, and splitting the two shapes makes them unreachable. A
 * repeating window can never exceed 24 hours, so no two picked days can light
 * the same hour however hard the end is dragged.
 */
test('a repeating window cannot be dragged long enough to overlap the next day', async ({ page, request }) => {
  const mod = buildModuleInstance('clock');
  mod.schedule = { daysOfWeek: [0, 1, 2], startTime: '08:00', endTime: '19:00' };
  await selectModule(page, request, mod);
  await openSchedule(page);

  // Three windows, one per picked day, and nothing anywhere else.
  for (const day of [0, 1, 2]) await expect(bandsOn(page, day)).toHaveCount(1);
  for (const day of [3, 4, 5, 6]) await expect(bandsOn(page, day)).toHaveCount(0);

  // Haul Sunday's end far down the strip, towards Thursday.
  const grip = page.getByTestId('schedule-track-0').getByTestId('schedule-grip-end');
  await grip.hover();
  const thu = (await page.getByTestId('schedule-track-4').boundingBox())!;
  await autosaved(page, async () => {
    await page.mouse.down();
    await page.mouse.move(thu.x + thu.width * 0.5, thu.y + thu.height / 2, { steps: 8 });
    await page.mouse.up();
  });

  const saved = (await getConfig(request)).screens[0].modules[0].schedule;
  // Clamped at 24 hours from its own start, and still a repeating window.
  expect(saved?.endTime).toBe('08:00');
  expect(saved?.endDayOffset).toBeUndefined();
  expect(saved?.daysOfWeek).toEqual([0, 1, 2]);
  // Wednesday onwards stays dark: no run of the week.
  for (const day of [4, 5, 6]) await expect(bandsOn(page, day)).toHaveCount(0);
});

/**
 * Reported from the editor: with "Hide during these hours" on, the lit rows are
 * the complement of the picked window, so the solid bands are not the thing the
 * times describe. Putting drag handles on them made a one-minute complement
 * sliver look like a stray slider, and dragging one would have edited a window
 * the pointer was nowhere near.
 */
test('an inverted schedule outlines the window it hides and drags only that', async ({ page, request }) => {
  const mod = buildModuleInstance('clock');
  mod.schedule = { daysOfWeek: [0], startTime: '00:00', endTime: '20:00', endDayOffset: 1, invert: true };
  await selectModule(page, request, mod);
  await openSchedule(page);

  const strip = page.getByTestId('schedule-week-strip');
  const windowOn = (day: number) =>
    page.getByTestId(`schedule-track-${day}`).getByTestId('schedule-window');

  // Sunday and Monday hold the hidden window, drawn as an outline.
  await expect(windowOn(0)).toHaveCount(1);
  await expect(windowOn(1)).toHaveCount(1);
  await expect(windowOn(3)).toHaveCount(0);
  // Sunday is picked yet dark, which is exactly what the outline explains.
  await expect(strip.getByTestId('schedule-day-0')).toHaveAttribute('aria-checked', 'true');
  await expect(bandsOn(page, 0)).toHaveCount(0);
  // The module is on from Monday evening through Saturday.
  for (const day of [2, 3, 4, 5, 6]) await expect(bandsOn(page, day)).toHaveCount(1);

  // Every handle belongs to the outlined window, never to a solid band.
  await expect(strip.getByTestId('schedule-band').locator('[data-testid^="schedule-grip"]'))
    .toHaveCount(0);
  await expect(strip.locator('[data-testid^="schedule-grip"]')).toHaveCount(2);

  // Dragging the outline's end still edits the window it is drawn on.
  const grip = page.getByTestId('schedule-track-1').getByTestId('schedule-grip-end');
  await grip.hover();
  const mon = (await page.getByTestId('schedule-track-1').boundingBox())!;
  await autosaved(page, async () => {
    await page.mouse.down();
    await page.mouse.move(mon.x + mon.width * (12 / 24), mon.y + mon.height / 2, { steps: 6 });
    await page.mouse.up();
  });
  const saved = (await getConfig(request)).screens[0].modules[0].schedule;
  expect(saved?.endTime).toBe('12:00');
  expect(saved?.endDayOffset).toBe(1);
  expect(saved?.invert).toBe(true);
});

test('a stretch end cannot be dragged back before its own start', async ({ page, request }) => {
  const mod = buildModuleInstance('clock');
  mod.schedule = { daysOfWeek: [1], startTime: '12:00', endTime: '20:00' };
  await selectModule(page, request, mod);
  await openSchedule(page);

  const grip = page.getByTestId('schedule-track-1').getByTestId('schedule-grip-end');
  await grip.hover();
  const track = (await page.getByTestId('schedule-track-1').boundingBox())!;

  await autosaved(page, async () => {
    await page.mouse.down();
    // Aim at 04:00, well before the 12:00 start, on the same row.
    await page.mouse.move(track.x + track.width * (4 / 24), track.y + track.height / 2, { steps: 6 });
    await page.mouse.up();
  });

  const saved = (await getConfig(request)).screens[0].modules[0].schedule;
  // Clamped to one snap step past the start rather than inverting the band.
  // A repeating window writes no offset; it has none to write.
  expect(saved?.endTime).toBe('12:15');
  expect(saved?.endDayOffset).toBeUndefined();
  await expect(bandsOn(page, 1)).toHaveCount(1);
});
