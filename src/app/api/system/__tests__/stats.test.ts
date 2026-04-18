import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies before importing the route
vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
}));

vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(),
}));

vi.mock('@/lib/secrets', () => ({
  getSecretStatus: vi.fn(),
}));

vi.mock('@/lib/telemetry', () => ({
  readTelemetryData: vi.fn(),
}));

// Mock fs — vi.hoisted ensures the object exists when the hoisted vi.mock factory runs
const mockFs = vi.hoisted(() => ({
  statfs: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
}));
vi.mock('fs', () => ({ promises: mockFs }));

import { GET } from '@/app/api/system/stats/route';
import { requireSession } from '@/lib/auth';
import { readConfig } from '@/lib/config';
import { getSecretStatus } from '@/lib/secrets';
import { readTelemetryData } from '@/lib/telemetry';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/system/stats', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default: auth passes
  vi.mocked(requireSession).mockResolvedValue(undefined as never);

  // Default: empty config
  vi.mocked(readConfig).mockResolvedValue({
    version: 1,
    settings: { rotationIntervalMs: 30000, weather: {}, calendar: {} },
    screens: [],
    profiles: [],
  } as never);

  // Default: no secrets configured
  vi.mocked(getSecretStatus).mockResolvedValue({
    openweathermap_key: false,
    weatherapi_key: false,
    pirateweather_key: false,
    unsplash_access_key: false,
    nasa_api_key: false,
    todoist_token: false,
    google_maps_key: false,
    tomtom_key: false,
    google_client_id: false,
    google_client_secret: false,
    github_token: false,
    immich_url: false,
    immich_api_key: false,
    reporter_token: false,
  });

  // Default: no telemetry data
  vi.mocked(readTelemetryData).mockResolvedValue(null);

  // Default: fs operations return safe defaults
  mockFs.statfs.mockResolvedValue({ bsize: 4096, blocks: 1000000, bavail: 500000 });
  mockFs.stat.mockRejectedValue(new Error('ENOENT')); // files don't exist by default
  mockFs.readdir.mockRejectedValue(new Error('ENOENT')); // dirs don't exist by default
});

// ------- Auth -------

describe('GET /api/system/stats - auth', () => {
  it('returns 401 when session is invalid', async () => {
    const authError = new Response('Unauthorized', { status: 401 });
    vi.mocked(requireSession).mockRejectedValue(authError);

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });
});

// ------- Disk stats (getDiskStats) -------

describe('GET /api/system/stats - disk stats', () => {
  it('computes disk total, used, and free from statfs', async () => {
    mockFs.statfs.mockResolvedValue({
      bsize: 4096,
      blocks: 1_000_000, // total = 4096 * 1M = ~4 GB
      bavail: 250_000,   // free = 4096 * 250K = ~1 GB
    });

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(data.disk.total).toBe(4096 * 1_000_000);
    expect(data.disk.free).toBe(4096 * 250_000);
    expect(data.disk.used).toBe(4096 * 750_000);
  });

  it('returns zeroes when statfs fails', async () => {
    mockFs.statfs.mockRejectedValue(new Error('not supported'));

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(data.disk.total).toBe(0);
    expect(data.disk.used).toBe(0);
    expect(data.disk.free).toBe(0);
  });
});

// ------- Directory size (dirSize) -------

describe('GET /api/system/stats - directory sizes', () => {
  it('sums file sizes recursively', async () => {
    // config.json exists
    mockFs.stat.mockImplementation(async (p: string) => {
      if (p.endsWith('config.json')) return { size: 5000 };
      if (p.endsWith('file1.jpg')) return { size: 100_000 };
      if (p.endsWith('file2.png')) return { size: 200_000 };
      if (p.endsWith('inner.jpg')) return { size: 50_000 };
      throw new Error('ENOENT');
    });

    // backgrounds dir has files + subdirectory
    mockFs.readdir.mockImplementation(async (dir: string) => {
      if (dir.endsWith('backgrounds')) {
        return [
          { name: 'file1.jpg', isDirectory: () => false, isFile: () => true },
          { name: 'file2.png', isDirectory: () => false, isFile: () => true },
          { name: 'subdir', isDirectory: () => true, isFile: () => false },
        ];
      }
      if (dir.endsWith('subdir')) {
        return [
          { name: 'inner.jpg', isDirectory: () => false, isFile: () => true },
        ];
      }
      throw new Error('ENOENT');
    });

    const res = await GET(makeRequest());
    const data = await res.json();

    // backgrounds: 100K + 200K + 50K (recursive) = 350K
    expect(data.disk.dataDir.backgrounds).toBe(350_000);
    expect(data.disk.dataDir.config).toBe(5000);
    expect(data.disk.dataDir.total).toBe(350_000 + 5000);
  });

  it('returns 0 for missing directories', async () => {
    // All readdir/stat calls fail (ENOENT defaults from beforeEach)
    const res = await GET(makeRequest());
    const data = await res.json();

    expect(data.disk.dataDir.backgrounds).toBe(0);
    expect(data.disk.dataDir.backups).toBe(0);
    expect(data.disk.dataDir.config).toBe(0);
    expect(data.disk.dataDir.total).toBe(0);
  });
});

// ------- App stats (module counting) -------

describe('GET /api/system/stats - app stats', () => {
  it('counts modules by type across screens', async () => {
    vi.mocked(readConfig).mockResolvedValue({
      version: 1,
      settings: { rotationIntervalMs: 30000, weather: {}, calendar: {} },
      screens: [
        {
          id: 's1', name: 'Screen 1', modules: [
            { type: 'clock', config: {} },
            { type: 'weather', config: {} },
            { type: 'clock', config: {} },
          ],
        },
        {
          id: 's2', name: 'Screen 2', modules: [
            { type: 'calendar', config: {} },
            { type: 'weather', config: {} },
          ],
        },
      ],
      profiles: [{ id: 'p1', name: 'Evening', screenIds: ['s1'] }],
    } as never);

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(data.app.screens).toBe(2);
    expect(data.app.modules).toBe(5);
    expect(data.app.moduleTypes).toEqual({ clock: 2, weather: 2, calendar: 1 });
    expect(data.app.profiles).toBe(1);
  });

  it('returns zeroes when config read fails', async () => {
    vi.mocked(readConfig).mockRejectedValue(new Error('file not found'));

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(data.app.screens).toBe(0);
    expect(data.app.modules).toBe(0);
    expect(data.app.moduleTypes).toEqual({});
    expect(data.app.profiles).toBe(0);
  });

  it('reports configured secrets', async () => {
    vi.mocked(getSecretStatus).mockResolvedValue({
      openweathermap_key: false,
      weatherapi_key: true,
      pirateweather_key: false,
      unsplash_access_key: true,
      nasa_api_key: false,
      todoist_token: true,
      google_maps_key: false,
      tomtom_key: false,
      google_client_id: false,
      google_client_secret: false,
      github_token: false,
      immich_url: false,
      immich_api_key: false,
      reporter_token: false,
    });

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(data.app.configuredSecrets).toEqual(
      expect.arrayContaining(['weatherapi_key', 'unsplash_access_key', 'todoist_token']),
    );
    expect(data.app.configuredSecrets).toHaveLength(3);
  });
});

// ------- OS / memory (sanity check) -------

describe('GET /api/system/stats - os and memory', () => {
  it('returns os and memory fields', async () => {
    const res = await GET(makeRequest());
    const data = await res.json();

    expect(data.os).toEqual(expect.objectContaining({
      hostname: expect.any(String),
      platform: expect.any(String),
      arch: expect.any(String),
      uptime: expect.any(Number),
      nodeVersion: expect.stringMatching(/^v\d+/),
    }));

    expect(data.memory).toEqual(expect.objectContaining({
      total: expect.any(Number),
      free: expect.any(Number),
      used: expect.any(Number),
    }));
    expect(data.memory.total).toBeGreaterThan(0);
    expect(data.memory.used).toBe(data.memory.total - data.memory.free);
  });
});

// ------- Telemetry -------

describe('GET /api/system/stats - telemetry', () => {
  it('returns telemetry data when available (install ID masked)', async () => {
    vi.mocked(readTelemetryData).mockResolvedValue({
      installId: 'abcd1234-5678-4abc-9def-123456789abc',
      firstSeenAt: '2026-01-01T00:00:00.000Z',
      lastBeaconAt: '2026-03-22T00:00:00.000Z',
    });

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(data.telemetry).toEqual({
      installId: 'abcd1234...',
      lastBeaconAt: '2026-03-22T00:00:00.000Z',
      enabled: true,
    });
  });

  it('returns null fields when no telemetry file exists', async () => {
    vi.mocked(readTelemetryData).mockResolvedValue(null);

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(data.telemetry).toEqual({
      installId: null,
      lastBeaconAt: null,
      enabled: true,
    });
  });

  it('reflects telemetryEnabled=false from config', async () => {
    vi.mocked(readConfig).mockResolvedValue({
      version: 1,
      settings: { rotationIntervalMs: 30000, weather: {}, calendar: {}, telemetryEnabled: false },
      screens: [],
      profiles: [],
    } as never);

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(data.telemetry.enabled).toBe(false);
  });
});
