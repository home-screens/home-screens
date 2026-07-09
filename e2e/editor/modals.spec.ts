import path from 'node:path';
import { test, expect } from '../fixtures';
import { getConfig, putConfig, seedMeals } from '../helpers/api';
import { baseConfig, makeScreen, textModule, choreChartModule } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { autosaved, selectModule, moduleConfig } from '../helpers/editor';
import { stubModuleData } from '../helpers/stubs';

/**
 * Low-surface editor modals and pickers, grouped since each needs only one or
 * two assertions. Selectors were read directly from the components rather than
 * taken from the plan draft — several plan assumptions did not survive contact
 * with the real UI (see the per-test notes and the task report).
 *
 * Export / import / templates all live on the Data settings page
 * (`?section=defaults&page=data`), NOT a canvas toolbar button. The background
 * picker and screen schedule editor live in the PropertyPanel empty state
 * (shown when a screen is selected but no module is).
 */

const DATA_PAGE = '/editor/settings?section=defaults&page=data';

test.describe('layout export / import / templates (Data settings page)', () => {
  test('exporting the layout triggers a JSON download', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    await page.goto(DATA_PAGE);

    // Page button opens LayoutExportModal; the modal's "Export" fires the download.
    await page.getByRole('button', { name: 'Export Layout' }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export', exact: true }).click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);
  });

  test('importing a layout file appends its screens', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'Screen 1', [textModule('BASE')])],
    }));
    await page.goto(DATA_PAGE);

    // Two hidden `.json` file inputs exist (layout import + full restore); the
    // layout one is rendered first. Setting files fires its onChange directly —
    // no need to click the button that only opens the native picker.
    await page.locator('input[type="file"]').first().setInputFiles(
      path.join(__dirname, '..', 'fixtures', 'layout-sample.json'),
    );

    // FileReader validates + opens LayoutImportModal; its "Import" persists.
    await page.getByRole('button', { name: 'Import', exact: true }).click();

    await expect
      .poll(async () => (await getConfig(request)).screens.map((s) => s.name))
      .toContain('E2E Imported Screen');
  });

  test('picking a template appends its screens', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'Screen 1', [textModule('BASE')])],
    }));
    await page.goto(DATA_PAGE);

    await page.getByRole('button', { name: 'Browse Templates' }).click();
    // Template cards are buttons whose accessible name includes the template
    // name, category, and description — match on the name substring.
    await page.getByRole('button', { name: /Family Dashboard/ }).click();

    // The picked template opens the same LayoutImportModal; confirm to apply.
    await page.getByRole('button', { name: 'Import', exact: true }).click();

    await expect
      .poll(async () => (await getConfig(request)).screens.length)
      .toBeGreaterThan(1);
  });
});

test.describe('PropertyPanel empty-state pickers', () => {
  test('enabling a screen schedule window persists', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'Screen 1', [textModule('S1')])],
    }));
    await page.goto('/editor');
    await expect(page.getByTestId('editor-canvas')).toBeVisible();

    // With no module selected the panel shows Screen settings (which embeds the
    // schedule editor) and Background — both accordions default open.
    await expect(page.getByText('Select a module to edit')).toBeVisible();

    // Toggle the schedule on, then set a start time. The label reads "From"
    // (not "Start time" — the plan draft was wrong), and the input is
    // type="time", so `.fill('08:00')` is stored verbatim.
    await page.getByRole('switch', { name: 'Enable Schedule' }).click();
    await page.getByLabel('From', { exact: true }).fill('08:00');
    await page.getByLabel('From', { exact: true }).blur();

    await expect
      .poll(async () => (await getConfig(request)).screens[0].schedule?.startTime)
      .toBe('08:00');
  });

  test('enabling background auto-rotate persists per-screen', async ({ page, request }) => {
    // The picker's rotation controls only render when at least one image source
    // key exists; seed an Unsplash key so the "Auto-rotate" toggle appears.
    // (The plan's `settings.background` / "solid color|gradient" shape does not
    // exist — the real picker writes `screen.backgroundRotation`.)
    const seeded = await request.put('/api/secrets', {
      data: { key: 'unsplash_access_key', value: 'e2e-test-key' },
    });
    expect(seeded.ok()).toBe(true);

    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'Screen 1', [textModule('S1')])],
    }));
    await page.goto('/editor');
    await expect(page.getByTestId('editor-canvas')).toBeVisible();
    await expect(page.getByText('Select a module to edit')).toBeVisible();

    await autosaved(page, async () => {
      await page.getByRole('switch', { name: 'Auto-rotate' }).click();
    });

    await expect
      .poll(async () => (await getConfig(request)).screens[0].backgroundRotation?.enabled)
      .toBe(true);
  });
});

test.describe('ChoreChartModal (editor-side chore manager)', () => {
  // NOT a dedup of e2e/chores/chores.spec.ts: that suite covers the /chores kid
  // view and /remote ChoresTab. ChoreChartModal is a distinct three-column
  // editor CRUD component (members / chores / weekly preview) that writes to
  // /api/chores/data — so it earns its own coverage.
  test('adding a member persists to the shared chore data', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'Screen 1', [choreChartModule()])],
    }));
    await page.goto('/editor');
    await expect(page.getByTestId('editor-canvas')).toBeVisible();

    // Select the module so its Config accordion (open by default) renders the
    // "Edit Chore Chart" button.
    await page.locator('[data-module-id="chore-chart-1"]').click();
    await page.getByRole('button', { name: 'Edit Chore Chart' }).click();

    // Modal is open (its heading reads "Chore Chart" — distinct from the
    // palette entry and canvas module label of the same name).
    await expect(page.getByRole('heading', { name: 'Chore Chart', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Add Member' }).click();
    await page.getByPlaceholder('Name...').fill('Robin');

    // The debounced save PUTs to /api/chores/data once the member list changes.
    const saved = page.waitForResponse(
      (r) => r.url().includes('/api/chores/data') && r.request().method() === 'PUT' && r.ok(),
    );
    // The form's submit button shares the "Add Member" label; the form one is
    // the second occurrence (the column trigger is now hidden while the form
    // is open, so a fresh lookup resolves to the submit button).
    await page.getByRole('button', { name: 'Add Member' }).click();
    await saved;

    await expect
      .poll(async () => {
        const res = await request.get('/api/chores/data');
        const data = await res.json();
        return (data.members as Array<{ name: string }>).map((m) => m.name);
      })
      .toContain('Robin');
  });
});

test.describe('HolidayPickerModal (countdown module config)', () => {
  // The picker fetches the country list and per-year holidays client-side from
  // /api/holidays (a proxy for the Nager.Date service); stubbing at the browser
  // boundary keeps the proxy's own upstream fetch from firing.
  test('picking a holiday adds a recurring event to the countdown config', async ({ page, request }) => {
    const handle = await stubModuleData(page, { blockExternal: true });
    await page.route('**/api/holidays*', (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.has('countries')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ countryCode: 'US', name: 'United States' }]),
        });
      }
      // Same list for both the current-year and next-year fetches; the modal
      // dedupes by title. A far-future date keeps it in the upcoming window.
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'h-e2e', title: 'E2E Holiday', start: '2099-12-25' }]),
      });
    });

    await selectModule(page, request, buildModuleInstance('countdown'));
    await page.getByRole('button', { name: 'Holidays...' }).click();
    await expect(page.getByRole('heading', { name: 'Add Holidays' })).toBeVisible();

    // Selecting a country triggers the holiday fetch; its rows are <label>s
    // wrapping a checkbox + the holiday title.
    await page.getByLabel('Country').selectOption('US');
    const row = page.locator('label', { hasText: 'E2E Holiday' });
    await expect(row).toBeVisible();

    await autosaved(page, async () => {
      await row.getByRole('checkbox').click();
      await page.getByRole('button', { name: 'Add 1 Holiday' }).click();
    });

    const events = (await moduleConfig(request, 'countdown')).events as Array<{ name: string; source?: string }>;
    expect(events.some((e) => e.name === 'E2E Holiday' && e.source === 'holiday')).toBe(true);
    expect(handle.externalHits).toEqual([]);
  });
});

test.describe('Meal-planner editor modal', () => {
  // The /remote side is covered by e2e/remote/meals-planning.spec.ts; this drives
  // the editor-side modal (opened from the meal-planner module's config) and
  // asserts the same meals.json round-trip via /api/meals/data.
  async function openMealModal(page: import('@playwright/test').Page, request: import('@playwright/test').APIRequestContext) {
    await selectModule(page, request, buildModuleInstance('meal-planner'));
    await page.getByRole('button', { name: 'Edit Meal Plan' }).click();
    await expect(page.getByRole('heading', { name: 'Meal Planner', exact: true })).toBeVisible();
  }

  async function savedMealNames(request: import('@playwright/test').APIRequestContext): Promise<string[]> {
    const res = await request.get('/api/meals/data');
    const data = await res.json();
    return (data.savedMeals as Array<{ name: string }>).map((m) => m.name);
  }

  test('adding a meal persists it to meals.json', async ({ page, request }) => {
    await seedMeals(request, { savedMeals: [], plan: [], force: true });
    await openMealModal(page, request);

    // Library tab is default; "Add New Meal" creates a local pending meal and
    // switches to the Detail tab, where "Save Changes" is the first persist.
    const saved = page.waitForResponse(
      (r) => r.url().includes('/api/meals/data') && r.request().method() === 'PUT' && r.ok(),
    );
    await page.getByRole('button', { name: '+ Add New Meal' }).click();
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await saved;

    // The pending meal persists under its default name.
    await expect.poll(() => savedMealNames(request)).toContain('New Meal');
  });

  test('editing a saved meal round-trips the new name', async ({ page, request }) => {
    await seedMeals(request, {
      savedMeals: [{ id: 'meal-1', name: 'Pasta', emoji: '🍝' }],
      plan: [],
      force: true,
    });
    await openMealModal(page, request);

    // Open the meal from the library list, rename it in Detail, and save.
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Pasta', { exact: true }).click();
    const nameInput = dialog.locator('input[type="text"]:not([placeholder])').first();
    await expect(nameInput).toHaveValue('Pasta');
    await nameInput.fill('Pasta Bake');

    const saved = page.waitForResponse(
      (r) => r.url().includes('/api/meals/data') && r.request().method() === 'PUT' && r.ok(),
    );
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await saved;

    await expect.poll(() => savedMealNames(request)).toContain('Pasta Bake');
  });
});
