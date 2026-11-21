// The hub builds the beacon and a Cloudflare worker files it, one column per
// field, and neither imports the other. This holds what the hub sends against
// the list of fields the worker reads.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import type { ScreenConfiguration } from '@/types/config';
import { BEACON_FIELDS } from '../../../infrastructure/telemetry-worker/beacon';

/** Sent for the record only: the worker keeps it in the raw payload and stamps its own time. */
const SENT_BUT_NOT_FILED = ['sentAt'];

let tmpDir: string;
let origCwd: () => string;

beforeEach(async () => {
  vi.resetModules();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-screens-beacon-contract-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

function config(displays: boolean): ScreenConfiguration {
  const screens = [
    { id: 's1', name: 'Screen 1', modules: [{ id: 'm1', type: 'clock', x: 0, y: 0, w: 200, h: 100, config: {} }] },
  ];
  return {
    version: 1,
    settings: {
      rotationIntervalMs: 30000,
      displayWidth: 1080,
      displayHeight: 1920,
      latitude: 0,
      longitude: 0,
      weather: { provider: 'openweathermap', units: 'imperial' },
      calendar: { googleCalendarIds: [], icalSources: [], maxEvents: 10, daysAhead: 7 },
    },
    screens,
    profiles: [],
    ...(displays ? { displays: [{ id: 'main', name: 'Main', screens }] } : {}),
  } as unknown as ScreenConfiguration;
}

describe('the beacon the hub sends and the fields the worker reads', () => {
  it.each([
    ['one display', false],
    ['a displays list', true],
  ])('are the same set with %s', async (_label, displays) => {
    const { buildBeaconPayload } = await import('../telemetry');
    const payload = await buildBeaconPayload(config(displays), {
      installId: '0b0e6a52-3c7f-4f0e-9a51-2f6f0f3f9d11',
      firstSeenAt: '2026-01-01T00:00:00.000Z',
      lastBeaconAt: null,
    });

    expect(Object.keys(payload).sort()).toEqual([...BEACON_FIELDS, ...SENT_BUT_NOT_FILED].sort());
  });

  it('names each field once', () => {
    expect(new Set(BEACON_FIELDS).size).toBe(BEACON_FIELDS.length);
  });
});
