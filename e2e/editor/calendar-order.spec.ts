import { test, expect } from '../fixtures';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig } from '../helpers/config-fixtures';

/**
 * Settings > Calendar > Calendar order: one list across every kind of
 * calendar, dragged into the order a full day should keep them, and a way
 * back to plain time order.
 */
test('the calendars are dragged into an order, and one button goes back to time order', async ({ page, request }) => {
  const config = baseConfig();
  config.settings.calendar.icalSources = ['Chores', 'School', 'Family'].map((name) => (
    { id: name.toLowerCase(), name, type: 'ical' as const, url: `https://example.com/${name}.ics`, color: '#60a5fa', enabled: true }
  ));
  await putConfig(request, config);
  await page.goto('/editor/settings?section=defaults&page=calendar');

  const area = page.getByTestId('calendar-area-ordering');
  const rows = area.getByTestId('calendar-order-row');
  await expect(rows).toHaveText(['Chores', 'School', 'Family']);
  // Nothing chosen yet, so nothing to go back from.
  await expect(area.getByTestId('calendar-order-reset')).toHaveCount(0);

  // The page above this list is still settling as it loads (each calendar's
  // health line, the Google block), which moves the list under a slow drag.
  // So measure and drag again until the drop lands.
  await expect(async () => {
    const grip = area.getByRole('button', { name: 'Move Family' });
    await grip.scrollIntoViewIfNeeded();
    const from = (await grip.boundingBox())!;
    const to = (await area.getByRole('button', { name: 'Move Chores' }).boundingBox())!;
    // PointerSensor activates after 5px of travel; past the first row's
    // midpoint closestCenter picks it.
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 12, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + 2, { steps: 12 });
    await page.mouse.up();
    await expect(rows).toHaveText(['Family', 'Chores', 'School'], { timeout: 2000 });
  }).toPass();

  await expect.poll(async () => (await getConfig(request)).settings.calendar.calendarOrder).toEqual(['family', 'chores', 'school']);

  await area.getByTestId('calendar-order-reset').click();
  await expect.poll(async () => (await getConfig(request)).settings.calendar.calendarOrder).toBeUndefined();
  await expect(rows).toHaveText(['Chores', 'School', 'Family']);
});
