import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';

/**
 * These specs drive the multi-display registry through its running route
 * handlers: adoption (unadopted → registered), per-tab heartbeat tracking,
 * and the adoption-gated hw-stats endpoint. They assert against the in-memory
 * state the hub exposes via `/api/displays`, `/api/display/status`, and
 * `/api/display/hw-stats` rather than the editor UI, so the runtime mechanics
 * (which are pure server state, not rendered anywhere as a single view) can be
 * verified deterministically.
 *
 * Note on isolation: the hub's in-memory maps (`knownDisplays`, `statusMap`,
 * `viewportReports`) live in the worker's server process and persist across
 * tests in this file. Each test therefore uses its own display slugs and
 * asserts on the presence of *its* slug rather than exact list equality, so a
 * display registered by an earlier test can't perturb a later one.
 *
 * Not covered here: `UNADOPTED_STALENESS_MS` eviction (2 min). Aging an entry
 * past that window requires control over the server clock, which an e2e run
 * cannot manipulate — that path is exercised in the display-commands unit
 * tests instead.
 */

/** Displays present in every lifecycle test's baseline config. */
function lifecycleConfig(extraDisplayIds: string[] = []) {
  const displays: Array<{ id: string; name: string; screens: ReturnType<typeof makeScreen>[] }> = [
    { id: 'main', name: 'Main', screens: [makeScreen('m1', 'M1', [textModule('MAIN')])] },
    { id: 'kitchen', name: 'Kitchen', screens: [
      makeScreen('k1', 'K1', [textModule('KIT A')]),
      makeScreen('k2', 'K2', [textModule('KIT B')]),
    ] },
    ...extraDisplayIds.map((id) => ({
      id,
      name: id,
      screens: [makeScreen(`${id}-s1`, `${id} S1`, [textModule(id.toUpperCase())])],
    })),
  ];
  return baseConfig({ displays });
}

interface ViewportReport {
  width: number;
  height: number;
  lastSeen: number;
  clientAddress?: string;
}
interface DisplayEntry {
  id: string;
  screenCount: number;
  lastSeen: number | null;
  viewportReports: ViewportReport[];
  status: { currentScreen: { index: number }; displayState: string } | null;
}
interface DisplaysRegistry {
  displays: DisplayEntry[];
  unadopted: Array<{ id: string; lastSeen: number | null; viewportReports: ViewportReport[] }>;
}

async function readRegistry(request: APIRequestContext): Promise<DisplaysRegistry> {
  const res = await request.get('/api/displays');
  expect(res.ok()).toBe(true);
  return res.json();
}

/** Post a full status heartbeat the way a display client does. */
async function postStatus(
  request: APIRequestContext,
  display: string,
  opts: { clientId?: string; viewport?: { width: number; height: number }; currentIndex?: number } = {},
): Promise<void> {
  const { clientId, viewport, currentIndex = 0 } = opts;
  const res = await request.post(`/api/display/status?display=${display}`, {
    data: {
      displayId: display,
      ...(clientId ? { clientId } : {}),
      currentScreen: { index: currentIndex, id: `screen-${currentIndex}`, name: `Screen ${currentIndex}` },
      screenCount: 2,
      activeProfile: null,
      displayState: 'active',
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

function validHwStats() {
  return {
    piModel: 'Raspberry Pi 4 Model B',
    cpuModel: 'Cortex-A72',
    cpuCores: 4,
    cpuTempC: 48.3,
    load1: 0.2,
    load5: 0.3,
    load15: 0.25,
    throttled: { raw: '0x0', active: false, underVoltage: false, previouslyThrottled: false },
    memoryTotal: 4_000_000,
    memoryFree: 2_000_000,
    diskTotal: 32_000_000,
    diskFree: 20_000_000,
    reportedAt: new Date().toISOString(),
  };
}

test('an unadopted display that heartbeats surfaces in the unadopted list', async ({ request }) => {
  await putConfig(request, lifecycleConfig());
  const slug = 'garage-un';

  await postStatus(request, slug, { currentIndex: 0 });

  const registry = await readRegistry(request);
  expect(registry.unadopted.map((d) => d.id)).toContain(slug);
  // It must NOT masquerade as a registered display.
  expect(registry.displays.map((d) => d.id)).not.toContain(slug);
  const entry = registry.unadopted.find((d) => d.id === slug)!;
  expect(typeof entry.lastSeen).toBe('number');
});

test('adopting a display moves it from unadopted into the registered list', async ({ request }) => {
  await putConfig(request, lifecycleConfig());
  const slug = 'porch-adopt';

  // Heartbeat while unadopted → shows up as a candidate.
  await postStatus(request, slug, { currentIndex: 1 });
  await expect
    .poll(async () => (await readRegistry(request)).unadopted.map((d) => d.id))
    .toContain(slug);

  // Adopt it by writing it into config.displays (what the editor store does).
  await putConfig(request, lifecycleConfig([slug]));

  // The /api/displays config read is cached for 1.5s, so poll past it.
  await expect
    .poll(async () => (await readRegistry(request)).displays.map((d) => d.id), { timeout: 5000 })
    .toContain(slug);

  const registry = await readRegistry(request);
  // Now registered, and no longer offered for adoption.
  expect(registry.unadopted.map((d) => d.id)).not.toContain(slug);
  const entry = registry.displays.find((d) => d.id === slug)!;
  // screenCount is the config-derived count for a registered display.
  expect(entry.screenCount).toBe(1);
});

test('a heartbeat surfaces current screen index and display state on the registered display', async ({ request }) => {
  await putConfig(request, lifecycleConfig());

  await postStatus(request, 'kitchen', { currentIndex: 1 });

  await expect
    .poll(async () => {
      const entry = (await readRegistry(request)).displays.find((d) => d.id === 'kitchen');
      return entry?.status?.currentScreen.index ?? null;
    }, { timeout: 5000 })
    .toBe(1);

  const entry = (await readRegistry(request)).displays.find((d) => d.id === 'kitchen')!;
  expect(entry.status?.displayState).toBe('active');
  expect(typeof entry.lastSeen).toBe('number');
  // screenCount comes from the config (2 screens), independent of the heartbeat.
  expect(entry.screenCount).toBe(2);
});

test('two tabs under one displayId are tracked as distinct viewport reports with a source address', async ({ request }) => {
  const slug = 'family-room';
  await putConfig(request, lifecycleConfig([slug]));

  await postStatus(request, slug, { clientId: 'tab-a', viewport: { width: 1080, height: 1920 } });
  await postStatus(request, slug, { clientId: 'tab-b', viewport: { width: 800, height: 600 } });

  await expect
    .poll(async () => {
      const entry = (await readRegistry(request)).displays.find((d) => d.id === slug);
      return entry?.viewportReports.length ?? 0;
    }, { timeout: 5000 })
    .toBe(2);

  const entry = (await readRegistry(request)).displays.find((d) => d.id === slug)!;
  const widths = entry.viewportReports.map((r) => r.width).sort((a, b) => a - b);
  expect(widths).toEqual([800, 1080]);
  // Every report carries the source address the hub stamped, so a phantom
  // reporter can be traced back to a device on the LAN.
  for (const report of entry.viewportReports) {
    expect(typeof report.clientAddress).toBe('string');
    expect(report.clientAddress!.length).toBeGreaterThan(0);
  }
});

test('repeat heartbeats from the same tab collapse into one viewport report', async ({ request }) => {
  const slug = 'solo-room';
  await putConfig(request, lifecycleConfig([slug]));

  await postStatus(request, slug, { clientId: 'only-tab', viewport: { width: 1080, height: 1920 } });
  await postStatus(request, slug, { clientId: 'only-tab', viewport: { width: 1080, height: 1920 } });

  await expect
    .poll(async () => (await readRegistry(request)).displays.find((d) => d.id === slug)?.id, { timeout: 5000 })
    .toBe(slug);

  const entry = (await readRegistry(request)).displays.find((d) => d.id === slug)!;
  expect(entry.viewportReports).toHaveLength(1);
});

test('hw-stats accepts an adopted display and rejects a non-adopted one', async ({ request }) => {
  await putConfig(request, lifecycleConfig());

  // The adopted-display registry is cached for 1.5s; poll the adopted case
  // until the just-written config takes effect.
  await expect
    .poll(async () => {
      const res = await request.post('/api/display/hw-stats', {
        data: { displayId: 'kitchen', hwStats: validHwStats() },
      });
      return res.status();
    }, { timeout: 5000 })
    .toBe(200);

  // A valid-but-unregistered slug is rejected regardless of cache timing —
  // nothing ever adopts it.
  const rejected = await request.post('/api/display/hw-stats', {
    data: { displayId: 'never-adopted-x', hwStats: validHwStats() },
  });
  expect(rejected.status()).toBe(403);
});

test('hw-stats rejects a malformed stats body on an adopted display', async ({ request }) => {
  await putConfig(request, lifecycleConfig());

  await expect
    .poll(async () => {
      const res = await request.post('/api/display/hw-stats', {
        // cpuCores must be a positive number — this fails schema validation.
        data: { displayId: 'kitchen', hwStats: { ...validHwStats(), cpuCores: 0 } },
      });
      return res.status();
    }, { timeout: 5000 })
    .toBe(400);
});

test('in legacy single-display mode hw-stats accepts only "main"', async ({ request }) => {
  // No displays array → legacy mode: adoption authorization allows only 'main'.
  await putConfig(request, baseConfig());

  // The adopted-display registry is cached for 1.5s and an earlier test may
  // have left a multi-display config in it (where 'kitchen' IS adopted). Poll
  // on the non-main slug flipping to 403 — that transition is the definitive
  // signal that legacy mode is now in effect, whereas 'main' would read 200
  // off a stale multi-display cache too.
  await expect
    .poll(async () => {
      const res = await request.post('/api/display/hw-stats', {
        data: { displayId: 'kitchen', hwStats: validHwStats() },
      });
      return res.status();
    }, { timeout: 5000 })
    .toBe(403);

  const main = await request.post('/api/display/hw-stats', {
    data: { displayId: 'main', hwStats: validHwStats() },
  });
  expect(main.status()).toBe(200);
});

/**
 * Page-driven half of the lifecycle: the actual kiosk tab reacting to the
 * registry changing underneath it. Where the specs above assert on the hub's
 * in-memory maps, these open a real `/display/<id>` tab and prove the two
 * client-side recovery paths verified against source:
 *
 *  - `DisplayNotFound` (src/components/display/DisplayNotFound.tsx) — the
 *    server route (`(display)/display/[displayId]/page.tsx`) renders it
 *    whenever `filterConfigForDisplay` returns null, i.e. the id is absent
 *    from `config.displays`. That null branch is hit BOTH in multi-display
 *    mode (id not in a populated registry) and in legacy mode (no `displays`
 *    array at all — `config.displays?.find(...)` is `undefined`). The
 *    component then polls `/api/displays?id=<id>` every 5s (CHECK_POLL_MS)
 *    and hard-reloads on `adopted: true`.
 *
 *  - `useLiveConfig` (src/components/display/useLiveConfig.ts) — a mounted
 *    rotator polls `/api/config` every 3s (CONFIG_POLL_MS); if its display
 *    vanishes from the config it navigates to `/display`, which the legacy
 *    route renders as the main display inline.
 *
 * Distinct display ids per test keep the shared per-worker `statusMap` /
 * `knownDisplays` from bleeding between tests, matching the isolation note
 * at the top of this file.
 */
test.describe('DisplayNotFound and self-heal (page-driven)', () => {
  /** True once the kiosk has mounted a real module (rotator is live). */
  async function expectRotatorModule(page: Page): Promise<void> {
    await expect(page.locator('[data-module-type]').first()).toBeVisible();
  }

  test('unregistered id in a populated registry renders DisplayNotFound with auto-recovery', async ({ page, request }) => {
    // Registry has main + kitchen, but NOT this id → filterConfigForDisplay
    // returns null → DisplayNotFound.
    await putConfig(request, lifecycleConfig());
    await page.goto('/display/ghost-populated');

    // The fallback identifies itself and echoes the offending id in the heading.
    await expect(page.getByText('Display Not Registered')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ghost-populated' })).toBeVisible();

    // Because the hub reports OTHER registered displays, DisplayNotFound arms
    // its 60s auto-recovery and surfaces the "go to default" escape hatch.
    // This is the observable behavioral difference from legacy mode below.
    await expect(page.getByRole('button', { name: 'Go to default display now' })).toBeVisible({ timeout: 10_000 });
  });

  test('unregistered id in legacy mode renders DisplayNotFound with no auto-recovery', async ({ page, request }) => {
    // No `displays` array at all → the [displayId] route still funnels through
    // filterConfigForDisplay, whose `config.displays?.find(...)` is undefined,
    // so it returns null and renders the SAME DisplayNotFound fallback.
    await putConfig(request, baseConfig());

    // /api/displays caches config for 1.5s and an earlier test seeded a
    // populated registry into that cache. DisplayNotFound calls
    // discoverOtherDisplays exactly once at mount, so wait for the cache to
    // reflect the now-empty registry before navigating — otherwise the mount
    // could read a stale non-empty list and arm recovery. Once /api/displays
    // reports zero displays, the cache holds that empty value for the mount fetch.
    await expect
      .poll(async () => (await readRegistry(request)).displays.length, { timeout: 5_000 })
      .toBe(0);

    await page.goto('/display/ghost-legacy');

    await expect(page.getByText('Display Not Registered')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ghost-legacy' })).toBeVisible();

    // With an empty registry the hub has no default to fall back to, so
    // DisplayNotFound never arms auto-recovery — no countdown, no button. It
    // waits indefinitely for adoption instead.
    await expect(page.getByRole('button', { name: 'Go to default display now' })).toHaveCount(0);
    await expect(page.getByText('Waiting for adoption')).toBeVisible();
  });

  test('adopting a stranded id mid-poll navigates the tab onto the live display', async ({ page, request }) => {
    // Seed main + kitchen; 'office' is NOT yet registered.
    await putConfig(request, lifecycleConfig());
    await page.goto('/display/office');

    await expect(page.getByText('Display Not Registered')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'office' })).toBeVisible();

    // Adopt 'office' the way the editor store does: write it into
    // config.displays. lifecycleConfig seeds its single screen with a text
    // module reading the upper-cased id ("OFFICE").
    await putConfig(request, lifecycleConfig(['office']));

    // DisplayNotFound's adoption check (5s poll) sees adopted:true — after the
    // 1.5s /api/displays config cache turns over — and hard-reloads. The route
    // then filters to the now-registered display and mounts ScreenRotator.
    // Generous timeout covers one 5s poll + the cache turnover with headroom.
    await expect(page.getByText('OFFICE', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Display Not Registered')).toHaveCount(0);
    await expectRotatorModule(page);
  });

  test('deleting the display a kiosk is on self-heals it back to /display', async ({ page, request }) => {
    // Seed main + kitchen + a dedicated 'nook' display, then open the nook tab.
    await putConfig(request, lifecycleConfig(['nook']));
    await page.goto('/display/nook');
    await expect(page.getByText('NOOK', { exact: true })).toBeVisible();
    await expectRotatorModule(page);

    // Delete 'nook' from the config (back to main + kitchen). The mounted
    // rotator's useLiveConfig poll (3s) finds nook gone, filterConfigForDisplay
    // returns null, and it navigates to /display rather than reloading a dead
    // per-display URL.
    await putConfig(request, lifecycleConfig());

    // The legacy /display route renders the main display inline (text "MAIN").
    // waitForURL confirms we left the dead /display/nook URL; the regex only
    // matches the bare /display entry point.
    await page.waitForURL(/\/display$/, { timeout: 20_000 });
    await expect(page.getByText('MAIN', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('NOOK', { exact: true })).toHaveCount(0);
  });
});

/* ─── Display self-update (kiosk bundle + bootstrap) ─────────────────────
 *
 * A display-only Pi renders the hub's web app, so the app updates itself for
 * free — but the shell layer it runs locally (kiosk launcher, splash,
 * reporter, systemd units) used to freeze the day the Pi was flashed. These
 * specs drive the two endpoints that unfroze it, through the same
 * adoption-as-authorization gate hw-stats uses.
 */

interface KioskManifest {
  version: string;
  sha256: string;
  restartAdvised: boolean;
  files: Array<{ path: string; sha256: string }>;
}

test('the kiosk bundle manifest is served to an adopted display', async ({ request }) => {
  await putConfig(request, lifecycleConfig());

  // The adopted-display registry is cached for 1.5s; poll until the config lands.
  await expect
    .poll(async () => {
      const res = await request.get('/api/display/kiosk-bundle?display=kitchen&manifest=1');
      return res.status();
    }, { timeout: 5000 })
    .toBe(200);

  const res = await request.get('/api/display/kiosk-bundle?display=kitchen&manifest=1');
  const manifest = (await res.json()) as KioskManifest;

  expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
  expect(manifest.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(typeof manifest.restartAdvised).toBe('boolean');
  // The four files the whole mechanism stands on.
  const paths = manifest.files.map((f) => f.path);
  expect(paths).toContain('kiosk-launcher-display.sh');
  expect(paths).toContain('kiosk-update.sh');
  expect(paths).toContain('kiosk-update-install.sh');
  expect(paths).toContain('system/kiosk-update-privileged.sh');
});

test('the kiosk tarball matches the digest the manifest advertises', async ({ request }) => {
  await putConfig(request, lifecycleConfig());

  await expect
    .poll(async () => (await request.get('/api/display/kiosk-bundle?display=kitchen&manifest=1')).status(), {
      timeout: 5000,
    })
    .toBe(200);

  const manifest = (await (
    await request.get('/api/display/kiosk-bundle?display=kitchen&manifest=1')
  ).json()) as KioskManifest;

  const tarRes = await request.get('/api/display/kiosk-bundle?display=kitchen');
  expect(tarRes.status()).toBe(200);
  expect(tarRes.headers()['content-type']).toContain('application/gzip');

  const body = await tarRes.body();
  const { createHash } = await import('crypto');
  const digest = createHash('sha256').update(body).digest('hex');
  // The spoke refuses to install anything whose digest doesn't match, so a
  // drift between these two responses would silently stop every update.
  expect(digest).toBe(manifest.sha256);
  // gzip magic — the spoke pipes this straight into `tar -xzf`.
  expect(body[0]).toBe(0x1f);
  expect(body[1]).toBe(0x8b);
});

test('the kiosk bundle is refused for a display that was never adopted', async ({ request }) => {
  await putConfig(request, lifecycleConfig());

  const manifestRes = await request.get(
    '/api/display/kiosk-bundle?display=never-adopted-bundle&manifest=1',
  );
  expect(manifestRes.status()).toBe(403);

  const tarRes = await request.get('/api/display/kiosk-bundle?display=never-adopted-bundle');
  expect(tarRes.status()).toBe(403);
});

test('the kiosk bundle rejects a malformed display id', async ({ request }) => {
  await putConfig(request, lifecycleConfig());
  const res = await request.get('/api/display/kiosk-bundle?display=Not%20A%20Slug&manifest=1');
  expect(res.status()).toBe(400);
});

test('the bootstrap endpoint returns a runnable script for an adopted display', async ({ request }) => {
  await putConfig(request, lifecycleConfig());

  await expect
    .poll(async () => (await request.get('/api/display/kiosk-bootstrap?display=kitchen')).status(), {
      timeout: 5000,
    })
    .toBe(200);

  const res = await request.get('/api/display/kiosk-bootstrap?display=kitchen');
  expect(res.headers()['content-type']).toContain('text/plain');
  const script = await res.text();

  expect(script).toContain('#!/usr/bin/env bash');
  expect(script).toContain('DISPLAY_ID="kitchen"');
  // It must verify what it downloads before running any of it.
  expect(script).toMatch(/EXPECTED_SHA="[0-9a-f]{64}"/);
  expect(script).toContain('sha256sum');
  // And hand off to the bundle's own installer, so the migration path and the
  // fresh-install path run identical code.
  expect(script).toContain('kiosk-update-install.sh');

  // It must then run a real update check. The installer lays down the
  // machinery but not the hardware reporter, which only kiosk-update.sh
  // installs (via the privileged helper) — so a bootstrap that stopped at the
  // installer would report success while the Pi kept running its old reporter
  // and kept showing as "Needs setup" in the editor forever.
  expect(script).toContain('scripts/kiosk-update.sh');

  // And it must NOT seed a version stamp: every later update check
  // short-circuits on that stamp, so writing one here would mark the display
  // as current on a version whose reporter was never actually installed.
  expect(script).not.toContain('--version');
});

test('the bootstrap endpoint answers an unadopted display in bash, not JSON', async ({ request }) => {
  await putConfig(request, lifecycleConfig());
  const res = await request.get('/api/display/kiosk-bootstrap?display=never-adopted-boot');
  expect(res.status()).toBe(403);
  // The response is piped into bash, so a JSON error body would print as noise.
  const body = await res.text();
  expect(body).toContain('not adopted');
  expect(body).toContain('exit 1');
});

test('a reporter posting its display-software version surfaces on /api/displays', async ({ request }) => {
  await putConfig(request, lifecycleConfig());

  await expect
    .poll(async () => {
      const res = await request.post('/api/display/hw-stats', {
        data: {
          displayId: 'kitchen',
          hwStats: { ...validHwStats(), kioskUpdater: true, kioskVersion: '1.2.3' },
        },
      });
      return res.status();
    }, { timeout: 5000 })
    .toBe(200);

  const registry = await request.get('/api/displays');
  const payload = (await registry.json()) as {
    hubVersion: string;
    displays: Array<{ id: string; displaySoftware?: { updater: boolean; version: string | null } }>;
  };
  const kitchen = payload.displays.find((d) => d.id === 'kitchen');
  expect(kitchen?.displaySoftware).toEqual({ updater: true, version: '1.2.3' });
  // The hub's own version rides along so the editor can compare the two
  // without a second round trip (and without consulting GitHub).
  expect(payload.hubVersion).toMatch(/^\d+\.\d+\.\d+/);
});

test('an old reporter that omits the version fields still posts successfully', async ({ request }) => {
  await putConfig(request, lifecycleConfig());

  await expect
    .poll(async () => {
      const res = await request.post('/api/display/hw-stats', {
        data: { displayId: 'main', hwStats: validHwStats() },
      });
      return res.status();
    }, { timeout: 5000 })
    .toBe(200);

  const payload = (await (await request.get('/api/displays')).json()) as {
    displays: Array<{ id: string; displaySoftware?: { updater: boolean; version: string | null } }>;
  };
  // Reads as "no automatic updates installed", which is what drives the
  // editor's one-time setup prompt.
  expect(payload.displays.find((d) => d.id === 'main')?.displaySoftware).toEqual({
    updater: false,
    version: null,
  });
});
