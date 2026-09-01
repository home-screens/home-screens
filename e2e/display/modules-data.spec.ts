import { test, expect } from '../fixtures';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { seedChores, seedMeals, todayCalendarEvents } from '../helpers/api';
import { renderOnDisplay } from '../helpers/display';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, fixturesByKind, matrixSettings, MODULE_FIXTURES } from '../helpers/module-fixtures';
import { sourceStatusBody } from '../helpers/calendar-status-fixture';

/** Render matrix — networked modules, each fed its stub fixture. */
for (const fx of fixturesByKind('networked')) {
  test(`networked module renders: ${fx.type}`, async ({ page, request }) => {
    // The calendar fixture must be dated relative to the test clock — the views
    // only surface events within a few days / the agenda window of "today".
    const overrides = fx.stubKey === 'calendar' ? { calendar: todayCalendarEvents() } : undefined;
    await stubModuleData(page, { overrides });
    const config = baseConfig({
      screens: [makeScreen('s1', 'S1', [buildModuleInstance(fx.type, fx.config)])],
      settings: matrixSettings(),
    });
    const display = await renderOnDisplay(page, request, config);
    await fx.expect(display.module(fx.type), page);
  });
}

/** Render matrix — local-data modules, seeded via their real APIs. */
for (const fx of fixturesByKind('local-data')) {
  test(`local-data module renders: ${fx.type}`, async ({ page, request }) => {
    if (fx.seed === 'chores') await seedChores(request);
    if (fx.seed === 'meals') await seedMeals(request);
    const config = baseConfig({
      screens: [makeScreen('s1', 'S1', [buildModuleInstance(fx.type, fx.config)])],
      settings: matrixSettings(),
    });
    const display = await renderOnDisplay(page, request, config);
    await fx.expect(display.module(fx.type), page);
  });
}

/**
 * Empty + error states for representative data modules. Data modules regress
 * here most often — a null/empty payload or a 500 should render a fallback,
 * never crash the display. We assert the module wrapper stays mounted and
 * does not surface its normal happy-path value.
 *
 * Each `empty` payload is a structurally valid but content-free version of the
 * module's real fixture shape (see e2e/fixtures/module-data/*.json), so the
 * fallback path exercised here matches what the app sees from a real upstream
 * that returned nothing. `happy` is the substring the module renders on the
 * happy path (from its MODULE_FIXTURES row) and must be ABSENT here.
 */
const RESILIENCE = [
  { type: 'news', empty: { items: [] }, happy: 'Global markets' },
  { type: 'stock-ticker', stubKey: 'stocks', empty: { stocks: [] }, happy: 'AAPL' },
  { type: 'todoist', empty: { tasks: [], projects: [] }, happy: 'Buy oat milk' },
  { type: 'weather', empty: { hourly: [], forecast: [] }, happy: '72°' },
  { type: 'sports', empty: { games: [] }, happy: 'BUF' },
  { type: 'standings', empty: { groups: [] }, happy: 'Bills' },
  { type: 'crypto', empty: { prices: [] }, happy: 'Bitcoin' },
  { type: 'history', empty: { events: [] }, happy: 'Apollo 11 lands on the Moon.' },
  { type: 'quote', empty: {}, happy: 'The only way to do great work' },
  { type: 'dad-joke', empty: {}, happy: 'skeletons' },
  // An empty {} yields aqi undefined -> the "Unknown" label, and a 500 gates to
  // the error state, so the happy-path "Fair" category is absent in both.
  { type: 'air-quality', stubKey: 'air-quality', empty: {}, happy: 'Fair' },
  // The calendar route returns { events, sourceStatus }; the display also
  // still tolerates a bare array (covered by the shared array fixture).
  { type: 'calendar', empty: { events: [], sourceStatus: [] }, happy: 'Dentist Appointment' },
  {
    type: 'fullscreen-calendar', stubKey: 'calendar', empty: { events: [], sourceStatus: [] }, happy: 'Dentist Appointment',
    config: { view: 'agenda' },
  },
  // traffic gates rendering on config.routes.length, so it needs its routes
  // carried through; the empty response ({ routes: [] }) surfaces no route rows,
  // so the label ('Home to Work', which comes from the response) stays absent.
  {
    type: 'traffic', empty: { routes: [] }, happy: 'Home to Work',
    config: { routes: [{ label: 'Home to Work', origin: 'A', destination: 'B' }] },
  },
] as const;

for (const r of RESILIENCE) {
  const fx = MODULE_FIXTURES[r.type];
  const stubKey = ('stubKey' in r && r.stubKey) || fx.stubKey!;
  const config = ('config' in r && r.config) || fx.config;

  test(`${r.type} survives an empty payload`, async ({ page, request }) => {
    await stubModuleData(page, { overrides: { [stubKey]: r.empty } });
    const cfg = baseConfig({
      screens: [makeScreen('s1', 'S1', [buildModuleInstance(fx.type, config)])],
      settings: matrixSettings(),
    });
    const display = await renderOnDisplay(page, request, cfg);
    const mod = display.module(fx.type);
    await expect(mod).toBeVisible();
    await expect(mod).not.toContainText(r.happy);
  });

  test(`${r.type} survives a 500`, async ({ page, request }) => {
    await stubModuleData(page, { overrides: { [stubKey]: { status: 500 } } });
    const cfg = baseConfig({
      screens: [makeScreen('s1', 'S1', [buildModuleInstance(fx.type, config)])],
      settings: matrixSettings(),
    });
    const display = await renderOnDisplay(page, request, cfg);
    const mod = display.module(fx.type);
    await expect(mod).toBeVisible();
    await expect(mod).not.toContainText(r.happy);
  });
}

/**
 * Weather renders a per-view empty branch (WeatherEmptyState) — the base
 * RESILIENCE row above exercises only the default view. Loop every view with
 * its own empty gate and assert the actual placeholder copy renders, so a
 * view-specific empty branch can't silently break. daily/table use the
 * forecast-specific message; the rest use the generic one. (precipitation and
 * alerts have distinct semantics: precipitation charts hourly data and the
 * alerts view's empty behavior is covered by the hide-when-no-alerts variant
 * row.)
 */
const WEATHER_EMPTY_VIEWS: Array<{ view: string; copy: string }> = [
  { view: 'current', copy: 'No weather data' },
  { view: 'hourly', copy: 'No weather data' },
  { view: 'combined', copy: 'No weather data' },
  { view: 'compact', copy: 'No weather data' },
  { view: 'daily', copy: 'No forecast data' },
  { view: 'table', copy: 'No forecast data' },
];

for (const { view, copy } of WEATHER_EMPTY_VIEWS) {
  test(`weather ${view} view renders its empty state on an empty payload`, async ({ page, request }) => {
    await stubModuleData(page, { overrides: { weather: { hourly: [], forecast: [] } } });
    const cfg = baseConfig({
      screens: [makeScreen('s1', 'S1', [buildModuleInstance('weather', { view })])],
      settings: matrixSettings(),
    });
    const display = await renderOnDisplay(page, request, cfg);
    const mod = display.module('weather');
    await expect(mod).toBeVisible();
    await expect(mod).toContainText(copy);
    await expect(mod).not.toContainText('72°');
  });
}

/**
 * Text-less data modules have no reliable happy-path substring to assert the
 * ABSENCE of (their fixtures use hasSize / hasChild('img') / a weak numeric
 * match), so resilience for them is a stricter shape: the module wrapper stays
 * mounted AND the page throws no uncaught error on empty data or a 500.
 */
const RESILIENCE_NO_CRASH = [
  { type: 'rain-map', stubKey: 'rain-map', empty: {} },
  // The backgrounds route returns a bare array of image URLs.
  { type: 'photo-slideshow', stubKey: 'backgrounds', empty: [] },
  { type: 'fullscreen-photo', stubKey: 'backgrounds', empty: [] },
] as const;

/**
 * A timed event crossing midnight renders on BOTH days it covers (issue #30):
 * the start day gets the evening segment and the next day gets the
 * early-morning remainder, each clamped to the visible hour window. The end
 * lands at 06:30 because the schedule grid opens at 06:00 by default — an
 * event ending at or before the grid's opening hour has no visible span on
 * its continuation day.
 */
test('fullscreen-calendar schedule view renders a midnight-crossing event on both days', async ({ page, request }) => {
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
  const start = new Date();
  start.setHours(19, 0, 0, 0);
  const end = new Date();
  end.setDate(end.getDate() + 1);
  end.setHours(6, 30, 0, 0);

  await stubModuleData(page, {
    overrides: {
      calendar: [{
        id: 'evt-overnight',
        title: 'Overnight Shift',
        start: iso(start),
        end: iso(end),
        allDay: false,
        calendarColor: '#4073ff',
        sourceId: 'cal-primary',
        sourceName: 'Personal',
      }],
    },
  });
  const cfg = baseConfig({
    screens: [makeScreen('s1', 'S1', [buildModuleInstance('fullscreen-calendar', {
      view: 'schedule',
      scheduleDaysToShow: 2,
    })])],
    settings: matrixSettings(),
  });
  const display = await renderOnDisplay(page, request, cfg);
  const mod = display.module('fullscreen-calendar');
  await expect(mod).toContainText('Overnight Shift');
  await expect(mod.locator('[data-event-id="evt-overnight"]')).toHaveCount(2);
});

/**
 * Failure ≠ empty: a calendar fetch that FAILS with nothing ever loaded must
 * render the "can't load" state — never the same wording as a genuinely
 * empty calendar, which is an answer families act on. Conversely a
 * SUCCESSFUL fetch returning zero events is an ordinary quiet week and must
 * never claim an outage. The two tests pin the discriminator's direction.
 */
test('fullscreen-calendar renders the cant-load state when the fetch fails with nothing loaded', async ({ page, request }) => {
  await stubModuleData(page, { overrides: { calendar: { status: 500 } } });
  const cfg = baseConfig({
    screens: [makeScreen('s1', 'S1', [buildModuleInstance('fullscreen-calendar', {})])],
    settings: matrixSettings(),
  });
  const display = await renderOnDisplay(page, request, cfg);
  const mod = display.module('fullscreen-calendar');
  await expect(mod).toContainText("Can't load events right now");
  await expect(mod).not.toContainText('No events this week');
});

test('fullscreen-calendar renders the ordinary empty state on a successful empty fetch', async ({ page, request }) => {
  await stubModuleData(page, { overrides: { calendar: [] } });
  const cfg = baseConfig({
    screens: [makeScreen('s1', 'S1', [buildModuleInstance('fullscreen-calendar', {})])],
    settings: matrixSettings(),
  });
  const display = await renderOnDisplay(page, request, cfg);
  const mod = display.module('fullscreen-calendar');
  await expect(mod).toContainText('No events this week');
  await expect(mod).not.toContainText("Can't load events");
});

for (const r of RESILIENCE_NO_CRASH) {
  const fx = MODULE_FIXTURES[r.type];

  for (const scenario of ['empty', '500'] as const) {
    test(`${r.type} does not crash on ${scenario === 'empty' ? 'an empty payload' : 'a 500'}`, async ({ page, request }) => {
      const errors: Error[] = [];
      page.on('pageerror', (e) => errors.push(e));

      await stubModuleData(page, {
        overrides: { [r.stubKey]: scenario === 'empty' ? r.empty : { status: 500 } },
      });
      const cfg = baseConfig({
        screens: [makeScreen('s1', 'S1', [buildModuleInstance(fx.type, fx.config)])],
        settings: matrixSettings(),
      });
      const display = await renderOnDisplay(page, request, cfg);
      await expect(display.module(fx.type)).toBeVisible();
      expect(errors).toHaveLength(0);
    });
  }
}

/**
 * Failure copy on the wall. A route that says the household still has to add
 * a key (`code: 'setup'`) renders the calm setup card; an upstream failure
 * renders a quiet "not updating" line. Neither ever prints the route's own
 * message, an HTTP status, or the words "API key".
 */
const SETUP_BODY = {
  error: 'No OpenWeatherMap API key configured. Add it in Settings > Integrations.',
  code: 'setup',
  setup: { needs: 'key', service: 'OpenWeatherMap' },
};

test('a setup error renders the setup card, never the route message', async ({ page, request }) => {
  await stubModuleData(page, { overrides: { 'air-quality': { status: 400, body: SETUP_BODY } } });
  const cfg = baseConfig({
    screens: [makeScreen('s1', 'S1', [buildModuleInstance('air-quality')])],
    settings: matrixSettings(),
  });
  const display = await renderOnDisplay(page, request, cfg);
  const mod = display.module('air-quality');
  await expect(mod.getByTestId('module-setup-state')).toBeVisible();
  await expect(mod).toContainText('No OpenWeatherMap key yet');
  await expect(mod).toContainText('Finish setup in the editor');
  await expect(mod).not.toContainText('Settings > Integrations');
  await expect(mod).not.toContainText('API key');
});

test('an upstream 500 renders a quiet not-updating line without the status code', async ({ page, request }) => {
  await stubModuleData(page, { overrides: { todoist: { status: 500, body: { error: 'Failed to fetch Todoist data', detail: 'Todoist API /tasks returned 502' } } } });
  const cfg = baseConfig({
    screens: [makeScreen('s1', 'S1', [buildModuleInstance('todoist')])],
    settings: matrixSettings(),
  });
  const display = await renderOnDisplay(page, request, cfg);
  const mod = display.module('todoist');
  await expect(mod.getByTestId('module-not-updating')).toBeVisible();
  await expect(mod).toContainText('Not updating right now');
  await expect(mod).not.toContainText('500');
  await expect(mod).not.toContainText('502');
  await expect(mod).not.toContainText('Failed to fetch');
});

test('traffic sample numbers never reach the wall', async ({ page, request }) => {
  await stubModuleData(page, {
    overrides: {
      traffic: {
        routes: [{ label: 'Home to Work', durationMinutes: 22, durationInTrafficMinutes: 28, delayMinutes: 6 }],
        mock: true,
        note: 'Add a Google Maps or TomTom API key in Settings > Integrations for real traffic data',
      },
    },
  });
  const cfg = baseConfig({
    screens: [makeScreen('s1', 'S1', [buildModuleInstance('traffic', { routes: [{ label: 'Home to Work', origin: 'A', destination: 'B' }] })])],
    settings: matrixSettings(),
  });
  const display = await renderOnDisplay(page, request, cfg);
  const mod = display.module('traffic');
  await expect(mod.getByTestId('module-setup-state')).toBeVisible();
  await expect(mod).toContainText('Traffic needs a Google Maps or TomTom key');
  await expect(mod).not.toContainText('28');
  await expect(mod).not.toContainText('Home to Work');
});

for (const type of ['weather', 'fullscreen-weather'] as const) {
  test(`${type} with a missing provider key renders the setup card instead of waiting forever`, async ({ page, request }) => {
    await stubModuleData(page, {
      overrides: {
        weather: {
          status: 400,
          body: { error: 'No WeatherAPI API key configured.', code: 'setup', setup: { needs: 'key', service: 'WeatherAPI' } },
        },
      },
    });
    const cfg = baseConfig({
      screens: [makeScreen('s1', 'S1', [buildModuleInstance(type)])],
      settings: matrixSettings(),
    });
    const display = await renderOnDisplay(page, request, cfg);
    const mod = display.module(type);
    await expect(mod.getByTestId('module-setup-state')).toBeVisible();
    await expect(mod).toContainText('No WeatherAPI key yet');
    await expect(mod).not.toContainText('No weather data');
    await expect(mod).not.toContainText('Getting the forecast');
  });
}

test('weather with a failing provider says it is not updating instead of "No weather data"', async ({ page, request }) => {
  await stubModuleData(page, { overrides: { weather: { status: 502, body: { error: 'Failed to fetch weather' } } } });
  const cfg = baseConfig({
    screens: [makeScreen('s1', 'S1', [buildModuleInstance('weather')])],
    settings: matrixSettings(),
  });
  const display = await renderOnDisplay(page, request, cfg);
  const mod = display.module('weather');
  await expect(mod).toContainText('Weather is not updating');
  await expect(mod).not.toContainText('No weather data');
  await expect(mod).not.toContainText('502');
});

test('fullscreen-calendar marks a failing source: legend ring, named pill, saved rows', async ({ page, request }) => {
  await stubModuleData(page, { overrides: { calendar: sourceStatusBody() } });
  const cfg = baseConfig({
    screens: [makeScreen('s1', 'S1', [buildModuleInstance('fullscreen-calendar', { view: 'agenda', showLegend: 'header' })])],
    settings: matrixSettings(),
  });
  const display = await renderOnDisplay(page, request, cfg);
  const mod = display.module('fullscreen-calendar');

  // Named pill takes the header slot; wording is calm, no error language.
  await expect(mod).toContainText('School not updating since 7:10');
  // Legend: the failing source is ringed, the healthy one is not.
  await expect(mod.locator('[data-source-failing]')).toContainText('School');
  await expect(mod.locator('[data-source-failing]')).toHaveCount(1);
  // Rows: only the failing source's event carries the saved suffix.
  await expect(mod).toContainText('· saved');
  // Multi-day events render one row per visible segment; check the first.
  await expect(mod.locator('[data-event-id="bad-1"]').first()).toContainText('saved');
  await expect(mod.locator('[data-event-id="ok-1"]').first()).not.toContainText('saved');
});

test('calendar module marks a failing source: banner and saved row suffix', async ({ page, request }) => {
  await stubModuleData(page, { overrides: { calendar: sourceStatusBody() } });
  const cfg = baseConfig({
    screens: [makeScreen('s1', 'S1', [buildModuleInstance('calendar', { viewMode: 'daily', showLegend: 'header' })])],
    settings: matrixSettings(),
  });
  const display = await renderOnDisplay(page, request, cfg);
  const mod = display.module('calendar');

  await expect(mod).toContainText('School not updating since 7:10');
  await expect(mod.locator('[data-source-failing]')).toContainText('School');
  await expect(mod.locator('[data-event-id="bad-1"]').first()).toContainText('saved');
  await expect(mod.locator('[data-event-id="ok-1"]').first()).not.toContainText('saved');
});
