import { test, expect } from '../fixtures';
import type { APIRequestContext } from '@playwright/test';
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
