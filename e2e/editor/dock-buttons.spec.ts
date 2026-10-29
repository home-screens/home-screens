import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { autosaved } from '../helpers/editor';

/**
 * The dock's button list in the property panel: the switch that makes the
 * list the dock's own (seeded with the switched-on screens), renaming a
 * tile, adding a screen from "Not in the dock", dropping one, and the line
 * that says how many buttons fit.
 */

const DOCK_ID = 'display-control-1';

function config() {
  return baseConfig({
    screens: [
      makeScreen('home', 'Home', [
        textModule('HOME ONLY', { position: { x: 100, y: 100 } }),
        { ...buildModuleInstance('display-control', { layout: 'dock' }), position: { x: 100, y: 1600 }, size: { w: 880, h: 200 } },
      ]),
      makeScreen('weather', 'Weather', [textModule('PAGE 2')]),
      makeScreen('photos', 'Photos', [textModule('PAGE 3')], { enabled: false }),
    ],
  });
}

async function dockButtons(request: Parameters<typeof getConfig>[0]) {
  const cfg = await getConfig(request);
  return cfg.screens[0].modules.find((m) => m.id === DOCK_ID)!.config.dockButtons as Array<Record<string, unknown>> | undefined;
}

function list(page: Page) {
  return page.locator('[data-field-id="dockButtons"]');
}

test('choosing which screens get a button seeds the list, and the rows rename, add and drop buttons', async ({ page, request }) => {
  await putConfig(request, config());
  await page.goto('/editor?screen=home');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await page.locator(`[data-module-id="${DOCK_ID}"]`).click();

  // Every screen: the hint speaks for the whole display.
  await expect(page.getByTestId('dock-fit-hint')).toBeVisible();
  const choose = list(page).getByRole('switch', { name: 'Choose which screens get a button' });
  await expect(choose).toHaveAttribute('aria-checked', 'false');

  await autosaved(page, async () => { await choose.click(); });
  // Seeded with the switched-on screens as they are; Photos (off) waits below.
  expect(await dockButtons(request)).toEqual([{ screenId: 'home' }, { screenId: 'weather' }]);
  await expect(list(page).locator('li[data-on="true"]')).toHaveCount(2);
  const photosRow = list(page).locator('li[data-screen-id="photos"]');
  await expect(photosRow).toHaveAttribute('data-on', 'false');
  await expect(photosRow).toContainText('Off');

  // Rename Home's tile.
  await page.getByRole('button', { name: 'Edit Home' }).click();
  await autosaved(page, async () => {
    await page.getByLabel('Name on the tile').fill('Start');
  });
  expect((await dockButtons(request))![0]).toEqual({ screenId: 'home', label: 'Start' });
  await expect(list(page).locator('li[data-screen-id="home"]')).toContainText('Start');
  // The wall's dock on the canvas follows.
  await expect(page.locator(`[data-module-id="${DOCK_ID}"] button[aria-label="Go to Start"]`)).toBeVisible();

  // A palette swatch sets the colour; "Dock's own" clears it.
  await autosaved(page, async () => {
    await page.getByRole('button', { name: '#ef4444' }).click();
  });
  expect((await dockButtons(request))![0].color).toBe('#ef4444');
  await autosaved(page, async () => {
    await page.getByRole('button', { name: "Dock's own" }).click();
  });
  expect((await dockButtons(request))![0].color).toBeUndefined();

  // Add Photos from below, then drop Weather.
  await autosaved(page, async () => {
    await photosRow.getByRole('switch', { name: 'Photos' }).click();
  });
  expect((await dockButtons(request))!.map((b) => b.screenId)).toEqual(['home', 'weather', 'photos']);
  await autosaved(page, async () => {
    await list(page).locator('li[data-screen-id="weather"]').getByRole('switch', { name: 'Weather' }).click();
  });
  expect((await dockButtons(request))!.map((b) => b.screenId)).toEqual(['home', 'photos']);
  await expect(list(page).locator('li[data-screen-id="weather"]')).toHaveAttribute('data-on', 'false');

  // Back to every screen.
  await autosaved(page, async () => { await choose.click(); });
  expect(await dockButtons(request)).toBeUndefined();
});

test('the fit line warns when more buttons are chosen than the module holds', async ({ page, request }) => {
  const cfg = config();
  // A box this small holds a few icons and no names.
  const dock = cfg.screens[0].modules.find((m) => m.id === DOCK_ID)!;
  dock.size = { w: 260, h: 120 };
  dock.config = { ...dock.config, dockButtons: [{ screenId: 'home' }, { screenId: 'weather' }, { screenId: 'photos' }] };
  for (let i = 0; i < 6; i += 1) {
    cfg.screens.push(makeScreen(`s${i}`, `Screen ${i}`, [textModule(`PAGE S${i}`)]));
    (dock.config.dockButtons as Array<{ screenId: string }>).push({ screenId: `s${i}` });
  }
  await putConfig(request, cfg);
  await page.goto('/editor?screen=home');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await page.locator(`[data-module-id="${DOCK_ID}"]`).click();

  const hint = page.getByTestId('dock-fit-hint');
  await expect(hint).toHaveAttribute('data-warn', 'true');
  await expect(hint).toContainText('so the dock scrolls');
});
