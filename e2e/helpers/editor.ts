import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { getConfig, putConfig } from './api';
import { baseConfig, makeScreen } from './config-fixtures';
import { matrixSettings } from './module-fixtures';
import type { ModuleInstance, ModuleType } from '@/types/config';

/**
 * Shared editor E2E helpers. Extracted from config-editing.spec.ts once a
 * handful of settings specs (profiles, per-display subtabs, visibility
 * conditions, defaults pages) needed the same autosave-and-assert dance.
 *
 * Config-section fields use the Labeled* UI primitives, which nest their
 * control inside a `<label>` (implicit association), so Playwright's
 * getByLabel / getByRole reach them without new test hooks.
 */

/**
 * PUT a single-module config, open the editor, and select the module so its
 * PropertyPanel Config accordion (open by default) renders its fields.
 */
export async function selectModule(page: Page, request: APIRequestContext, mod: ModuleInstance): Promise<void> {
  await putConfig(request, baseConfig({
    screens: [makeScreen('screen-1', 'Screen 1', [mod])],
    settings: matrixSettings(),
  }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await page.locator(`[data-module-id="${mod.id}"]`).click();
}

/** Run `action`, then wait for the debounced autosave PUT (/api/config) to land. */
export async function autosaved(page: Page, action: () => Promise<void>): Promise<void> {
  const saved = page.waitForResponse(
    (r) => r.url().includes('/api/config') && r.request().method() === 'PUT' && r.ok(),
  );
  await action();
  await saved;
}

/** Read back the persisted config for the first screen's module of `type`. */
export async function moduleConfig(request: APIRequestContext, type: ModuleType): Promise<Record<string, unknown>> {
  const config = await getConfig(request);
  return config.screens[0].modules.find((m) => m.type === type)!.config as Record<string, unknown>;
}

/**
 * Switch the editor canvas to another display through the toolbar picker.
 *
 * The picker is a real dropdown (it used to be an invisible `<select>`
 * stretched over a styled pill), so tests open it and click the row rather
 * than calling `selectOption`.
 */
export async function switchDisplay(page: Page, displayName: string): Promise<void> {
  await page.getByTestId('display-switcher').click();
  const menu = page.getByTestId('display-switcher-menu');
  await expect(menu).toBeVisible();
  await expectPainted(menu);
  await menu.getByRole('menuitem', { name: new RegExp(displayName) }).click();
  await expect(menu).toHaveCount(0);
}

/**
 * Assert an element is actually painted where it says it is.
 *
 * `toBeVisible` only checks the box is non-empty, so it passes for an element
 * clipped away by an `overflow: hidden` ancestor — which is exactly how the
 * display switcher's menu shipped invisible while its tests were green. This
 * hit-tests the element's own centre point instead.
 */
export async function expectPainted(locator: Locator): Promise<void> {
  const hit = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!at && el.contains(at);
  });
  expect(hit, 'element is not painted at its own centre (clipped or covered)').toBe(true);
}

/**
 * Drag a palette item onto the canvas — the only pointer way to place a
 * module (a plain click does nothing; Enter/Space is the keyboard path).
 *
 * `at` is a fraction of the canvas box, so callers can drop two modules in
 * different places without knowing the canvas geometry.
 */
export async function dragPaletteToCanvas(
  page: Page,
  moduleType: string,
  at: { x: number; y: number } = { x: 0.5, y: 0.5 },
): Promise<void> {
  const item = page.getByTestId(`palette-${moduleType}`);
  await expect(item).toBeVisible();
  const from = (await item.boundingBox())!;
  const to = (await page.getByTestId('editor-canvas').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // dnd-kit's PointerSensor needs >5px of travel before activating, so move in steps.
  await page.mouse.move(to.x + to.width * at.x, to.y + to.height * at.y, { steps: 15 });
  await page.mouse.up();
}
