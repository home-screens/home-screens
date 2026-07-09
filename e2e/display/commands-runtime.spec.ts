import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import type { ScreenConfiguration, Screen } from '@/types/config';

/**
 * Kiosk-side command CONSUMPTION. The enqueue side (remote buttons → queue)
 * lives in e2e/remote/remote.spec.ts; here we open a real display tab and
 * assert it reacts to commands drained from its per-display queue.
 *
 * useDisplayCommands (src/hooks/useDisplayCommands.ts) polls
 * `GET /api/display/commands?display=<id>` every COMMAND_POLL_MS (3s) and
 * dispatches each drained command to a handler in
 * src/components/display/useDisplayControl.ts. Every assertion therefore
 * rides at least one 3s poll — timeouts are set comfortably above that.
 *
 * Each test uses a DISTINCT display id so the shared per-worker command
 * queue / statusMap never bleed between tests (queues are module-level in
 * src/lib/display-commands.ts, and files run their tests sequentially on one
 * worker server per playwright.config.ts `fullyParallel: false`).
 */

/** Build a config whose registry holds exactly this one display id. */
function displayConfig(
  id: string,
  screens: Screen[],
  settings: Record<string, unknown> = {},
): ScreenConfiguration {
  return baseConfig({
    settings,
    displays: [{ id, name: id, screens }],
  });
}

/**
 * Enqueue a command for `id` via the public route the remote/HA/curl clients
 * use. Simple commands take no body; brightness/alert carry a JSON payload.
 * (`dump-console-log` has no public enqueue route — it is solicited by the
 * diagnostics endpoint; see that test.)
 */
async function sendCommand(
  request: APIRequestContext,
  id: string,
  action: string,
  body?: Record<string, unknown>,
): Promise<void> {
  const res = await request.post(
    `/api/display/${action}?display=${encodeURIComponent(id)}`,
    body ? { data: body } : undefined,
  );
  expect(res.ok()).toBe(true);
}

/** The SleepOverlay is the only element at z-index 9997 (SleepOverlay.tsx). */
const OVERLAY = '[style*="9997"]';

async function openDisplay(
  page: Page,
  request: APIRequestContext,
  config: ScreenConfiguration,
  id: string,
): Promise<void> {
  await putConfig(request, config);
  await page.goto(`/display/${id}`);
  await expect(page.locator('[data-module-type]').first()).toBeVisible();
}

test('next-screen and prev-screen navigate the visible screen', async ({ page, request }) => {
  const id = 'cmd-nav';
  await openDisplay(
    page,
    request,
    // Rotation frozen (baseConfig default interval is 1h), so ONLY the remote
    // nav commands can change which screen is mounted.
    displayConfig(id, [
      makeScreen('a', 'A', [textModule('NAV SCREEN ALPHA')]),
      makeScreen('b', 'B', [textModule('NAV SCREEN BRAVO')]),
    ]),
    id,
  );

  await expect(page.getByText('NAV SCREEN ALPHA', { exact: true })).toBeVisible();

  await sendCommand(request, id, 'next-screen');
  // Only the current screen is mounted (ScreenRotator renders one ScreenRenderer),
  // so the advance is observable as ALPHA leaving the DOM and BRAVO entering.
  await expect(page.getByText('NAV SCREEN BRAVO', { exact: true })).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('NAV SCREEN ALPHA', { exact: true })).toHaveCount(0);

  await sendCommand(request, id, 'prev-screen');
  await expect(page.getByText('NAV SCREEN ALPHA', { exact: true })).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('NAV SCREEN BRAVO', { exact: true })).toHaveCount(0);
});

test('sleep blacks out the display; wake restores content and resumes a paused rotator', async ({ page, request }) => {
  const id = 'cmd-sleep';
  await openDisplay(
    page,
    request,
    // Short interval so the rotator visibly resumes within the timeout AFTER
    // wake clears pause. Sleep is ENABLED (with far-off idle/schedule windows
    // that never fire during the test) because dimOpacity short-circuits to 0
    // when the sleep feature is off — a remote `sleep` only blacks the screen
    // out (opacity 1) when sleep is enabled (useSleepManager).
    displayConfig(
      id,
      [
        makeScreen('a', 'A', [textModule('SLEEP SCREEN ALPHA')]),
        makeScreen('b', 'B', [textModule('SLEEP SCREEN BRAVO')]),
      ],
      {
        rotationIntervalMs: 1500,
        sleep: { enabled: true, dimAfterMinutes: 600, sleepAfterMinutes: 600, dimBrightness: 20 },
      },
    ),
    id,
  );

  // Pause the rotator by double-tapping the active pagination dot, then record
  // which screen we're parked on (rotation may have advanced once before the
  // tap landed, so read it dynamically rather than assuming ALPHA).
  await page.locator('button[aria-current="true"]').dblclick();
  await expect(page.getByText('PAUSED')).toBeVisible();
  const parkedOnAlpha = await page.getByText('SLEEP SCREEN ALPHA', { exact: true }).isVisible();

  // Sleep → the full-screen dim overlay appears (opacity animates to 1).
  await sendCommand(request, id, 'sleep');
  await expect(page.locator(OVERLAY)).toBeVisible({ timeout: 8000 });
  await expect(page.locator(OVERLAY).locator('> div').first()).toHaveCSS('opacity', '1');

  // Wake → overlay leaves, the asleep→active transition clears pause
  // (ScreenRotator), and auto-rotation resumes onto the other screen.
  await sendCommand(request, id, 'wake');
  await expect(page.locator(OVERLAY)).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByText('PAUSED')).toHaveCount(0);
  const resumedText = parkedOnAlpha ? 'SLEEP SCREEN BRAVO' : 'SLEEP SCREEN ALPHA';
  await expect(page.getByText(resumedText, { exact: true })).toBeVisible({ timeout: 8000 });
});

test('brightness dims the display, and brightness 100 restores it', async ({ page, request }) => {
  const id = 'cmd-bright';
  await openDisplay(
    page,
    request,
    // Screensaver off so the dim overlay is a single child div whose opacity
    // is the value under test (no clock screensaver layered on top).
    displayConfig(id, [makeScreen('s', 'S', [textModule('BRIGHTNESS SCREEN')])], {
      screensaver: { mode: 'off' },
    }),
    id,
  );

  // value 50 → dimmed (setRemoteBrightness, useSleepManager): overlay opacity
  // = 1 - 50/100 = 0.5. toHaveCSS polls out the 1s opacity transition.
  await sendCommand(request, id, 'brightness', { value: 50 });
  await expect(page.locator(OVERLAY)).toBeVisible({ timeout: 8000 });
  await expect(page.locator(OVERLAY).locator('> div').first()).toHaveCSS('opacity', '0.5');

  // value 100 → active threshold: the overlay unmounts entirely.
  await sendCommand(request, id, 'brightness', { value: 100 });
  await expect(page.locator(OVERLAY)).toHaveCount(0, { timeout: 8000 });
});

test('alert renders its title and message; clear-alerts removes it', async ({ page, request }) => {
  const id = 'cmd-alert';
  await openDisplay(
    page,
    request,
    displayConfig(id, [makeScreen('s', 'S', [textModule('ALERT SCREEN')])]),
    id,
  );

  // type 'urgent' → persistent by default (no auto-dismiss), so the overlay
  // stays up until clear-alerts arrives.
  await sendCommand(request, id, 'alert', {
    type: 'urgent',
    title: 'E2E ALERT TITLE',
    message: 'E2E ALERT BODY',
  });
  await expect(page.getByText('E2E ALERT TITLE')).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('E2E ALERT BODY')).toBeVisible();

  await sendCommand(request, id, 'clear-alerts');
  await expect(page.getByText('E2E ALERT TITLE')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByText('E2E ALERT BODY')).toHaveCount(0);
});

test('reload reloads the kiosk page', async ({ page, request }) => {
  const id = 'cmd-reload';
  await openDisplay(
    page,
    request,
    displayConfig(id, [makeScreen('s', 'S', [textModule('RELOAD SCREEN')])]),
    id,
  );

  // Stamp the current window; a real reload (window.location.reload) wipes it.
  await page.evaluate(() => {
    (window as unknown as { __hsBeforeReload?: number }).__hsBeforeReload = Date.now();
  });
  expect(await page.evaluate(() => (window as unknown as { __hsBeforeReload?: number }).__hsBeforeReload)).toBeGreaterThan(0);

  const reloaded = page.waitForEvent('load', { timeout: 10000 });
  await sendCommand(request, id, 'reload');
  await reloaded;

  // Fresh execution context → the stamp is gone, proving a navigation happened.
  expect(await page.evaluate(() => (window as unknown as { __hsBeforeReload?: number }).__hsBeforeReload)).toBeUndefined();
  await expect(page.getByText('RELOAD SCREEN')).toBeVisible();
});

test('dump-console-log snapshots the browser console buffer and the hub stores it', async ({ page, request }) => {
  const id = 'cmd-console';
  await openDisplay(
    page,
    request,
    displayConfig(id, [makeScreen('s', 'S', [textModule('CONSOLE SCREEN')])]),
    id,
  );

  // Put a marker into the page's console ring buffer (installed on mount by
  // ScreenRotator via installConsoleBuffer).
  await page.evaluate(() => console.log('E2E_CONSOLE_MARKER'));

  // dump-console-log has no public enqueue route — the diagnostics endpoint
  // broadcasts it to every configured display and then polls for the upload.
  const uploadResponse = page.waitForResponse(
    (r) => r.url().includes('/api/display/console-log') && r.request().method() === 'POST',
    { timeout: 15000 },
  );
  const diagnostics = request.get('/api/system/diagnostics');

  const upload = await uploadResponse;
  expect(upload.status()).toBe(200);
  const uploadBody = (await upload.json()) as { ok: boolean; stored: number };
  expect(uploadBody.ok).toBe(true);
  expect(uploadBody.stored).toBeGreaterThanOrEqual(1);

  // The browser posted its own buffer, keyed to this display, marker included.
  const posted = upload.request().postDataJSON() as { displayId: string; entries: unknown[] };
  expect(posted.displayId).toBe(id);
  expect(JSON.stringify(posted.entries)).toContain('E2E_CONSOLE_MARKER');

  // Let the diagnostics bundle finish (it streams a ZIP once the log lands).
  const diagRes = await diagnostics;
  expect(diagRes.status()).toBe(200);
});

test('the open kiosk tab posts a live heartbeat with real browser fields', async ({ page, request }) => {
  const id = 'cmd-heartbeat';
  await openDisplay(
    page,
    request,
    displayConfig(id, [
      makeScreen('a', 'A', [textModule('HEARTBEAT SCREEN A')]),
      makeScreen('b', 'B', [textModule('HEARTBEAT SCREEN B')]),
    ]),
    id,
  );

  // useStatusReporter posts on mount (the first significant-change effect) and
  // every 30s after. Unlike the synthetic postHeartbeat helper, a real browser
  // report carries browserStats (userAgent, chromium version) and a derived
  // reportedViewport — assert those to prove the heartbeat came from the tab.
  await expect
    .poll(
      async () => {
        const res = await request.get(`/api/display/status?display=${id}`);
        if (!res.ok()) return null;
        return res.json();
      },
      { timeout: 12000 },
    )
    .toMatchObject({
      screenCount: 2,
      displayState: 'active',
      currentScreen: { id: expect.stringMatching(/.+/) },
      browserStats: { userAgent: expect.stringContaining('Chrome') },
      reportedViewport: { width: expect.any(Number), height: expect.any(Number) },
    });

  // Sanity-check the viewport dimensions are the browser's real innerWidth/Height.
  const status = await (await request.get(`/api/display/status?display=${id}`)).json();
  expect(status.reportedViewport.width).toBeGreaterThan(0);
  expect(status.reportedViewport.height).toBeGreaterThan(0);
});
