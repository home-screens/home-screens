import { test, expect } from '../fixtures';
import type { APIRequestContext } from '@playwright/test';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';

/**
 * Coverage for the /remote DisplayHero panel (DisplayHero.tsx): it renders the
 * live screen index ("Screen X of Y") and a state badge (Active / Dimmed /
 * Asleep) driven purely by the display's last-posted status heartbeat.
 *
 * Each test targets its own named display so its heartbeat lands in that
 * display's statusMap slot. A lingering asleep/dimmed status in the legacy
 * `__default__` slot would poison other specs sharing the worker, so — like the
 * wake test in remote.spec.ts — these never post non-active states to it.
 */

/** Post a status heartbeat with an explicit displayState into a named display's slot. */
async function postStatus(
  request: APIRequestContext,
  display: string,
  overrides: { displayState?: 'active' | 'dimmed' | 'asleep'; screenCount?: number; currentIndex?: number } = {},
): Promise<void> {
  const { displayState = 'active', screenCount = 2, currentIndex = 0 } = overrides;
  const res = await request.post(`/api/display/status?display=${display}`, {
    data: {
      displayId: display,
      currentScreen: { index: currentIndex, id: `screen-${currentIndex}`, name: `Screen ${currentIndex}` },
      screenCount,
      activeProfile: null,
      displayState,
      timestamp: Date.now(),
    },
  });
  expect(res.ok()).toBe(true);
}

/** A single-entry display registry; the remote polls displays[0] under the default 'all' target. */
function oneDisplay(id: string, name: string) {
  return baseConfig({
    displays: [
      { id, name, screens: [
        makeScreen('s1', 'S1', [textModule('ONE')]),
        makeScreen('s2', 'S2', [textModule('TWO')]),
      ] },
    ],
  });
}

test('the hero shows the live screen index and Active state from a heartbeat', async ({ page, request }) => {
  await putConfig(request, oneDisplay('heroactive', 'Hero Active'));
  await postStatus(request, 'heroactive', { displayState: 'active', screenCount: 2, currentIndex: 0 });
  await page.goto('/remote');

  // currentIndex 0 of screenCount 2 renders as "Screen 1 of 2" (one-based).
  await expect(page.getByText('Screen 1 of 2')).toBeVisible({ timeout: 10000 });
  // State badge reads the active label.
  await expect(page.getByText('Active', { exact: true })).toBeVisible();
});

test('the hero renders the Asleep state for an asleep heartbeat', async ({ page, request }) => {
  await putConfig(request, oneDisplay('heroasleep', 'Hero Asleep'));
  await postStatus(request, 'heroasleep', { displayState: 'asleep' });
  await page.goto('/remote');

  await expect(page.getByText('Asleep', { exact: true })).toBeVisible({ timeout: 10000 });
});

test('the hero renders the Dimmed state for a dimmed heartbeat', async ({ page, request }) => {
  await putConfig(request, oneDisplay('herodimmed', 'Hero Dimmed'));
  await postStatus(request, 'herodimmed', { displayState: 'dimmed' });
  await page.goto('/remote');

  await expect(page.getByText('Dimmed', { exact: true })).toBeVisible({ timeout: 10000 });
});
