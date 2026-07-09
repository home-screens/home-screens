import { test, expect } from '../fixtures';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';

/**
 * Display-runtime resilience to transient network faults. These specs sever or
 * flap the kiosk's own client-side requests via `page.route` / `setOffline`
 * (which only touch the browser page — the test's `request` fixture reaches the
 * server unimpeded), then assert the display degrades gracefully and self-heals.
 *
 * useLiveConfig (src/components/display/useLiveConfig.ts) polls /api/config every
 * 3s and, on any fetch failure, keeps the current config ("keep current config
 * on failure"). useNetworkStatus (src/hooks/useNetworkStatus.ts) debounces the
 * offline event by 3s before showing the WifiOff indicator and clears it
 * immediately on the online event.
 */

test('the display keeps rendering the last-good config when /api/config polls fail, then recovers', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('live', 'Live', [textModule('LAST GOOD CONFIG')])],
  }));

  // Block the client config poll BEFORE navigating. The initial render is
  // server-side (readConfig), so the module still paints; only useLiveConfig's
  // 3s /api/config poll is severed. A mutable flag lets us restore the route
  // later without re-registering (mirrors the build-id test's `served` flip).
  let blockConfig = true;
  await page.route('**/api/config', (route) => (blockConfig ? route.abort() : route.continue()));

  await page.goto('/display');
  await expect(page.getByText('LAST GOOD CONFIG')).toBeVisible();

  // Change the config on the server while polls are severed. The display cannot
  // fetch it, so it must keep painting the last-good config.
  const cfg = await getConfig(request);
  cfg.screens[0].modules = [textModule('CONFIG AFTER OUTAGE')];
  await putConfig(request, cfg);

  // Wait past two full poll intervals: the old content persists, the new never
  // appears (the failing fetch never overwrites the last-good state).
  await page.waitForTimeout(7000);
  await expect(page.getByText('LAST GOOD CONFIG')).toBeVisible();
  await expect(page.getByText('CONFIG AFTER OUTAGE')).toHaveCount(0);

  // Restore the poll: the next successful fetch applies the queued change with
  // no manual reload.
  blockConfig = false;
  await expect(page.getByText('CONFIG AFTER OUTAGE')).toBeVisible({ timeout: 9000 });
  await expect(page.getByText('LAST GOOD CONFIG')).toHaveCount(0);
});

test('the offline indicator survives repeated network flaps without sticking', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('s', 'S', [textModule('FLAP SCREEN')])],
  }));
  await page.goto('/display');
  await expect(page.getByText('FLAP SCREEN')).toBeVisible();

  const indicator = page.locator('.lucide-wifi-off');
  await expect(indicator).toHaveCount(0);

  // Drive offline → online → offline → online twice. Each offline shows the
  // icon after the 3s debounce; each online clears it immediately. Asserting
  // the full cycle twice proves neither state gets stuck across a flap.
  for (let cycle = 0; cycle < 2; cycle++) {
    await page.context().setOffline(true);
    await expect(indicator).toBeVisible({ timeout: 8000 });

    await page.context().setOffline(false);
    await expect(indicator).toHaveCount(0, { timeout: 8000 });
  }
});
