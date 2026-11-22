import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { localDate } from '../helpers/dates';
import { launchServer, type HsServer } from '../helpers/server';
import { startFakeGoogleCalendar, type FakeGoogleCalendar } from '../helpers/fake-google-calendar';
import type { ScreenConfiguration } from '@/types/config';

/**
 * Adding, changing and removing Google Calendar events from the phone's
 * Calendar tab and from the wall, against the in-process fake Google
 * (helpers/fake-google-calendar.ts) that the hub reaches through
 * HS_GOOGLE_CALENDAR_API_URL. The household is on its own Google app with a
 * web sign-in that may write, so adding is ready from the start.
 */

const FAMILY = 'family@group.calendar.google.com';
const KIDS = 'kids@group.calendar.google.com';
const TEAM = 'team@group.calendar.google.com';
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

function config(adding = true, moduleAdds = true): ScreenConfiguration {
  const cfg = baseConfig({
    screens: [makeScreen('wall', 'Wall', [{ ...buildModuleInstance('fullscreen-calendar'), config: { view: 'month-grid', eventTapDetails: true, ...(moduleAdds ? {} : { addEvents: false }) } }])],
  });
  cfg.settings.calendar = {
    ...cfg.settings.calendar,
    googleCalendarIds: [FAMILY, KIDS, TEAM],
    eventEntry: { enabled: adding, calendarIds: [FAMILY, KIDS], defaultCalendarId: FAMILY, defaultMinutes: 60 },
  };
  return cfg;
}

const test = base.extend<object, { google: FakeGoogleCalendar; hub: HsServer }>({
  google: [async ({}, use) => {
    const fake = await startFakeGoogleCalendar([
      { id: FAMILY, summary: 'Family', backgroundColor: '#4073ff', accessRole: 'owner', primary: true },
      { id: KIDS, summary: 'Kids activities', backgroundColor: '#16a34a', accessRole: 'writer' },
      { id: TEAM, summary: 'Team schedule', backgroundColor: '#fb4f14', accessRole: 'reader' },
    ]);
    // One-off and repeating events around today, seeded once: the hub keeps
    // its calendar answer for a few minutes, and only its own writes renew it.
    fake.seed(KIDS, { summary: 'Soccer practice', start: { dateTime: `${localDate(-7)}T09:00:00`, timeZone: ZONE }, end: { dateTime: `${localDate(-7)}T10:30:00`, timeZone: ZONE }, recurrence: ['RRULE:FREQ=WEEKLY'] });
    fake.seed(FAMILY, { summary: 'Pizza night', start: { dateTime: `${localDate(0)}T18:00:00`, timeZone: ZONE }, end: { dateTime: `${localDate(0)}T19:00:00`, timeZone: ZONE } });
    fake.seed(TEAM, { summary: 'Team game', start: { dateTime: `${localDate(1)}T14:00:00`, timeZone: ZONE }, end: { dateTime: `${localDate(1)}T16:00:00`, timeZone: ZONE } });
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
          token_type: 'Bearer', scope: `https://www.googleapis.com/auth/calendar.readonly ${EVENTS_SCOPE}`, client_kind: 'web',
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

const writes = (google: FakeGoogleCalendar, method: string) => google.calls.filter((c) => c.method === method);

async function openCalendarTab(page: Page) {
  await page.goto('/remote?tab=calendar');
  await expect(page.getByTestId('calendar-tab')).toBeVisible();
  await expect(page.locator('[data-testid="calendar-event"]').first()).toBeVisible();
}

test('the phone adds a weekly event to the calendar picked, and lists events it cannot change as plain rows', async ({ page, google }) => {
  await openCalendarTab(page);
  await expect(page.locator('div[data-testid="calendar-event"]', { hasText: 'Team game' })).toHaveAttribute('data-read-only', '');
  await page.getByTestId('calendar-add-event').nth(2).click();
  await page.getByTestId('event-form-title').fill('Piano lesson');
  await page.getByTestId('event-form-start').fill('16:00');
  await page.getByTestId('event-form-repeat').click();
  await page.locator('[data-frequency="weekly"]').click();
  await page.getByTestId('event-repeat-done').click();
  await page.locator(`[data-calendar="${KIDS}"]`).click();
  await page.getByTestId('event-form-save').click();

  await expect(page.getByTestId('event-form')).toHaveCount(0);
  await expect(page.getByText('Added to Kids activities.')).toBeVisible();
  const posted = writes(google, 'POST').at(-1)!;
  expect(posted.path).toBe(`/calendar/v3/calendars/${KIDS}/events`);
  expect(posted.body).toMatchObject({
    summary: 'Piano lesson',
    start: { dateTime: `${localDate(2)}T16:00:00` },
    end: { dateTime: `${localDate(2)}T17:00:00` },
    recurrence: ['RRULE:FREQ=WEEKLY'],
    extendedProperties: { private: { homeScreens: '1' } },
  });
  await expect(page.locator('button[data-testid="calendar-event"]', { hasText: 'Piano lesson' }).first()).toBeVisible();
});

test('changing one day of a repeating event asks, and "Just this day" changes only that day', async ({ page, google }) => {
  await openCalendarTab(page);
  await page.locator('button[data-testid="calendar-event"]', { hasText: 'Soccer practice' }).first().click();
  await page.getByTestId('event-form-start').fill('09:30');
  await page.getByTestId('event-form-save').click();
  await page.getByTestId('event-save-choice').locator('[data-choice="instance"]').click();
  await expect(page.getByTestId('event-form')).toHaveCount(0);
  const patched = writes(google, 'PATCH').at(-1)!;
  // One day of the series, not the series itself.
  expect(patched.path).toMatch(new RegExp(`/events/seed\\d+_\\d{8}$`));
  expect(patched.body).toMatchObject({ start: { dateTime: expect.stringMatching(/T09:30:00$/) } });
  expect(patched.body).not.toHaveProperty('recurrence');
});

test.describe('on the wall', () => {
  test.use({ viewport: { width: 1080, height: 1920 } });

test('the wall adds an event on an empty day with its own keyboard, then removes it', async ({ page, google }) => {
  const day = localDate(4);
  await page.goto('/display?screen=wall');
  const cell = page.locator(`[data-open-day="${day}"]`).first();
  await expect(cell).toBeVisible({ timeout: 30_000 });
  await cell.click();
  await page.getByTestId('day-sheet-add-event').click();
  await expect(page.getByTestId('wall-event-form')).toBeVisible();
  // The first letter is a capital on its own.
  for (const key of ['S', 'w', 'i', 'm']) await page.locator(`[data-testid="wall-event-form"] [data-key="${key}"]`).click();
  await page.locator('[data-testid="wall-event-form"] [data-key="action"]').click();
  await page.locator('[data-testid="wall-event-form"] [data-hour="15"]').click();
  await page.getByTestId('wall-event-save').click();
  await expect(page.getByTestId('wall-event-form')).toHaveCount(0);
  const posted = writes(google, 'POST').at(-1)!;
  expect(posted.body).toMatchObject({ summary: 'Swim', start: { dateTime: `${day}T15:00:00` }, end: { dateTime: `${day}T16:00:00` } });
  expect(posted.path).toBe(`/calendar/v3/calendars/${FAMILY}/events`);

  const event = page.locator('[data-event-id]', { hasText: 'Swim' }).first();
  await expect(event).toBeVisible({ timeout: 15_000 });
  await event.click();
  await page.getByTestId('event-detail-remove').click();
  await page.getByTestId('event-detail-remove-ask').locator('[data-choice="instance"]').click();
  await expect.poll(() => writes(google, 'DELETE').length).toBeGreaterThan(0);
  expect(writes(google, 'DELETE').at(-1)!.path).toMatch(new RegExp(`^/calendar/v3/calendars/${FAMILY}/events/ev\\d+$`));
});

test('with adding off, the phone says so and neither the phone nor the wall offers it', async ({ page, request }) => {
  await request.put('/api/config', { data: config(false) });
  await openCalendarTab(page);
  await expect(page.getByTestId('calendar-adding-card')).toContainText('Adding events is turned off');
  await expect(page.getByTestId('calendar-add-event')).toHaveCount(0);
  await expect(page.locator('button[data-testid="calendar-event"]')).toHaveCount(0);

  await page.goto('/display?screen=wall');
  const busyDay = page.locator(`[data-open-day="${localDate(0)}"]`).first();
  await expect(busyDay).toBeVisible({ timeout: 30_000 });
  await busyDay.click();
  await expect(page.getByTestId('day-sheet-add-event')).toHaveCount(0);
  // An empty day stays plain text, as it always was.
  await expect(page.locator(`[data-open-day="${localDate(5)}"]`)).toHaveCount(0);
  await request.put('/api/config', { data: config(true) });
});

test('a calendar with "Add events from a day" off offers no adding, while the phone still can', async ({ page, request }) => {
  await request.put('/api/config', { data: config(true, false) });
  await page.goto('/display?screen=wall');
  const busyDay = page.locator(`[data-open-day="${localDate(0)}"]`).first();
  await expect(busyDay).toBeVisible({ timeout: 30_000 });
  await busyDay.click();
  await expect(page.locator('[data-day-sheet-style]')).toBeVisible();
  await expect(page.getByTestId('day-sheet-add-event')).toHaveCount(0);
  await expect(page.locator(`[data-open-day="${localDate(5)}"]`)).toHaveCount(0);
  await request.put('/api/config', { data: config(true) });
});
});
