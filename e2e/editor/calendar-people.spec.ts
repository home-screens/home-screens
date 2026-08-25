import { test, expect } from '../fixtures';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig } from '../helpers/config-fixtures';
import { autosaved } from '../helpers/editor';

/**
 * Defaults › Calendar — People section (CalendarPeopleManager).
 *
 * The family grid and free time views draw one row per person from
 * `settings.calendar.people`; this is the only place that list is edited.
 * An iCal source is seeded so the person editor has a calendar to pick.
 */

test('Defaults › Calendar: adding a person and picking a calendar persists people', async ({ page, request }) => {
  const config = baseConfig();
  config.settings.calendar.icalSources = [
    { id: 'ical-school', type: 'ical', name: 'School', url: 'https://example.com/school.ics', color: '#3b82f6', enabled: true },
  ];
  await putConfig(request, config);

  await page.goto('/editor/settings?section=defaults&page=calendar');
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();

  await autosaved(page, async () => {
    await page.getByLabel('Name (e.g. Ella)').fill('Ella');
    await page.getByRole('button', { name: '+ Add person' }).click();
  });

  // A new person opens for editing straight away, so the School calendar
  // can be picked without a second click.
  const person = page.locator('[data-person-id]', { hasText: 'Ella' });
  await autosaved(page, async () => {
    await person.locator('label', { hasText: 'School' }).getByRole('checkbox').check();
  });

  await expect
    .poll(async () => {
      const people = (await getConfig(request)).settings.calendar.people ?? [];
      return people.map((p) => `${p.name}:${p.sourceIds.join('|')}`);
    })
    .toEqual(['Ella:ical-school']);

  // Removing the last person drops the field entirely.
  await autosaved(page, async () => {
    await page.getByRole('button', { name: 'Remove Ella' }).click();
  });
  await expect.poll(async () => (await getConfig(request)).settings.calendar.people).toBeUndefined();
});
