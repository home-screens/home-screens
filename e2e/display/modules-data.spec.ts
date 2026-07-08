import { test, expect } from '../fixtures';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { seedChores, seedMeals, todayCalendarEvents } from '../helpers/api';
import { renderOnDisplay } from '../helpers/display';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, fixturesByKind, matrixSettings, MODULE_FIXTURES } from '../helpers/module-fixtures';

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
 */
const RESILIENCE = [
  { type: 'news', empty: { items: [] }, happy: 'Global markets' },
  { type: 'stock-ticker', stubKey: 'stocks', empty: { stocks: [] }, happy: 'AAPL' },
  { type: 'todoist', empty: { tasks: [], projects: [] }, happy: 'Buy oat milk' },
  { type: 'weather', empty: { hourly: [], forecast: [] }, happy: '72°' },
] as const;

for (const r of RESILIENCE) {
  const fx = MODULE_FIXTURES[r.type];
  const stubKey = fx.stubKey!;

  test(`${r.type} survives an empty payload`, async ({ page, request }) => {
    await stubModuleData(page, { overrides: { [stubKey]: r.empty } });
    const config = baseConfig({
      screens: [makeScreen('s1', 'S1', [buildModuleInstance(fx.type, fx.config)])],
      settings: matrixSettings(),
    });
    const display = await renderOnDisplay(page, request, config);
    const mod = display.module(fx.type);
    await expect(mod).toBeVisible();
    await expect(mod).not.toContainText(r.happy);
  });

  test(`${r.type} survives a 500`, async ({ page, request }) => {
    await stubModuleData(page, { overrides: { [stubKey]: { status: 500 } } });
    const config = baseConfig({
      screens: [makeScreen('s1', 'S1', [buildModuleInstance(fx.type, fx.config)])],
      settings: matrixSettings(),
    });
    const display = await renderOnDisplay(page, request, config);
    const mod = display.module(fx.type);
    await expect(mod).toBeVisible();
    await expect(mod).not.toContainText(r.happy);
  });
}
