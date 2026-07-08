import { expect, type APIRequestContext, type Page } from '@playwright/test';
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
