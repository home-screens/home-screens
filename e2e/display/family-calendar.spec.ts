import { test, expect } from '../fixtures';
import { putConfig, seedFamily, todayCalendarEvents } from '../helpers/api';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { stubModuleData } from '../helpers/stubs';

test('family calendar waits for its roster and omits household members without calendars', async ({ page, request, sandboxDir }) => {
  seedFamily(sandboxDir, [
    { id: 'alex', name: 'Alex', color: '#60a5fa' },
    { id: 'sam', name: 'Sam', color: '#fbbf24' },
  ]);
  const events = todayCalendarEvents();
  const stub = await stubModuleData(page, { overrides: { calendar: events } });
  const instance = buildModuleInstance('fullscreen-calendar', { view: 'family-grid' });
  const config = baseConfig({ screens: [makeScreen('family', 'Family', [instance])] });
  config.settings.calendar.icalSources = [{ id: 'cal-primary', name: 'Personal', type: 'ical', url: 'https://example.com/personal.ics', color: '#60a5fa', enabled: true }];
  config.settings.calendar.personSources = { alex: ['cal-primary'] };
  await putConfig(request, config);

  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/family', async (route) => { await held; await route.continue(); });
  const calendarResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/calendar');
  try {
    await page.goto('/display');
    await calendarResponse;
    const calendar = page.locator('[data-module-type="fullscreen-calendar"]');
    await expect(calendar.getByTestId('module-loading')).toBeVisible();
    await expect(calendar.getByRole('rowheader')).toHaveCount(0);
    release();
    await expect(calendar.getByRole('rowheader')).toHaveCount(1);
    await expect(calendar.getByRole('rowheader')).toContainText('Alex');
    await expect(calendar.getByText('Sam', { exact: true })).toHaveCount(0);
    await expect(calendar.locator('[data-event-id="evt-1"]').first()).toBeVisible();
    expect(stub.externalHits).toEqual([]);
  } finally { release(); }
});

test('a calendar filtered to people shows nothing until the roster arrives, then only their events', async ({ page, request, sandboxDir }) => {
  seedFamily(sandboxDir, [
    { id: 'ann', name: 'Ann', color: '#60a5fa' },
    { id: 'ben', name: 'Ben', color: '#fbbf24' },
  ]);
  const base = todayCalendarEvents()[0];
  const events = [
    { ...base, id: 'ann-1', title: 'ANN EVENT', sourceId: 'ann-cal', sourceName: 'Ann' },
    { ...base, id: 'ben-1', title: 'BEN EVENT', sourceId: 'ben-work', sourceName: 'Ben work' },
    { ...base, id: 'house-1', title: 'HOUSE EVENT', sourceId: 'house', sourceName: 'House' },
  ];
  const stub = await stubModuleData(page, { overrides: { calendar: events } });
  const instance = buildModuleInstance('fullscreen-calendar', { view: 'agenda', peopleFilter: { memberIds: ['ann'], groupIds: [], includeShared: true } });
  const config = baseConfig({ screens: [makeScreen('cal', 'Calendar', [instance])] });
  config.settings.calendar.icalSources = [
    { id: 'ann-cal', name: 'Ann', type: 'ical', url: 'https://example.com/ann.ics', color: '#60a5fa', enabled: true },
    { id: 'ben-work', name: 'Ben work', type: 'ical', url: 'https://example.com/ben.ics', color: '#fbbf24', enabled: true },
    { id: 'house', name: 'House', type: 'ical', url: 'https://example.com/house.ics', color: '#6b7280', enabled: true },
  ];
  config.settings.calendar.personSources = { ann: ['ann-cal'], ben: ['ben-work'] };
  await putConfig(request, config);

  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/family', async (route) => { await held; await route.continue(); });
  const calendarResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/calendar');
  try {
    await page.goto('/display');
    await calendarResponse;
    const calendar = page.locator('[data-module-type="fullscreen-calendar"]');
    await expect(calendar.getByTestId('module-loading')).toBeVisible();
    await expect(calendar.getByText('BEN EVENT')).toHaveCount(0);
    await expect(calendar.getByText('HOUSE EVENT')).toHaveCount(0);
    release();
    await expect(calendar.getByText('ANN EVENT').first()).toBeVisible();
    await expect(calendar.getByText('HOUSE EVENT').first()).toBeVisible();
    await expect(calendar.getByText('BEN EVENT')).toHaveCount(0);
    expect(stub.externalHits).toEqual([]);
  } finally { release(); }
});
