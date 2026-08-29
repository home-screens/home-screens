import { readFile } from 'node:fs/promises';
import { test, expect } from '../fixtures';
import { putConfig, getConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';

/**
 * Editor › Defaults › Data › Share Layout. Exercises the full round trip of
 * LayoutExportModal (subset export → browser download) and LayoutImportModal
 * (file upload → add-mode merge), driven entirely through the real UI rather
 * than the store actions those specs (src/lib/__tests__/layout-export.test.ts)
 * cover in isolation.
 *
 * A subset export must (a) write only the selected screens into the downloaded
 * JSON and (b) re-import as exactly that subset — the untouched screens keep
 * their original count, proving nothing else rode along.
 */

const DATA_PAGE = '/editor/settings?section=defaults&page=data';

test('exporting a screen subset downloads only those screens and re-imports them', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [
      makeScreen('s-alpha', 'Alpha', [textModule('ALPHA CONTENT')]),
      makeScreen('s-bravo', 'Bravo', [textModule('BRAVO CONTENT')]),
      makeScreen('s-charlie', 'Charlie', [textModule('CHARLIE CONTENT')]),
    ],
  }));
  await page.goto(DATA_PAGE);

  // Open the export modal (primary "Export Layout" button on the Share section).
  await page.getByRole('button', { name: 'Export Layout' }).click();
  await expect(page.getByRole('heading', { name: 'Export Layout' })).toBeVisible();

  // Every screen starts selected; deselect Bravo and Charlie so only Alpha ships.
  await page.locator('label', { hasText: 'Bravo' }).getByRole('checkbox').uncheck();
  await page.locator('label', { hasText: 'Charlie' }).getByRole('checkbox').uncheck();

  // The modal's "Export" button clicks a blob-URL anchor → a browser download.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloadPromise;

  const exportedJson = await readFile(await download.path(), 'utf8');
  const exported = JSON.parse(exportedJson) as { screens: { name: string }[] };
  expect(exported.screens.map((s) => s.name)).toEqual(['Alpha']);

  // Re-import the produced file through the hidden layout <input>. The first
  // .json file input is the layout importer (the second is the full-backup
  // restorer). Feeding the buffer directly avoids a temp file on disk.
  const layoutInput = page.locator('input[type="file"][accept=".json"]').first();
  await layoutInput.setInputFiles({
    name: 'home-screens-my-layout.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exportedJson),
  });

  // The import modal previews the incoming subset; confirm the add-mode merge.
  await expect(page.getByRole('heading', { name: 'Import Layout' })).toBeVisible();
  await page.getByRole('button', { name: 'Import', exact: true }).click();

  // Add mode appends the one imported screen (deduped name) and leaves the
  // originals untouched — 4 screens total, two of them named for Alpha, and
  // Bravo/Charlie still singletons (nothing extra leaked into the export).
  await expect.poll(async () => (await getConfig(request)).screens.length).toBe(4);
  const names = (await getConfig(request)).screens.map((s) => s.name);
  expect(names.filter((n) => n.startsWith('Alpha')).length).toBe(2);
  expect(names.filter((n) => n === 'Bravo').length).toBe(1);
  expect(names.filter((n) => n === 'Charlie').length).toBe(1);
});

/**
 * The same import path, reached from the screen tabs "+" menu instead of the
 * settings page. A single-screen file must land as one extra tab on the active
 * display without disturbing the screens already there.
 */
test('the add-screen menu imports a single screen from a file without replacing existing screens', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [
      makeScreen('s-alpha', 'Alpha', [textModule('ALPHA CONTENT')]),
      makeScreen('s-bravo', 'Bravo', [textModule('BRAVO CONTENT')]),
    ],
  }));
  await page.goto('/editor');

  const singleScreenLayout = {
    _type: 'home-screens-layout',
    _version: 1,
    metadata: {
      name: 'Guest Screen',
      exportedAt: '2026-01-01T00:00:00.000Z',
      screenCount: 1,
      moduleCount: 1,
      sourceDisplay: { width: 1080, height: 1920 },
    },
    screens: [makeScreen('s-guest', 'Guest', [textModule('GUEST CONTENT')])],
    visual: { rotationIntervalMs: 45000 },
  };

  await page.getByRole('button', { name: 'Add screen' }).click();
  await page.getByRole('button', { name: 'From File…' }).click();

  await page.locator('input[type="file"][accept=".json"]').first().setInputFiles({
    name: 'guest-screen.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(singleScreenLayout)),
  });

  await expect(page.getByRole('heading', { name: 'Import Layout' })).toBeVisible();
  await page.getByRole('button', { name: 'Import', exact: true }).click();

  await expect.poll(async () => (await getConfig(request)).screens.length).toBe(3);
  const names = (await getConfig(request)).screens.map((s) => s.name);
  expect(names).toEqual(['Alpha', 'Bravo', 'Guest']);
});
