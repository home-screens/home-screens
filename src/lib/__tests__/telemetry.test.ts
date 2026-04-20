import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type { ScreenConfiguration } from '@/types/config';

// Each test gets its own tmp cwd so parallel workers can't race the real
// data/telemetry.json. The json-store backing telemetry resolves its path
// lazily via process.cwd(), so overriding cwd before each test redirects all
// reads/writes into the tmp dir.
let tmpDir: string;
let origCwd: () => string;
let TELEMETRY_PATH: string;

beforeEach(async () => {
  vi.restoreAllMocks();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-screens-telemetry-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  TELEMETRY_PATH = path.join(tmpDir, 'data', 'telemetry.json');
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

/* ─── Helpers ────────────────────────────────── */

function makeConfig(overrides: Partial<ScreenConfiguration> = {}): ScreenConfiguration {
  return {
    version: 1,
    settings: {
      rotationIntervalMs: 30000,
      displayWidth: 1080,
      displayHeight: 1920,
      latitude: 0,
      longitude: 0,
      weather: { provider: 'openweathermap', latitude: 0, longitude: 0, units: 'imperial' },
      calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], maxEvents: 10, daysAhead: 7 },
      ...overrides.settings,
    },
    screens: overrides.screens ?? [
      {
        id: 's1',
        name: 'Screen 1',
        modules: [
          { id: 'm1', type: 'clock', x: 0, y: 0, w: 200, h: 100, config: {} },
          { id: 'm2', type: 'weather', x: 0, y: 100, w: 200, h: 200, config: {} },
        ],
      },
    ],
    profiles: overrides.profiles ?? [],
    // displays defaults to undefined (legacy single-display mode); tests
    // that need the multi-display registry pass one in explicitly.
    ...(overrides.displays !== undefined ? { displays: overrides.displays } : {}),
  } as unknown as ScreenConfiguration;
}

/* ─── Tests ──────────────────────────────────── */

describe('readTelemetryData', () => {
  it('returns null when file does not exist', async () => {
    const { readTelemetryData } = await import('../telemetry');
    const data = await readTelemetryData();
    expect(data).toBeNull();
  });

  it('reads existing telemetry data', async () => {
    const stored = {
      installId: 'test-uuid-123',
      firstSeenAt: '2026-01-01T00:00:00.000Z',
      lastBeaconAt: '2026-03-22T00:00:00.000Z',
    };
    await fs.mkdir(path.dirname(TELEMETRY_PATH), { recursive: true });
    await fs.writeFile(TELEMETRY_PATH, JSON.stringify(stored), 'utf-8');

    const { readTelemetryData } = await import('../telemetry');
    const data = await readTelemetryData();
    expect(data).toEqual(stored);
  });
});

describe('writeTelemetryData', () => {
  it('writes data atomically', async () => {
    const { writeTelemetryData, readTelemetryData } = await import('../telemetry');
    const data = {
      installId: 'write-test',
      firstSeenAt: '2026-01-01T00:00:00.000Z',
      lastBeaconAt: null,
    };
    await writeTelemetryData(data);
    const read = await readTelemetryData();
    expect(read).toEqual(data);
  });
});

describe('getOrCreateInstallId', () => {
  it('creates new install ID when file does not exist', async () => {
    const { getOrCreateInstallId } = await import('../telemetry');
    const data = await getOrCreateInstallId();
    expect(data.installId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(data.firstSeenAt).toBeTruthy();
    expect(data.lastBeaconAt).toBeNull();
  });

  it('returns existing install ID on subsequent calls', async () => {
    const { getOrCreateInstallId } = await import('../telemetry');
    const first = await getOrCreateInstallId();
    const second = await getOrCreateInstallId();
    expect(second.installId).toBe(first.installId);
    expect(second.firstSeenAt).toBe(first.firstSeenAt);
  });
});

describe('buildBeaconPayload', () => {
  it('assembles correct payload shape', async () => {
    const { buildBeaconPayload } = await import('../telemetry');
    const config = makeConfig();
    const telemetryData = {
      installId: 'payload-test-uuid',
      firstSeenAt: '2026-01-01T00:00:00.000Z',
      lastBeaconAt: null,
    };

    const payload = await buildBeaconPayload(config, telemetryData);

    // Identity
    expect(payload.installId).toBe('payload-test-uuid');
    expect(payload.appVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(payload.beaconVersion).toBe(3);
    expect(payload.sentAt).toBeTruthy();

    // Platform
    expect(typeof payload.platform).toBe('string');
    expect(typeof payload.arch).toBe('string');
    expect(payload.nodeVersion).toMatch(/^v\d+/);

    // Display
    expect(payload.displayWidth).toBe(1080);
    expect(payload.displayHeight).toBe(1920);

    // Usage
    expect(payload.screenCount).toBe(1);
    expect(payload.moduleCount).toBe(2);
    expect(payload.moduleTypes).toEqual({ clock: 1, weather: 1 });
    expect(payload.profileCount).toBe(0);

    // Feature flags
    expect(payload.weatherProvider).toBe('openweathermap');
    expect(typeof payload.sleepEnabled).toBe('boolean');
    expect(typeof payload.alertsEnabled).toBe('boolean');
    expect(typeof payload.authEnabled).toBe('boolean');
    expect(typeof payload.hasGoogleCalendar).toBe('boolean');
    expect(typeof payload.hasIcalSources).toBe('boolean');
    expect(typeof payload.pluginCount).toBe('number');
  });

  it('counts modules across multiple screens', async () => {
    const { buildBeaconPayload } = await import('../telemetry');
    const config = makeConfig({
      screens: [
        {
          id: 's1',
          name: 'A',
          backgroundImage: '',
          modules: [
            { id: 'm1', type: 'clock', x: 0, y: 0, w: 100, h: 100, config: {} },
          ],
        },
        {
          id: 's2',
          name: 'B',
          backgroundImage: '',
          modules: [
            { id: 'm2', type: 'clock', x: 0, y: 0, w: 100, h: 100, config: {} },
            { id: 'm3', type: 'calendar', x: 0, y: 100, w: 100, h: 100, config: {} },
          ],
        },
      ] as unknown as ScreenConfiguration['screens'],
    });
    const telemetryData = { installId: 'x', firstSeenAt: '', lastBeaconAt: null };

    const payload = await buildBeaconPayload(config, telemetryData);
    expect(payload.screenCount).toBe(2);
    expect(payload.moduleCount).toBe(3);
    expect(payload.moduleTypes).toEqual({ clock: 2, calendar: 1 });
  });

  it('collapses plugin module types to "plugin" for privacy', async () => {
    const { buildBeaconPayload } = await import('../telemetry');
    const config = makeConfig({
      screens: [
        {
          id: 's1',
          name: 'A',
          backgroundImage: '',
          modules: [
            { id: 'm1', type: 'clock', x: 0, y: 0, w: 100, h: 100, config: {} },
            { id: 'm2', type: 'plugin:spotify-now-playing', x: 0, y: 100, w: 100, h: 100, config: {} },
            { id: 'm3', type: 'plugin:custom-widget', x: 0, y: 200, w: 100, h: 100, config: {} },
          ],
        },
      ] as unknown as ScreenConfiguration['screens'],
    });
    const telemetryData = { installId: 'plugin-test', firstSeenAt: '', lastBeaconAt: null };

    const payload = await buildBeaconPayload(config, telemetryData);
    expect(payload.moduleTypes).toEqual({ clock: 1, plugin: 2 });
    // Plugin identifiers must not appear in the payload
    const payloadStr = JSON.stringify(payload);
    expect(payloadStr).not.toContain('spotify');
    expect(payloadStr).not.toContain('custom-widget');
  });

  it('does not include PII fields', async () => {
    const { buildBeaconPayload } = await import('../telemetry');
    const config = makeConfig({
      settings: {
        rotationIntervalMs: 30000,
        displayWidth: 1080,
        displayHeight: 1920,
        latitude: 40.7128,
        longitude: -74.006,
        locationName: 'New York',
        timezone: 'America/New_York',
        weather: { provider: 'openweathermap', latitude: 40.7128, longitude: -74.006, units: 'imperial' },
        calendar: { googleCalendarId: '', googleCalendarIds: ['cal-id-1'], icalSources: [], maxEvents: 10, daysAhead: 7 },
      },
    } as unknown as Partial<ScreenConfiguration>);
    const telemetryData = { installId: 'pii-test', firstSeenAt: '', lastBeaconAt: null };

    const payload = await buildBeaconPayload(config, telemetryData);
    const payloadStr = JSON.stringify(payload);

    // No location coordinates
    expect(payloadStr).not.toContain('40.7128');
    expect(payloadStr).not.toContain('-74.006');
    // No location name
    expect(payloadStr).not.toContain('New York');
    // No timezone
    expect(payloadStr).not.toContain('America/New_York');
    // No calendar IDs
    expect(payloadStr).not.toContain('cal-id-1');
    // hasGoogleCalendar is just a boolean
    expect(payload.hasGoogleCalendar).toBe(true);
  });

  it('reports hasIcalSources true when ical sources are present', async () => {
    const { buildBeaconPayload } = await import('../telemetry');
    const config = makeConfig({
      settings: {
        rotationIntervalMs: 30000,
        displayWidth: 1080,
        displayHeight: 1920,
        latitude: 0,
        longitude: 0,
        weather: { provider: 'openweathermap', latitude: 0, longitude: 0, units: 'imperial' },
        calendar: {
          googleCalendarIds: [],
          icalSources: [{ url: 'https://example.com/cal.ics', name: 'Work', color: '#fff', enabled: true }],
          googleCalendarId: '',
          maxEvents: 10,
          daysAhead: 7,
        },
      },
    } as unknown as Partial<ScreenConfiguration>);
    const telemetryData = { installId: 'ical-test', firstSeenAt: '', lastBeaconAt: null };

    const payload = await buildBeaconPayload(config, telemetryData);
    expect(payload.hasIcalSources).toBe(true);
    expect(payload.hasGoogleCalendar).toBe(false);
    // No URL leaked into payload
    expect(JSON.stringify(payload)).not.toContain('example.com');
  });

  /* ─── Multi-display (beacon v2) ────────────────── */

  it('reports displayCount 0 and empty displays[] in legacy single-display mode', async () => {
    const { buildBeaconPayload } = await import('../telemetry');
    const config = makeConfig();
    const telemetryData = { installId: 'legacy-test', firstSeenAt: '', lastBeaconAt: null };

    const payload = await buildBeaconPayload(config, telemetryData);
    expect(payload.displayCount).toBe(0);
    expect(payload.displays).toEqual([]);
    expect(payload.hasOwnedProfiles).toBe(false);
    expect(payload.beaconVersion).toBe(3);
    // Legacy screen/module counts still read from config.screens
    expect(payload.screenCount).toBe(1);
    expect(payload.moduleCount).toBe(2);
  });

  it('aggregates screens and modules across every DisplayNode in multi-display mode', async () => {
    const { buildBeaconPayload } = await import('../telemetry');
    const config = makeConfig({
      // config.screens still holds the legacy inheritance from the first
      // addDisplay(), so the test intentionally keeps it populated to prove
      // we don't double-count it into the aggregate.
      displays: [
        {
          id: 'main',
          name: 'Kitchen',
          displayWidth: 1080,
          displayHeight: 1920,
          displayTransform: '90',
          screens: [
            {
              id: 'main-s1',
              name: 'K1',
              modules: [
                { id: 'km1', type: 'clock', x: 0, y: 0, w: 100, h: 100, config: {} },
                { id: 'km2', type: 'weather', x: 0, y: 100, w: 100, h: 100, config: {} },
              ],
            },
          ],
        },
        {
          id: 'living-room',
          name: 'Living Room TV',
          displayWidth: 1920,
          displayHeight: 1080,
          displayTransform: 'normal',
          screens: [
            {
              id: 'lr-s1',
              name: 'LR1',
              modules: [
                { id: 'lrm1', type: 'clock', x: 0, y: 0, w: 100, h: 100, config: {} },
                { id: 'lrm2', type: 'calendar', x: 0, y: 100, w: 100, h: 100, config: {} },
                { id: 'lrm3', type: 'news', x: 0, y: 200, w: 100, h: 100, config: {} },
              ],
            },
          ],
        },
      ],
    } as unknown as Partial<ScreenConfiguration>);
    const telemetryData = { installId: 'multi-test', firstSeenAt: '', lastBeaconAt: null };

    const payload = await buildBeaconPayload(config, telemetryData);
    expect(payload.displayCount).toBe(2);
    // 1 + 1 screens across the two displays — config.screens is NOT added in
    expect(payload.screenCount).toBe(2);
    // 2 + 3 modules — again, config.screens is not double-counted
    expect(payload.moduleCount).toBe(5);
    expect(payload.moduleTypes).toEqual({ clock: 2, weather: 1, calendar: 1, news: 1 });
    expect(payload.displays).toHaveLength(2);
    expect(payload.displays[0]).toMatchObject({
      screenCount: 1,
      moduleCount: 2,
    });
    expect(payload.displays[1]).toMatchObject({
      screenCount: 1,
      moduleCount: 3,
    });
  });

  it('orients per-display dimensions by rotation (portrait transform = long edge vertical)', async () => {
    const { buildBeaconPayload } = await import('../telemetry');
    const config = makeConfig({
      displays: [
        {
          id: 'kitchen',
          name: 'Kitchen',
          // Author typed landscape dimensions but selected portrait rotation —
          // filterConfigForDisplay should normalize to long-edge-vertical,
          // and telemetry should carry the normalized values.
          displayWidth: 1920,
          displayHeight: 1080,
          displayTransform: '90',
          screens: [],
        },
      ],
    } as unknown as Partial<ScreenConfiguration>);
    const telemetryData = { installId: 'orient-test', firstSeenAt: '', lastBeaconAt: null };

    const payload = await buildBeaconPayload(config, telemetryData);
    expect(payload.displays[0].w).toBe(1080); // short edge becomes width
    expect(payload.displays[0].h).toBe(1920); // long edge becomes height
    expect(payload.displays[0].transform).toBe('90');
  });

  it('sleepEnabled is true when any display overrides sleep on, even if global is off', async () => {
    const { buildBeaconPayload } = await import('../telemetry');
    const config = makeConfig({
      settings: {
        rotationIntervalMs: 30000,
        displayWidth: 1080,
        displayHeight: 1920,
        latitude: 0,
        longitude: 0,
        weather: { provider: 'openweathermap', latitude: 0, longitude: 0, units: 'imperial' },
        calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], maxEvents: 10, daysAhead: 7 },
        sleep: { enabled: false, schedule: [] },
      },
      displays: [
        {
          id: 'bedroom',
          name: 'Bedroom',
          screens: [],
          settings: {
            sleep: { enabled: true, schedule: [] },
          },
        },
      ],
    } as unknown as Partial<ScreenConfiguration>);
    const telemetryData = { installId: 'sleep-any', firstSeenAt: '', lastBeaconAt: null };

    const payload = await buildBeaconPayload(config, telemetryData);
    expect(payload.sleepEnabled).toBe(true);
  });

  it('tracks hasOwnedProfiles per display', async () => {
    const { buildBeaconPayload } = await import('../telemetry');
    const config = makeConfig({
      profiles: [{ id: 'p1', name: 'Default', screenIds: [] }],
      displays: [
        {
          // Display owning screens but without owned profiles — relies on
          // the shared pool.
          id: 'shared-profiles',
          name: 'Shared',
          screens: [
            {
              id: 's-s1',
              name: 'S1',
              modules: [{ id: 'sm1', type: 'clock', x: 0, y: 0, w: 100, h: 100, config: {} }],
            },
          ],
        },
        {
          // Owned shape — self-contained screens and profiles
          id: 'modern',
          name: 'Modern',
          screens: [
            {
              id: 'm-s1',
              name: 'M1',
              modules: [{ id: 'mm1', type: 'weather', x: 0, y: 0, w: 100, h: 100, config: {} }],
            },
          ],
          profiles: [{ id: 'mp1', name: 'Day', screenIds: ['m-s1'] }],
        },
      ],
    } as unknown as Partial<ScreenConfiguration>);
    const telemetryData = { installId: 'mixed-test', firstSeenAt: '', lastBeaconAt: null };

    const payload = await buildBeaconPayload(config, telemetryData);
    expect(payload.hasOwnedProfiles).toBe(true);
    // Per-display flags
    expect(payload.displays[0]).toMatchObject({
      hasOwnedProfiles: false,
    });
    expect(payload.displays[1]).toMatchObject({
      hasOwnedProfiles: true,
    });
    // Profile aggregation: global pool (1) + modern's owned profile (1)
    expect(payload.profileCount).toBe(2);
  });

  it('does not include display IDs or names in the beacon payload', async () => {
    const { buildBeaconPayload } = await import('../telemetry');
    const config = makeConfig({
      displays: [
        {
          id: 'master-bedroom',
          name: 'Master Bedroom TV',
          screens: [],
          displayWidth: 1920,
          displayHeight: 1080,
          displayTransform: 'normal',
        },
      ],
    } as unknown as Partial<ScreenConfiguration>);
    const telemetryData = { installId: 'pii-display-test', firstSeenAt: '', lastBeaconAt: null };

    const payload = await buildBeaconPayload(config, telemetryData);
    const payloadStr = JSON.stringify(payload);
    // Display ID slug and human name must never leave the host
    expect(payloadStr).not.toContain('master-bedroom');
    expect(payloadStr).not.toContain('Master Bedroom');
    // But the count still exposes that a display exists
    expect(payload.displayCount).toBe(1);
  });

  it('sleepEnabled is false when global is on but every display overrides off', async () => {
    // This is the test the v1 OR-based semantic could not pass — the column
    // claimed "is sleep used somewhere?" but lit up whenever global was on,
    // even if every display had explicitly disabled sleep. Multi-display
    // mode now derives sleepEnabled solely from per-display effective state.
    const { buildBeaconPayload } = await import('../telemetry');
    const config = makeConfig({
      settings: {
        rotationIntervalMs: 30000,
        displayWidth: 1080,
        displayHeight: 1920,
        latitude: 0,
        longitude: 0,
        weather: { provider: 'openweathermap', latitude: 0, longitude: 0, units: 'imperial' },
        calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], maxEvents: 10, daysAhead: 7 },
        sleep: { enabled: true, schedule: [] },
      },
      displays: [
        {
          id: 'kitchen',
          name: 'Kitchen',
          screens: [],
          settings: { sleep: { enabled: false, schedule: [] } },
        },
        {
          id: 'living-room',
          name: 'Living Room',
          screens: [],
          settings: { sleep: { enabled: false, schedule: [] } },
        },
      ],
    } as unknown as Partial<ScreenConfiguration>);
    const telemetryData = { installId: 'sleep-none', firstSeenAt: '', lastBeaconAt: null };

    const payload = await buildBeaconPayload(config, telemetryData);
    expect(payload.sleepEnabled).toBe(false);
  });

  it('alertsEnabled mirrors sleepEnabled — per-display override flips it on', async () => {
    const { buildBeaconPayload } = await import('../telemetry');
    const config = makeConfig({
      settings: {
        rotationIntervalMs: 30000,
        displayWidth: 1080,
        displayHeight: 1920,
        latitude: 0,
        longitude: 0,
        weather: { provider: 'openweathermap', latitude: 0, longitude: 0, units: 'imperial' },
        calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], maxEvents: 10, daysAhead: 7 },
        alerts: { enabled: false, position: 'top', maxVisible: 3, defaultDuration: 0 },
      },
      displays: [
        {
          id: 'kitchen',
          name: 'Kitchen',
          screens: [],
          settings: {
            alerts: { enabled: true, position: 'top', maxVisible: 3, defaultDuration: 0 },
          },
        },
      ],
    } as unknown as Partial<ScreenConfiguration>);
    const telemetryData = { installId: 'alerts-any', firstSeenAt: '', lastBeaconAt: null };

    const payload = await buildBeaconPayload(config, telemetryData);
    expect(payload.alertsEnabled).toBe(true);
  });

  it('alertsEnabled is false when global is on but every display overrides off', async () => {
    const { buildBeaconPayload } = await import('../telemetry');
    const config = makeConfig({
      settings: {
        rotationIntervalMs: 30000,
        displayWidth: 1080,
        displayHeight: 1920,
        latitude: 0,
        longitude: 0,
        weather: { provider: 'openweathermap', latitude: 0, longitude: 0, units: 'imperial' },
        calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], maxEvents: 10, daysAhead: 7 },
        alerts: { enabled: true, position: 'top', maxVisible: 3, defaultDuration: 0 },
      },
      displays: [
        {
          id: 'kitchen',
          name: 'Kitchen',
          screens: [],
          settings: {
            alerts: { enabled: false, position: 'top', maxVisible: 3, defaultDuration: 0 },
          },
        },
      ],
    } as unknown as Partial<ScreenConfiguration>);
    const telemetryData = { installId: 'alerts-none', firstSeenAt: '', lastBeaconAt: null };

    const payload = await buildBeaconPayload(config, telemetryData);
    expect(payload.alertsEnabled).toBe(false);
  });

  it('rolls hasSettingsOverride up to top level and per-display, ignoring empty {}', async () => {
    const { buildBeaconPayload } = await import('../telemetry');
    const config = makeConfig({
      displays: [
        {
          // Real override — flips both per-display and top-level flags on
          id: 'kitchen',
          name: 'Kitchen',
          screens: [],
          settings: { rotationIntervalMs: 60000 },
        },
        {
          // Empty override block — doesn't count as a real override
          id: 'living-room',
          name: 'Living Room',
          screens: [],
          settings: {},
        },
        {
          // No override at all
          id: 'bedroom',
          name: 'Bedroom',
          screens: [],
        },
      ],
    } as unknown as Partial<ScreenConfiguration>);
    const telemetryData = { installId: 'override-test', firstSeenAt: '', lastBeaconAt: null };

    const payload = await buildBeaconPayload(config, telemetryData);
    expect(payload.hasSettingsOverride).toBe(true);
    expect(payload.displays[0].hasSettingsOverride).toBe(true);
    expect(payload.displays[1].hasSettingsOverride).toBe(false);
    expect(payload.displays[2].hasSettingsOverride).toBe(false);
  });

  it('hasSettingsOverride is false when no display carries any override', async () => {
    const { buildBeaconPayload } = await import('../telemetry');
    const config = makeConfig({
      displays: [
        { id: 'kitchen', name: 'Kitchen', screens: [] },
        { id: 'living-room', name: 'Living Room', screens: [], settings: {} },
      ],
    } as unknown as Partial<ScreenConfiguration>);
    const telemetryData = { installId: 'no-override', firstSeenAt: '', lastBeaconAt: null };

    const payload = await buildBeaconPayload(config, telemetryData);
    expect(payload.hasSettingsOverride).toBe(false);
  });

  it('collapses plugin:* module types to "plugin" in multi-display mode too', async () => {
    // Identical privacy rule to the legacy single-display path — plugin
    // identifiers must never leave the host, regardless of which screen
    // ownership shape the modules live in.
    const { buildBeaconPayload } = await import('../telemetry');
    const config = makeConfig({
      displays: [
        {
          id: 'main',
          name: 'Main',
          screens: [
            {
              id: 'main-s1',
              name: 'M1',
              modules: [
                { id: 'p1', type: 'plugin:secret-name', x: 0, y: 0, w: 100, h: 100, config: {} },
                { id: 'p2', type: 'plugin:other-secret', x: 0, y: 100, w: 100, h: 100, config: {} },
                { id: 'c1', type: 'clock', x: 0, y: 200, w: 100, h: 100, config: {} },
              ],
            },
          ],
        },
      ],
    } as unknown as Partial<ScreenConfiguration>);
    const telemetryData = { installId: 'plugin-md-test', firstSeenAt: '', lastBeaconAt: null };

    const payload = await buildBeaconPayload(config, telemetryData);
    expect(payload.moduleTypes).toEqual({ plugin: 2, clock: 1 });
    // Plugin identifiers must not leak through any field
    const payloadStr = JSON.stringify(payload);
    expect(payloadStr).not.toContain('secret-name');
    expect(payloadStr).not.toContain('other-secret');
  });

  it('treats displays: [] as legacy mode and aggregates from config.screens', async () => {
    // An empty registry should behave identically to single-display mode
    // (multiDisplay = displays.length > 0). A regression that flipped this
    // check to `displays != null` would silently zero out screen counts.
    const { buildBeaconPayload } = await import('../telemetry');
    const config = makeConfig({
      displays: [],
    } as unknown as Partial<ScreenConfiguration>);
    const telemetryData = { installId: 'empty-displays', firstSeenAt: '', lastBeaconAt: null };

    const payload = await buildBeaconPayload(config, telemetryData);
    expect(payload.displayCount).toBe(0);
    expect(payload.displays).toEqual([]);
    // Default makeConfig has 1 screen with 2 modules — must still be counted
    expect(payload.screenCount).toBe(1);
    expect(payload.moduleCount).toBe(2);
  });

  it('keeps top-level displayWidth/displayHeight pinned to global settings in multi-display', async () => {
    // The top-level dimension columns are kept stable for v1/v2 D1
    // comparability — they always reflect the global settings, never the
    // first display's dimensions. Per-display dimensions live in displays[].
    const { buildBeaconPayload } = await import('../telemetry');
    const config = makeConfig({
      settings: {
        rotationIntervalMs: 30000,
        displayWidth: 1080,
        displayHeight: 1920,
        latitude: 0,
        longitude: 0,
        weather: { provider: 'openweathermap', latitude: 0, longitude: 0, units: 'imperial' },
        calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], maxEvents: 10, daysAhead: 7 },
      },
      displays: [
        {
          id: 'tv',
          name: 'TV',
          // Wildly different from the global — must NOT bleed into the
          // top-level beacon dimension fields.
          displayWidth: 3840,
          displayHeight: 2160,
          displayTransform: 'normal',
          screens: [],
        },
      ],
    } as unknown as Partial<ScreenConfiguration>);
    const telemetryData = { installId: 'dim-stability', firstSeenAt: '', lastBeaconAt: null };

    const payload = await buildBeaconPayload(config, telemetryData);
    expect(payload.displayWidth).toBe(1080);
    expect(payload.displayHeight).toBe(1920);
    // The display's own dimensions still appear in the per-display entry
    expect(payload.displays[0].w).toBe(3840);
    expect(payload.displays[0].h).toBe(2160);
  });

});

describe('maybeSendBeacon', () => {
  it('skips when telemetryEnabled is false', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const { maybeSendBeacon } = await import('../telemetry');

    const config = makeConfig({
      settings: {
        rotationIntervalMs: 30000,
        displayWidth: 1080,
        displayHeight: 1920,
        latitude: 0,
        longitude: 0,
        weather: { provider: 'openweathermap', latitude: 0, longitude: 0, units: 'imperial' },
        calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], maxEvents: 10, daysAhead: 7 },
        telemetryEnabled: false,
      },
    } as unknown as Partial<ScreenConfiguration>);

    await maybeSendBeacon(config);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends on first run when no lastBeaconAt exists', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    // Write a telemetry file with no lastBeaconAt (fresh install)
    await fs.mkdir(path.dirname(TELEMETRY_PATH), { recursive: true });
    await fs.writeFile(TELEMETRY_PATH, JSON.stringify({
      installId: 'first-run-test',
      firstSeenAt: new Date().toISOString(),
      lastBeaconAt: null,
    }), 'utf-8');

    const { maybeSendBeacon } = await import('../telemetry');
    const config = makeConfig();
    await maybeSendBeacon(config);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('skips when last beacon was sent less than 24h ago', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    // Write a telemetry file with recent lastBeaconAt and old firstSeenAt
    await fs.mkdir(path.dirname(TELEMETRY_PATH), { recursive: true });
    await fs.writeFile(TELEMETRY_PATH, JSON.stringify({
      installId: 'interval-test',
      firstSeenAt: '2025-01-01T00:00:00.000Z',
      lastBeaconAt: new Date().toISOString(), // just sent
    }), 'utf-8');

    const { maybeSendBeacon } = await import('../telemetry');
    const config = makeConfig();
    await maybeSendBeacon(config);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends beacon when due and updates lastBeaconAt', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    // Write telemetry with old timestamps (past deferral + past interval)
    await fs.mkdir(path.dirname(TELEMETRY_PATH), { recursive: true });
    await fs.writeFile(TELEMETRY_PATH, JSON.stringify({
      installId: 'send-test',
      firstSeenAt: '2025-01-01T00:00:00.000Z',
      lastBeaconAt: '2025-01-01T00:00:00.000Z',
    }), 'utf-8');

    const { maybeSendBeacon, readTelemetryData } = await import('../telemetry');
    const config = makeConfig();
    await maybeSendBeacon(config);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain('/beacon');
    expect(opts?.method).toBe('POST');

    // Verify lastBeaconAt was updated
    const updated = await readTelemetryData();
    expect(updated?.lastBeaconAt).toBeTruthy();
    expect(new Date(updated!.lastBeaconAt!).getTime()).toBeGreaterThan(
      new Date('2025-01-01').getTime(),
    );
  });

  it('updates lastBeaconAt even on failed send to prevent beacon storms', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 500 }));

    await fs.mkdir(path.dirname(TELEMETRY_PATH), { recursive: true });
    await fs.writeFile(TELEMETRY_PATH, JSON.stringify({
      installId: 'fail-test',
      firstSeenAt: '2025-01-01T00:00:00.000Z',
      lastBeaconAt: '2025-01-01T00:00:00.000Z',
    }), 'utf-8');

    const { maybeSendBeacon, readTelemetryData } = await import('../telemetry');
    const config = makeConfig();
    await maybeSendBeacon(config);

    // lastBeaconAt should be updated optimistically (prevents retry storms)
    const updated = await readTelemetryData();
    expect(new Date(updated!.lastBeaconAt!).getTime()).toBeGreaterThan(
      new Date('2025-01-01').getTime(),
    );
  });

  it('handles fetch errors gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    await fs.mkdir(path.dirname(TELEMETRY_PATH), { recursive: true });
    await fs.writeFile(TELEMETRY_PATH, JSON.stringify({
      installId: 'error-test',
      firstSeenAt: '2025-01-01T00:00:00.000Z',
      lastBeaconAt: '2025-01-01T00:00:00.000Z',
    }), 'utf-8');

    const { maybeSendBeacon } = await import('../telemetry');
    const config = makeConfig();
    // Should not throw
    await expect(maybeSendBeacon(config)).resolves.toBeUndefined();
  });

  it('concurrent calls only send one beacon', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    await fs.mkdir(path.dirname(TELEMETRY_PATH), { recursive: true });
    await fs.writeFile(TELEMETRY_PATH, JSON.stringify({
      installId: 'concurrent-test',
      firstSeenAt: '2025-01-01T00:00:00.000Z',
      lastBeaconAt: '2025-01-01T00:00:00.000Z',
    }), 'utf-8');

    const { maybeSendBeacon } = await import('../telemetry');
    const config = makeConfig();

    // Fire two concurrent calls — second should be rejected by the sending guard
    await Promise.all([maybeSendBeacon(config), maybeSendBeacon(config)]);

    // Only one fetch should have been made
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});
