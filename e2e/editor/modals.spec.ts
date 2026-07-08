import path from 'node:path';
import { test, expect } from '../fixtures';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule, choreChartModule } from '../helpers/config-fixtures';
import { autosaved } from '../helpers/editor';

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
