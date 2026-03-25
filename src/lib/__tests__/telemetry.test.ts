import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import type { ScreenConfiguration } from '@/types/config';

const TELEMETRY_PATH = path.join(process.cwd(), 'data', 'telemetry.json');
const TELEMETRY_TMP = TELEMETRY_PATH + '.tmp';

// Save and restore original telemetry.json around tests
let originalContent: string | null = null;

beforeEach(async () => {
  vi.restoreAllMocks();
  try {
    originalContent = await fs.readFile(TELEMETRY_PATH, 'utf-8');
  } catch {
    originalContent = null;
  }
  try { await fs.unlink(TELEMETRY_PATH); } catch { /* ok */ }
  try { await fs.unlink(TELEMETRY_TMP); } catch { /* ok */ }
});

afterEach(async () => {
  vi.restoreAllMocks();
  try { await fs.unlink(TELEMETRY_PATH); } catch { /* ok */ }
  try { await fs.unlink(TELEMETRY_TMP); } catch { /* ok */ }
  if (originalContent !== null) {
    await fs.mkdir(path.dirname(TELEMETRY_PATH), { recursive: true });
    await fs.writeFile(TELEMETRY_PATH, originalContent, 'utf-8');
  }
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
    expect(payload.beaconVersion).toBe(1);
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
