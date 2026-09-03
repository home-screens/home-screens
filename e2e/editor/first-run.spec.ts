import { test, expect } from '../fixtures';
import { clearSecrets, getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { buildModuleInstance, MATRIX_LOCATION } from '../helpers/module-fixtures';
import { stubModuleData } from '../helpers/stubs';
import { dragPaletteToCanvas } from '../helpers/editor';
import type { Page } from '@playwright/test';

/**
 * The first ten minutes in the editor: an empty screen must explain itself,
 * a module must land where it is dragged, the template catalog must be one
 * click away, and a location-dependent module must lead to the Location page.
 */

const EMPTY_INSTALL = () => baseConfig({ screens: [makeScreen('default', 'Screen 1', [])] });

async function openEditor(page: Page) {
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
}

test.describe('empty screen', () => {
  test('shows a placeholder inside the frame and hides it once a module exists', async ({ page, request }) => {
    await putConfig(request, EMPTY_INSTALL());
    await openEditor(page);
    const placeholder = page.getByTestId('empty-screen-placeholder');
    await expect(placeholder).toBeVisible();
    await expect(placeholder.getByText('This screen is empty')).toBeVisible();

    // Modules are placed by dragging them onto the screen.
    await dragPaletteToCanvas(page, 'clock');
    await expect(placeholder).toBeHidden();
    await expect(page.locator('[data-module-id]')).toHaveCount(1);
  });

  test('"Choose a template" replaces the empty screen instead of leaving it behind', async ({ page, request }) => {
    await putConfig(request, EMPTY_INSTALL());
    await openEditor(page);
    await page.getByTestId('empty-screen-placeholder').getByRole('button', { name: 'Choose a template' }).click();
    await expect(page.getByRole('heading', { name: 'Templates' })).toBeVisible();
    await page.getByRole('button', { name: /Minimal Clock/ }).click();
    await expect(page.getByRole('heading', { name: 'Import layout' })).toBeVisible();
    const saved = page.waitForResponse((r) => r.url().includes('/api/config') && r.request().method() === 'PUT' && r.ok());
    await page.getByRole('button', { name: 'Add these screens', exact: true }).click();
    await saved;

    const config = await getConfig(request);
    // One screen: the template's, not the template's plus the blank "Screen 1".
    expect(config.screens).toHaveLength(1);
    expect(config.screens[0].modules.some((m) => m.type === 'clock')).toBe(true);
    expect(config.screens[0].id).not.toBe('default');
  });
});

test.describe('palette drag-to-add', () => {
  test('a keyboard add lands at the next free spot, never on top of the previous module', async ({ page, request }) => {
    await putConfig(request, EMPTY_INSTALL());
    await openEditor(page);
    const saved = () => page.waitForResponse((r) => r.url().includes('/api/config') && r.request().method() === 'PUT' && r.ok());

    // Enter on a focused palette item is the keyboard equivalent of a drag
    // (drag-and-drop is mouse-only), and it is what places at the next free
    // spot rather than at a pointer position.
    let wait = saved();
    await page.getByTestId('palette-clock').press('Enter');
    await wait;
    wait = saved();
    await page.getByTestId('palette-clock').press('Enter');
    await wait;

    const config = await getConfig(request);
    const [a, b] = config.screens[0].modules;
    expect(config.screens[0].modules).toHaveLength(2);
    const overlaps =
      a.position.x < b.position.x + b.size.w && a.position.x + a.size.w > b.position.x &&
      a.position.y < b.position.y + b.size.h && a.position.y + a.size.h > b.position.y;
    expect(overlaps).toBe(false);
    // The new module is selected, so the property panel opens on it.
    await expect(page.getByRole('heading', { name: /Clock/ })).toBeVisible();
  });

  test('Enter on a focused palette item adds it too', async ({ page, request }) => {
    await putConfig(request, EMPTY_INSTALL());
    await openEditor(page);
    await page.getByTestId('palette-text').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-module-id]')).toHaveCount(1);
  });
});

test.describe('first-run checklist', () => {
  test('shows while every screen is empty, reflects what is configured, and stays hidden once dismissed', async ({ page, request }) => {
    await putConfig(request, EMPTY_INSTALL());
    await openEditor(page);
    const checklist = page.getByTestId('first-run-checklist');
    await expect(checklist).toBeVisible();
    await expect(checklist.getByText('Set your location')).toBeVisible();
    await expect(checklist.getByRole('link', { name: 'Open Location & language' }))
      .toHaveAttribute('href', '/editor/settings?section=defaults&page=location');
    await expect(checklist.getByRole('link', { name: 'See the phone addresses' }))
      .toHaveAttribute('href', '/editor/settings?section=defaults&page=phone');
    await expect(checklist.getByRole('link', { name: 'Open Security' }))
      .toHaveAttribute('href', '/editor/settings?section=defaults&page=security');

    // A configured location is ticked off: the link disappears.
    await putConfig(request, baseConfig({ screens: [makeScreen('default', 'Screen 1', [])], settings: MATRIX_LOCATION }));
    await page.reload();
    await expect(page.getByTestId('editor-canvas')).toBeVisible();
    await expect(page.getByTestId('first-run-checklist').getByRole('link', { name: 'Open Location & language' })).toHaveCount(0);

    await page.getByTestId('first-run-checklist').getByRole('button', { name: 'Hide this checklist' }).click();
    await expect(page.getByTestId('first-run-checklist')).toBeHidden();
    await page.reload();
    await expect(page.getByTestId('editor-canvas')).toBeVisible();
    await expect(page.getByTestId('first-run-checklist')).toBeHidden();
  });

  test('is not shown once a screen has content', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    await openEditor(page);
    await expect(page.getByTestId('first-run-checklist')).toHaveCount(0);
  });
});

test.describe('location-dependent modules', () => {
  test('the weather preview links to the Location page while no location is set', async ({ page, request }) => {
    await stubModuleData(page);
    const weather = buildModuleInstance('weather');
    await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [weather])] }));
    await openEditor(page);
    const link = page.getByTestId('location-settings-link');
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL(/\/editor\/settings\?section=defaults&page=location/);
    await expect(page.getByRole('heading', { name: 'Location & language' })).toBeVisible();
  });

  test('the sunrise module preview links too, and the wall shows plain text', async ({ page, request }) => {
    await stubModuleData(page);
    await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [buildModuleInstance('sunrise-sunset')])] }));
    await openEditor(page);
    await expect(page.getByTestId('location-settings-link')).toBeVisible();

    await page.goto('/display');
    await expect(page.getByText('Location not configured')).toBeVisible();
    await expect(page.getByTestId('location-settings-link')).toHaveCount(0);
  });

  test('the config section opens with a location row that says what is missing', async ({ page, request }) => {
    await stubModuleData(page);
    const weather = buildModuleInstance('weather');
    await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [weather])] }));
    await openEditor(page);
    await page.locator(`[data-module-id="${weather.id}"]`).click();
    const row = page.getByTestId('location-status-row');
    await expect(row.getByText('This module needs your location.')).toBeVisible();
    await expect(row.getByRole('link', { name: 'Set your location' }))
      .toHaveAttribute('href', '/editor/settings?section=defaults&page=location');
  });

  test('the location row shows the configured place once set', async ({ page, request }) => {
    await stubModuleData(page);
    const moon = buildModuleInstance('moon-phase');
    await putConfig(request, baseConfig({
      screens: [makeScreen('s1', 'S1', [moon])],
      settings: { ...MATRIX_LOCATION, locationName: 'Prior Lake, MN' },
    }));
    await openEditor(page);
    await page.locator(`[data-module-id="${moon.id}"]`).click();
    await expect(page.getByTestId('location-status-row')).toHaveText('Location: Prior Lake, MN');
  });

  test('a keyed weather provider without a key shows an "Add API key" link', async ({ page, request }) => {
    await stubModuleData(page);
    await clearSecrets(request, ['openweathermap_key']);
    const weather = buildModuleInstance('weather', { provider: 'openweathermap' });
    await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [weather])], settings: MATRIX_LOCATION }));
    await openEditor(page);
    await page.locator(`[data-module-id="${weather.id}"]`).click();
    const row = page.getByTestId('weather-api-key-row');
    await expect(row.getByText('This weather provider needs an API key.')).toBeVisible();
    // Weather provider keys live on the Weather page, not under API keys.
    await expect(row.getByRole('link', { name: 'Add API key' }))
      .toHaveAttribute('href', '/editor/settings?section=defaults&page=weather');
  });
});

test.describe('settings landing', () => {
  test('a deep link into Settings does not spend the one-time Location landing', async ({ page, request }) => {
    await putConfig(request, EMPTY_INSTALL());
    // The checklist's "Open the phone view" link is a deep link, not a bare URL.
    await page.goto('/editor/settings?section=defaults&page=phone');
    await expect(page.getByRole('heading', { name: 'On your phone' })).toBeVisible();
    await page.goto('/editor/settings');
    await page.waitForURL(/section=defaults&page=location/);
    await expect(page.getByRole('heading', { name: 'Location & language' })).toBeVisible();
  });

  test('a bare /editor/settings lands on Location while the location is unset', async ({ page, request }) => {
    await putConfig(request, EMPTY_INSTALL());
    await page.goto('/editor/settings');
    await expect(page.getByRole('heading', { name: 'Location & language' })).toBeVisible();
    await page.waitForURL(/section=defaults&page=location/);
    // The lookup box is labelled and sits above the timezone control.
    const query = page.getByLabel('Your town or zip code');
    await expect(query).toBeVisible();
    const queryBox = await query.boundingBox();
    const tzBox = await page.getByLabel('Timezone').boundingBox();
    expect(queryBox!.y).toBeLessThan(tzBox!.y);
  });

  test('lands on Screen once a location is set, and an explicit page always wins', async ({ page, request }) => {
    await putConfig(request, baseConfig({ settings: MATRIX_LOCATION }));
    await page.goto('/editor/settings');
    await expect(page.getByRole('heading', { name: 'Screen defaults' })).toBeVisible();

    await putConfig(request, EMPTY_INSTALL());
    await page.goto('/editor/settings?section=defaults&page=system');
    await expect(page.getByRole('heading', { name: 'Version', exact: true })).toBeVisible();
  });
});
