import { expect, type APIRequestContext } from '@playwright/test';
import type { ScreenConfiguration } from '@/types/config';

export async function getConfig(request: APIRequestContext): Promise<ScreenConfiguration> {
  const res = await request.get('/api/config');
  expect(res.ok()).toBe(true);
  return res.json();
}

export async function putConfig(request: APIRequestContext, config: ScreenConfiguration): Promise<void> {
  const res = await request.put('/api/config', { data: config });
  expect(res.ok()).toBe(true);
}

/**
 * Simulate a display heartbeat by posting a status report the way a Pi kiosk
 * does. requireDisplayAuth is a no-op while auth is disabled, so no token is
 * needed. The remote control surface gates its screen-nav buttons on a live
 * heartbeat (screenCount > 0 and a non-null status), so a spec that clicks
 * "Next screen" must seed one first. With no `?display=` param and no body
 * displayId this lands in the legacy `__default__` slot the single-display
 * remote polls.
 */
export async function postHeartbeat(
  request: APIRequestContext,
  overrides: { screenCount?: number; currentIndex?: number } = {},
): Promise<void> {
  const { screenCount = 2, currentIndex = 0 } = overrides;
  const res = await request.post('/api/display/status', {
    data: {
      currentScreen: { index: currentIndex, id: `screen-${currentIndex}`, name: `Screen ${currentIndex}` },
      screenCount,
      activeProfile: null,
      displayState: 'active',
      timestamp: Date.now(),
    },
  });
  expect(res.ok()).toBe(true);
}
