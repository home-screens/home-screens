import { expect, type Page, type APIRequestContext, type Locator } from '@playwright/test';
import type { ScreenConfiguration } from '@/types/config';
import { putConfig } from './api';

/**
 * PUT a config, navigate to a display route, and wait for at least one module
 * wrapper to appear. Collapses the three-line setup every module spec repeats.
 *
 * The display module wrapper carries `data-module-id` / `data-module-type`
 * (ScreenRenderer.tsx), so `moduleLocator` can address a rendered module even
 * when it has no distinctive text (shape, divider, icon, image, qr-code).
 *
 * `path` defaults to the legacy `/display` route; pass `/display/<id>` to
 * target a specific display node.
 */
export async function renderOnDisplay(
  page: Page,
  request: APIRequestContext,
  config: ScreenConfiguration,
  path = '/display',
): Promise<DisplayHandle> {
  await putConfig(request, config);
  await page.goto(path);
  await expect(page.locator('[data-module-type]').first()).toBeVisible();
  return {
    module(typeOrId: string): Locator {
      // Match on type first (the common case); callers wanting a specific
      // instance pass its id and we fall back to the id selector.
      const byType = page.locator(`[data-module-type="${typeOrId}"]`);
      return byType.or(page.locator(`[data-module-id="${typeOrId}"]`)).first();
    },
  };
}

export interface DisplayHandle {
  /** Locator for a rendered module by its `type` (first match) or exact `id`. */
  module(typeOrId: string): Locator;
}
