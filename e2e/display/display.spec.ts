import { test, expect } from '../fixtures';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { writeSandboxFile } from '../helpers/sandbox';
import { seedFixturePlugin, FIXTURE_PLUGIN_ID, FIXTURE_PLUGIN_TYPE } from '../helpers/fixture-plugin';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { ModuleInstance } from '@/types/config';

test('a single screen renders its modules and never rotates', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('only', 'Only', [textModule('SOLO SCREEN')])],
    settings: { rotationIntervalMs: 1500 },
  }));
  await page.goto('/display');
  await expect(page.getByText('SOLO SCREEN')).toBeVisible();
  // screens.length <= 1 disables the rotation timer entirely (ScreenRotator)
  await page.waitForTimeout(3500);
  await expect(page.getByText('SOLO SCREEN')).toBeVisible();
});

test('two screens rotate on the configured interval', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [
      makeScreen('a', 'A', [textModule('SCREEN ALPHA')]),
      makeScreen('b', 'B', [textModule('SCREEN BRAVO')]),
    ],
    settings: { rotationIntervalMs: 2000 },
  }));
  await page.goto('/display');
  await expect(page.getByText('SCREEN ALPHA')).toBeVisible();
  await expect(page.getByText('SCREEN BRAVO')).toBeVisible({ timeout: 8000 });
});

test('a sticky screen (rotationDurationMs: 0) never auto-advances', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [
      makeScreen('sticky', 'Sticky', [textModule('STICKY SCREEN')], { rotationDurationMs: 0 }),
      makeScreen('next', 'Next', [textModule('NEVER SHOWN')]),
    ],
    settings: { rotationIntervalMs: 1500 },
  }));
  await page.goto('/display');
  await expect(page.getByText('STICKY SCREEN')).toBeVisible();
  await page.waitForTimeout(4000);
  await expect(page.getByText('STICKY SCREEN')).toBeVisible();
  await expect(page.getByText('NEVER SHOWN')).toBeHidden();
});

test.describe('per-screen rotation duration and enabled gates', () => {
  test('a non-zero per-screen rotationDurationMs advances well before the global default', async ({ page, request }) => {
    // Screen A overrides to ~2s; the global default is 10s. resolveScreenDuration
    // (src/lib/resolve-screen-duration.ts) resolves screen.rotationDurationMs first,
    // so A must advance to B on its own 2s clock. Asserting B appears within 6s
    // proves the override took precedence: it advanced well before the 10s global
    // would have fired, and it is not sticky. Margins are generous (real event ~2s,
    // 4s of slack, comfortably under 10s) — no exact timing is asserted.
    await putConfig(request, baseConfig({
      screens: [
        makeScreen('fast', 'Fast', [textModule('FAST SCREEN')], { rotationDurationMs: 2000 }),
        makeScreen('slow', 'Slow', [textModule('SLOW SCREEN')]),
      ],
      settings: { rotationIntervalMs: 10000 },
    }));
    await page.goto('/display');
    await expect(page.getByText('FAST SCREEN')).toBeVisible();
    await expect(page.getByText('SLOW SCREEN')).toBeVisible({ timeout: 6000 });
  });

  test('a screen with enabled:false is skipped in rotation', async ({ page, request }) => {
    // The middle screen is disabled. ScreenRotator filters enabled:false out of
    // enabledScreens before rotation, so the rotating set is [One, Three] and the
    // timer steps One -> Three -> One, never landing on the disabled screen.
    await putConfig(request, baseConfig({
      screens: [
        makeScreen('one', 'One', [textModule('SCREEN ONE')]),
        makeScreen('skip', 'Skip', [textModule('SCREEN SKIPPED')], { enabled: false }),
        makeScreen('three', 'Three', [textModule('SCREEN THREE')]),
      ],
      settings: { rotationIntervalMs: 1500 },
    }));
    await page.goto('/display');
    await expect(page.getByText('SCREEN ONE')).toBeVisible();
    // Rotation advances to the next *enabled* screen, proving the disabled one
    // was not index 1 in the rotating set.
    await expect(page.getByText('SCREEN THREE')).toBeVisible({ timeout: 6000 });
    // The disabled screen's content never renders (only currentScreen mounts).
    await expect(page.getByText('SCREEN SKIPPED')).toBeHidden();
  });
});

test('the display picks up config changes without a reload', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('live', 'Live', [textModule('BEFORE UPDATE')])],
  }));
  await page.goto('/display');
  await expect(page.getByText('BEFORE UPDATE')).toBeVisible();

  const config = await getConfig(request);
  config.screens[0].modules = [textModule('AFTER UPDATE')];
  await putConfig(request, config);

  // useLiveConfig polls /api/config every 3s
  await expect(page.getByText('AFTER UPDATE')).toBeVisible({ timeout: 9000 });
});

test('empty screens list shows the empty state', async ({ page, request }) => {
  await putConfig(request, baseConfig({ screens: [] }));
  await page.goto('/display');
  await expect(page.getByText('No screens configured')).toBeVisible();
});

test('per-display routes render each display, and /display resolves main inline', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    displays: [
      { id: 'main', name: 'Main', screens: [makeScreen('m', 'M', [textModule('MAIN DISPLAY')])] },
      { id: 'kitchen', name: 'Kitchen', screens: [makeScreen('k', 'K', [textModule('KITCHEN DISPLAY')])] },
    ],
  }));
  await page.goto('/display/kitchen');
  await expect(page.getByText('KITCHEN DISPLAY')).toBeVisible();
  // Legacy /display renders the main display inline (no 307 — Chromium --app
  // mode duplicates windows on RSC redirects, so this is load-bearing behavior)
  await page.goto('/display');
  await expect(page.getByText('MAIN DISPLAY')).toBeVisible();
  expect(page.url()).toContain('/display');
});

test.describe('useLiveConfig reload paths', () => {
  // useLiveConfig polls three endpoints every CONFIG_POLL_MS (3s):
  //   1. /api/system/build-id — a changed id hard-reloads the page.
  //   2. /api/config — a changed body updates screens/settings/displays in place.
  //   3. /api/plugins/installed — a changed pluginHash re-runs loadPlugins().
  // Each test below drives exactly one of those signals and asserts the
  // observable reaction, with poll timeouts comfortably above the 3s interval.

  const plugin = (config: Record<string, unknown> = {}): ModuleInstance =>
    ({
      id: 'e2e-plugin-1',
      type: FIXTURE_PLUGIN_TYPE,
      position: { x: 0, y: 0 },
      size: { w: 320, h: 200 },
      zIndex: 1,
      style: { ...DEFAULT_MODULE_STYLE },
      config: { label: 'E2E PLUGIN', ...config },
    }) as ModuleInstance;

  const displayControl = (): ModuleInstance =>
    ({
      id: 'dc-1',
      type: 'display-control',
      position: { x: 0, y: 0 },
      size: { w: 400, h: 500 },
      zIndex: 1,
      style: { ...DEFAULT_MODULE_STYLE },
      // allowRetargeting drives PanelLayout's `showPicker = allowRetargeting && !isLegacyMode`,
      // so the TargetPicker chips (one per registered display) render.
      config: { layout: 'panel', defaultTarget: 'self', allowRetargeting: true },
    }) as ModuleInstance;

  test('a changed build-id hard-reloads the kiosk', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: [makeScreen('only', 'Only', [textModule('BUILD RELOAD')])],
    }));

    // Stub /api/system/build-id so we control the value the poll compares.
    // The first poll captures `served`; a later poll with a new value reloads.
    let served = 'build-1';
    let hits = 0;
    await page.route('**/api/system/build-id', (route) => {
      hits++;
      return route.fulfill({
        status: 200,
        contentType: 'text/plain',
        headers: { 'Cache-Control': 'no-store' },
        body: served,
      });
    });

    await page.goto('/display');
    await expect(page.getByText('BUILD RELOAD')).toBeVisible();

    // Wait for a second poll before flipping: hits >= 2 guarantees the first
    // poll fully resolved and stored `build-1` in buildIdRef, so the flip is a
    // real change (not the first-seen no-op that only primes the ref).
    await expect.poll(() => hits, { timeout: 12000 }).toBeGreaterThanOrEqual(2);

    // Register the load waiter before flipping so we can't miss the reload.
    const reloaded = page.waitForEvent('load', { timeout: 15000 });
    served = 'build-2';
    await reloaded;

    // The reloaded page re-fetches and renders; buildIdRef resets to '' so the
    // now-stable 'build-2' primes the ref again without a second reload.
    await expect(page.getByText('BUILD RELOAD')).toBeVisible();
  });

  test('a changed plugin hash re-runs loadPlugins and renders the new bundle without a manual reload', async ({ page, request, sandboxDir }) => {
    // Seed the fixture plugin; its default bundle renders config.label verbatim.
    seedFixturePlugin(sandboxDir);
    await putConfig(request, baseConfig({
      screens: [makeScreen('s1', 'S1', [plugin({ label: 'PLUGIN BUNDLE V1' })])],
    }));

    // Count /api/plugins/installed polls (observe-only, no interception) so we
    // can bump the version only after the first poll captured the old hash.
    let installedHits = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api/plugins/installed')) installedHits++;
    });

    await page.goto('/display');
    await expect(page.locator('[data-plugin-marker="e2e"]')).toBeVisible();
    await expect(page.getByText('PLUGIN BUNDLE V1')).toBeVisible();

    // hits >= 2 => the mount poll AND one interval poll ran, so useLiveConfig's
    // pluginHashRef holds the v1.0.0 hash. Bumping now is a real change.
    await expect.poll(() => installedHits, { timeout: 12000 }).toBeGreaterThanOrEqual(2);

    // Write the new bundle first (so it's on disk when the reload fetches it),
    // then bump the installed version. The version change flips getPluginHash's
    // `id:version:enabled` digest AND cache-busts the `?v=` bundle URL. The new
    // bundle ignores config and renders a distinct marker, proving the reloaded
    // component — not a config edit — produced the new output.
    const newBundle = `(function () {
      var React = window.React;
      function Component() {
        return React.createElement('div', { 'data-plugin-marker': 'e2e', style: { width: '100%', height: '100%' } }, 'PLUGIN BUNDLE V2');
      }
      window.__HS_PLUGIN__ = { default: Component };
    })();`;
    writeSandboxFile(sandboxDir, `plugins/${FIXTURE_PLUGIN_ID}/dist/bundle.js`, newBundle);
    writeSandboxFile(sandboxDir, 'plugins/installed.json', {
      schemaVersion: 1,
      plugins: [{
        id: FIXTURE_PLUGIN_ID,
        version: '1.0.1',
        installedAt: '2026-01-01T00:00:00.000Z',
        enabled: true,
        moduleType: FIXTURE_PLUGIN_ID,
      }],
    });

    // No page.reload() anywhere: the poll detects the hash change and swaps the
    // registered component in place.
    await expect(page.getByText('PLUGIN BUNDLE V2')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('PLUGIN BUNDLE V1')).toBeHidden();
  });

  test('a display added to the registry mid-session appears in the display-control target picker', async ({ page, request }) => {
    await putConfig(request, baseConfig({
      displays: [
        { id: 'main', name: 'Main', screens: [makeScreen('m', 'M', [displayControl()])] },
      ],
    }));

    // /display renders the `main` display inline; its display-control picker
    // shows a chip per registered display (plus the built-in "All").
    await page.goto('/display');
    await expect(page.getByRole('button', { name: 'Main' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'All' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kitchen' })).toBeHidden();

    // Add a second display to config.displays. useLiveConfig's /api/config poll
    // picks up the changed JSON, re-runs setDisplays, and threads the new list
    // into the module as availableDisplays — no reload.
    const cfg = await getConfig(request);
    (cfg.displays as unknown[]).push({
      id: 'kitchen',
      name: 'Kitchen',
      screens: [makeScreen('k', 'K', [textModule('KITCHEN')])],
    });
    await putConfig(request, cfg);

    await expect(page.getByRole('button', { name: 'Kitchen' })).toBeVisible({ timeout: 9000 });
    // The original chip is still present — the registry grew, it didn't reset.
    await expect(page.getByRole('button', { name: 'Main' })).toBeVisible();
  });
});
