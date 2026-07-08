import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
import type { ModuleInstance, ModuleType } from '@/types/config';

/**
 * PropertyPanel config editing. Config-section fields use the Labeled* UI
 * primitives, which nest their control inside a `<label>` (implicit
 * association), so Playwright's getByLabel / getByRole reach them without new
 * test hooks. Each test edits one field, waits out the 800ms autosave
 * (PUT /api/config), then asserts both the persisted config and — where the
 * field maps to visible output — the editor preview re-rendered.
 */

async function selectModule(page: Page, request: APIRequestContext, mod: ModuleInstance): Promise<void> {
  await putConfig(request, baseConfig({
    screens: [makeScreen('screen-1', 'Screen 1', [mod])],
    settings: matrixSettings(),
  }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await page.locator(`[data-module-id="${mod.id}"]`).click();
  // The Config accordion is open by default; its fields render immediately.
}

/** Run `action`, then wait for the debounced autosave PUT to land. */
async function autosaved(page: Page, action: () => Promise<void>): Promise<void> {
  const saved = page.waitForResponse(
    (r) => r.url().includes('/api/config') && r.request().method() === 'PUT' && r.ok(),
  );
  await action();
  await saved;
}

async function moduleConfig(request: APIRequestContext, type: ModuleType): Promise<Record<string, unknown>> {
  const config = await getConfig(request);
  return config.screens[0].modules.find((m) => m.type === type)!.config as Record<string, unknown>;
}

test('text: editing Content persists and re-renders the preview', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('text', { content: 'ORIGINAL' }));

  await autosaved(page, async () => {
    await page.getByLabel('Content').fill('EDITED VIA PANEL');
  });

  expect((await moduleConfig(request, 'text')).content).toBe('EDITED VIA PANEL');
  await expect(page.locator('[data-module-id="text-1"]').getByText('EDITED VIA PANEL')).toBeVisible();
});

test('greeting: editing Name persists and re-renders the preview', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('greeting', { name: 'ORIGINAL' }));

  await autosaved(page, async () => {
    await page.getByLabel('Name').fill('PANELNAME');
  });

  expect((await moduleConfig(request, 'greeting')).name).toBe('PANELNAME');
  await expect(page.locator('[data-module-id="greeting-1"]')).toContainText('PANELNAME');
});

// ViewSelect renders <label><span>View</span><select/></label>. Its span text
// is exactly "View", which also prefixes "View Mode" elsewhere — so match the
// label whose span is exactly "View" and drill to its <select>.
function viewSelect(page: Page) {
  return page
    .locator('label')
    .filter({ has: page.getByText('View', { exact: true }) })
    .locator('select');
}

test('clock: switching View persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('clock'));

  await autosaved(page, async () => {
    await viewSelect(page).selectOption('digital');
  });

  expect((await moduleConfig(request, 'clock')).view).toBe('digital');
});

test('date: switching View persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('date'));

  await autosaved(page, async () => {
    await viewSelect(page).selectOption('banner');
  });

  expect((await moduleConfig(request, 'date')).view).toBe('banner');
});

test('calendar: switching View Mode persists', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('calendar'));

  await autosaved(page, async () => {
    await page.getByLabel('View Mode').selectOption('month');
  });

  expect((await moduleConfig(request, 'calendar')).viewMode).toBe('month');
});

test('weather: toggling Feels Like persists', async ({ page, request }) => {
  // Registry default has showFeelsLike: true — one click flips it off.
  await selectModule(page, request, buildModuleInstance('weather'));

  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Feels Like' }).click();
  });

  expect((await moduleConfig(request, 'weather')).showFeelsLike).toBe(false);
});

test('shared: the Show-on-display toggle disables a module and dims the preview', async ({ page, request }) => {
  await selectModule(page, request, buildModuleInstance('text', { content: 'DIM ME' }));

  // The enabled toggle lives in the collapsed Visibility accordion.
  await page.getByRole('button', { name: 'Visibility' }).click();
  const toggle = page.getByLabel('Show on display');
  await expect(toggle).toBeVisible();

  await autosaved(page, async () => {
    await toggle.uncheck();
  });

  const config = await getConfig(request);
  expect(config.screens[0].modules[0].enabled).toBe(false);
  // Disabled modules render dimmed + grayscaled in the editor (DraggableModule).
  await expect(page.locator('[data-module-id="text-1"] .grayscale')).toBeVisible();
});
