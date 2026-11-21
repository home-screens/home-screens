import { expect, type Page, type APIRequestContext, type Locator } from '@playwright/test';
import type { ScreenConfiguration } from '@/types/config';
import { putConfig } from './api';

/**
 * PUT a config, navigate to a display route, and wait for at least one module
 * wrapper to appear. Collapses the three-line setup every module spec repeats.
 *
 * The display module wrapper carries `data-module-id` / `data-module-type`
 * (ScreenRenderer.tsx), so the handle's `module()` can address a rendered module even
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
  opts: {
    /**
     * `attached` for a display that may already be asleep when it comes up:
     * a sleeping canvas is kept mounted but not drawn (`content-visibility:
     * hidden`), which Playwright reads as not visible.
     */
    ready?: 'visible' | 'attached';
  } = {},
): Promise<DisplayHandle> {
  await putConfig(request, config);
  await page.goto(path);
  const first = page.locator('[data-module-type]').first();
  if (opts.ready === 'attached') await expect(first).toBeAttached();
  else await expect(first).toBeVisible();
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

/** Resolves after `count` more heartbeats (drains of `/api/display/commands`) have been answered. */
export async function waitForBeats(page: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await page.waitForResponse((r) => new URL(r.url()).pathname === '/api/display/commands', { timeout: 10_000 });
  }
}

export interface DisplayCommand {
  type: string;
  payload?: Record<string, unknown>;
}

/**
 * Everything the hub queued for one display (or the single wall when
 * `display` is omitted). The read drains the queue, so the next look starts
 * empty.
 */
export async function drainCommands(request: APIRequestContext, display?: string): Promise<DisplayCommand[]> {
  const res = await request.get(display ? `/api/display/commands?display=${display}` : '/api/display/commands');
  return (await res.json() as { commands: DisplayCommand[] }).commands;
}

/**
 * Post a status heartbeat into a named display's own slot, the way that
 * display's client does. `clientId` marks one tab, `viewport` adds the
 * browser stats a tab reports. For the single wall's slot and the facts the
 * phone confirms against, use `postHeartbeat`.
 */
export async function postDisplayStatus(
  request: APIRequestContext,
  display: string,
  opts: {
    displayState?: 'active' | 'dimmed' | 'asleep';
    screenCount?: number;
    currentIndex?: number;
    /** Name of the current screen; `Screen <index>` when omitted. */
    name?: string;
    clientId?: string;
    viewport?: { width: number; height: number };
  } = {},
): Promise<void> {
  const { displayState = 'active', screenCount = 2, currentIndex = 0, name = `Screen ${currentIndex}`, clientId, viewport } = opts;
  const res = await request.post(`/api/display/status?display=${display}`, {
    data: {
      displayId: display,
      ...(clientId ? { clientId } : {}),
      currentScreen: { index: currentIndex, id: `screen-${currentIndex}`, name },
      screenCount,
      activeProfile: null,
      displayState,
      timestamp: Date.now(),
      ...(viewport
        ? {
            browserStats: {
              userAgent: 'e2e-kiosk',
              chromiumVersion: '999',
              viewportWidth: viewport.width,
              viewportHeight: viewport.height,
              devicePixelRatio: 1,
              hardwareConcurrency: 4,
              deviceMemory: null,
              webglRenderer: null,
              reportedAt: new Date().toISOString(),
            },
          }
        : {}),
    },
  });
  expect(res.ok()).toBe(true);
}
