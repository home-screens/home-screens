import { test as base, expect } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { localDate } from '../helpers/dates';
import { launchServer, type HsServer } from '../helpers/server';
import { startFakeGoogleCalendar, type FakeGoogleCalendar } from '../helpers/fake-google-calendar';
import type { CalendarEvent, ScreenConfiguration } from '@/types/config';

/**
 * A household's own name and colour for a Google calendar, from the pencil
 * in Settings > Calendar to a wall that is already showing it, the calendar
 * answer, and the phone's add-event form. Runs against the fake Google
 * (helpers/fake-google-calendar.ts) the hub reaches through
 * HS_GOOGLE_CALENDAR_API_URL.
 */

const FAMILY = 'family@group.calendar.google.com';
const KIDS = 'kids@group.calendar.google.com';
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

function config(): ScreenConfiguration {
  const cfg = baseConfig({
    screens: [
      makeScreen('wall', 'Wall', [{ ...buildModuleInstance('fullscreen-calendar'), config: { view: 'agenda' } }]),
      makeScreen('legend', 'Legend', [{ ...buildModuleInstance('fullscreen-calendar'), id: 'legend-cal', config: { view: 'agenda', showLegend: 'header' } }]),
    ],
  });
  cfg.settings.calendar = {
    ...cfg.settings.calendar,
    googleCalendarIds: [FAMILY, KIDS],
    eventEntry: { enabled: true, calendarIds: [FAMILY, KIDS], defaultCalendarId: FAMILY, defaultMinutes: 60 },
  };
  return cfg;
}

const test = base.extend<object, { google: FakeGoogleCalendar; hub: HsServer }>({
  google: [async ({}, use) => {
    const fake = await startFakeGoogleCalendar([
      { id: FAMILY, summary: 'Family', backgroundColor: '#4073ff', accessRole: 'owner', primary: true },
      { id: KIDS, summary: 'Kids activities', backgroundColor: '#16a34a', accessRole: 'writer' },
    ], { eventColors: { '11': '#d50000' } });
    fake.seed(FAMILY, { summary: 'Pizza night', start: { dateTime: `${localDate(1)}T18:00:00`, timeZone: ZONE }, end: { dateTime: `${localDate(1)}T19:00:00`, timeZone: ZONE } });
    fake.seed(KIDS, { summary: 'Soccer practice', start: { dateTime: `${localDate(2)}T09:00:00`, timeZone: ZONE }, end: { dateTime: `${localDate(2)}T10:30:00`, timeZone: ZONE } });
    // Two events somebody coloured red in Google, outnumbering the plain one.
    fake.seed(KIDS, { summary: 'Recital', colorId: '11', start: { dateTime: `${localDate(3)}T16:00:00`, timeZone: ZONE }, end: { dateTime: `${localDate(3)}T17:00:00`, timeZone: ZONE } });
    fake.seed(KIDS, { summary: 'Science fair', colorId: '11', start: { dateTime: `${localDate(4)}T16:00:00`, timeZone: ZONE }, end: { dateTime: `${localDate(4)}T17:00:00`, timeZone: ZONE } });
    await use(fake);
    await fake.close();
  }, { scope: 'worker' }],
  hub: [async ({ google }, use) => {
    const server = await launchServer(
      {
        'config.json': config(),
        'secrets.json': {
          google_client_id: 'own-tv-id.apps.googleusercontent.com',
          google_client_secret: 'own-tv-secret',
          google_web_client_id: 'own-web-id.apps.googleusercontent.com',
          google_web_client_secret: 'own-web-secret',
        },
        'google-tokens.json': {
          access_token: 'fake-access', refresh_token: 'fake-refresh', expiry_date: Date.now() + 30 * 86_400_000,
          token_type: 'Bearer', scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events', client_kind: 'web',
        },
      },
      { HS_GOOGLE_HOSTED: '0', HS_GOOGLE_CALENDAR_API_URL: google.url },
    );
    await use(server);
    await server.stop();
  }, { scope: 'worker' }],
  baseURL: async ({ hub }, use) => {
    await use(hub.baseURL);
  },
});

test.describe.configure({ mode: 'serial' });

const familyRow = (page: import('@playwright/test').Page) =>
  page.getByTestId('google-calendar-row').filter({ has: page.locator('input[type="checkbox"]:checked') }).first();

test('a rename and a colour reach a wall that is already open, the calendar answer and the phone\'s form', async ({ page, browser, request, hub }) => {
  // The wall first, showing Google's name.
  const wall = await browser.newPage({ baseURL: hub.baseURL });
  await wall.goto('/display?screen=wall&preview=1');
  await expect(wall.getByText('Pizza night')).toBeVisible({ timeout: 30_000 });
  // The agenda names each event's calendar under it.
  await expect(wall.getByText('Family', { exact: true })).toBeVisible();

  await page.goto('/editor/settings?section=defaults&page=calendar');
  const row = familyRow(page);
  await expect(row).toContainText('Family');
  await row.getByTestId('calendar-look-edit').click();
  await expect(page.getByTestId('calendar-look-name')).toHaveAttribute('placeholder', 'Family');
  await page.getByTestId('calendar-look-name').fill('Smith family');
  await page.getByTestId('calendar-look-color').fill('#10b981');
  await expect(row).toContainText('Smith family');

  await expect.poll(async () => (await (await request.get('/api/config')).json()).settings.calendar.calendarOverrides)
    .toEqual({ [FAMILY]: { name: 'Smith family', color: '#10b981' } });

  // The open wall re-reads on the next heartbeats, not at its 5-minute poll.
  await expect(wall.getByText('Smith family', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(wall.getByText('Family', { exact: true })).toHaveCount(0);

  const answer = await (await request.get('/api/calendar')).json() as { events: CalendarEvent[] };
  const pizzaEvent = answer.events.find((e) => e.title === 'Pizza night')!;
  expect(pizzaEvent).toMatchObject({ sourceName: 'Smith family', calendarColor: '#10b981' });
  const soccer = answer.events.find((e) => e.title === 'Soccer practice')!;
  expect(soccer).toMatchObject({ sourceName: 'Kids activities', calendarColor: '#16a34a' });

  // The phone's add form names the calendar the same way.
  await page.goto('/remote?tab=calendar');
  await expect(page.getByTestId('calendar-tab')).toBeVisible();
  await page.getByTestId('calendar-add-event').first().click();
  await expect(page.locator(`[data-calendar="${FAMILY}"]`)).toContainText('Smith family');
  await wall.close();
});

test('Reset puts Google\'s name and colour back', async ({ page, request }) => {
  await page.goto('/editor/settings?section=defaults&page=calendar');
  const row = familyRow(page);
  await expect(row).toContainText('Smith family');
  await row.getByTestId('calendar-look-edit').click();
  await page.getByTestId('calendar-look-reset').click();
  await expect(row).toContainText('Family');
  await expect(row).not.toContainText('Smith family');

  await expect.poll(async () => (await (await request.get('/api/config')).json()).settings.calendar.calendarOverrides)
    .toBeUndefined();
  await expect.poll(async () => {
    const answer = await (await request.get('/api/calendar')).json() as { events: CalendarEvent[] };
    return answer.events.find((e) => e.title === 'Pizza night')?.sourceName;
  }).toBe('Family');
});

test('recolouring a calendar keeps the colours Google events were given, and its colour key shows the colour picked', async ({ page, request }) => {
  const saved = await (await request.get('/api/config')).json();
  saved.settings.calendar.calendarOverrides = { [KIDS]: { color: '#10b981' } };
  expect((await request.put('/api/config', { data: saved })).status()).toBe(200);

  await expect.poll(async () => {
    const answer = await (await request.get('/api/calendar')).json() as { events: CalendarEvent[] };
    return answer.events.filter((e) => e.sourceId === KIDS).map((e) => [e.title, e.calendarColor, e.sourceColor ?? null]);
  }).toEqual([
    ['Soccer practice', '#10b981', null],
    ['Recital', '#d50000', '#10b981'],
    ['Science fair', '#d50000', '#10b981'],
  ]);

  await page.goto('/display?screen=legend&preview=1');
  const key = page.locator('[data-legend-kind="source"]', { hasText: 'Kids activities' });
  await expect(key).toBeVisible({ timeout: 30_000 });
  // Two red events outnumber the plain one, and the key still shows the calendar's green.
  await expect(key.locator('span').first()).toHaveCSS('background-color', 'rgb(16, 185, 129)');
});
