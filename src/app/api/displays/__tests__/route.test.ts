import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { DisplayStatus } from '@/lib/display-commands';

vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(),
}));

vi.mock('@/lib/display-commands', () => ({
  getAllDisplayStatuses: vi.fn(() => new Map()),
  getUnadoptedDisplays: vi.fn(() => []),
  getViewportReports: vi.fn(() => []),
}));

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

import { GET, __clearDisplaysCacheForTests } from '@/app/api/displays/route';
import { readConfig } from '@/lib/config';
import { getAllDisplayStatuses, getUnadoptedDisplays } from '@/lib/display-commands';

function makeRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/displays${query}`, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  __clearDisplaysCacheForTests();
});

/* ─── ?id=<id> adoption-check mode ────────────── */

describe('GET /api/displays?id=<id>', () => {
  it('returns adopted=true when the display is registered', async () => {
    vi.mocked(readConfig).mockResolvedValue({
      version: 3,
      screens: [],
      settings: {} as never,
      displays: [{ id: 'kitchen', name: 'Kitchen', screens: [] }],
    });
    const res = await GET(makeRequest('?id=kitchen'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ adopted: true, displayId: 'kitchen' });
  });

  it('returns adopted=false when the display is not registered', async () => {
    vi.mocked(readConfig).mockResolvedValue({
      version: 3,
      screens: [],
      settings: {} as never,
      displays: [{ id: 'kitchen', name: 'Kitchen', screens: [] }],
    });
    const res = await GET(makeRequest('?id=bedroom'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ adopted: false, displayId: 'bedroom' });
  });

  it('returns adopted=false when no displays array exists', async () => {
    vi.mocked(readConfig).mockResolvedValue({
      version: 3,
      screens: [],
      settings: {} as never,
    });
    const res = await GET(makeRequest('?id=kitchen'));
    const json = await res.json();
    expect(json.adopted).toBe(false);
  });

  it('does not invoke the heartbeat helpers in the ?id shortcut', async () => {
    vi.mocked(readConfig).mockResolvedValue({
      version: 3,
      screens: [],
      settings: {} as never,
      displays: [],
    });
    await GET(makeRequest('?id=kitchen'));
    expect(getAllDisplayStatuses).not.toHaveBeenCalled();
    expect(getUnadoptedDisplays).not.toHaveBeenCalled();
  });
});

/* ─── full registry list mode ─────────────────── */

describe('GET /api/displays (full list)', () => {
  it('returns empty arrays when nothing is registered or polling', async () => {
    vi.mocked(readConfig).mockResolvedValue({
      version: 3,
      screens: [],
      settings: {} as never,
    });
    const res = await GET(makeRequest());
    const json = await res.json();
    expect(json).toEqual({ displays: [], unadopted: [] });
  });

  it('merges per-display heartbeat into the registered display list', async () => {
    vi.mocked(readConfig).mockResolvedValue({
      version: 3,
      screens: [],
      settings: {} as never,
      displays: [
        { id: 'kitchen', name: 'Kitchen', screens: [{ id: 's1', name: 'S1', backgroundImage: '', modules: [] }] },
        { id: 'bedroom', name: 'Bedroom', screens: [{ id: 's2', name: 'S2', backgroundImage: '', modules: [] }] },
      ],
    });
    const status: DisplayStatus = {
      currentScreen: { index: 0, id: 's1', name: 'Main' },
      screenCount: 1,
      activeProfile: null,
      displayState: 'active',
      timestamp: 100,
      lastSeen: 200,
    };
    vi.mocked(getAllDisplayStatuses).mockReturnValue(new Map([['kitchen', status]]));
    vi.mocked(getUnadoptedDisplays).mockReturnValue([]);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.displays).toHaveLength(2);
    expect(json.displays[0]).toMatchObject({
      id: 'kitchen',
      name: 'Kitchen',
      lastSeen: 200,
      status: { currentScreen: status.currentScreen, displayState: 'active' },
    });
    // Bedroom has no heartbeat
    expect(json.displays[1]).toMatchObject({
      id: 'bedroom',
      lastSeen: null,
      status: null,
    });
  });

  it('lists unadopted displays with heartbeat', async () => {
    vi.mocked(readConfig).mockResolvedValue({
      version: 3,
      screens: [],
      settings: {} as never,
      displays: [{ id: 'kitchen', name: 'Kitchen', screens: [] }],
    });
    vi.mocked(getUnadoptedDisplays).mockReturnValue(['garage']);
    vi.mocked(getAllDisplayStatuses).mockReturnValue(
      new Map([
        [
          'garage',
          {
            currentScreen: { index: 0, id: '', name: '' },
            screenCount: 0,
            activeProfile: null,
            displayState: 'active',
            timestamp: 0,
            lastSeen: 999,
          },
        ],
      ]),
    );

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.unadopted).toHaveLength(1);
    expect(json.unadopted[0]).toMatchObject({ id: 'garage', lastSeen: 999 });
    expect(json.unadopted[0].viewportReports).toEqual([]);
    expect(getUnadoptedDisplays).toHaveBeenCalledWith(['kitchen']);
  });

  it('returns per-client viewport reports when multiple clients post for the same display', async () => {
    vi.mocked(readConfig).mockResolvedValue({
      version: 3,
      screens: [],
      settings: {} as never,
      displays: [],
    });
    vi.mocked(getUnadoptedDisplays).mockReturnValue(['home-screens']);
    vi.mocked(getAllDisplayStatuses).mockReturnValue(
      new Map([
        [
          'home-screens',
          {
            currentScreen: { index: 0, id: '', name: '' },
            screenCount: 0,
            activeProfile: null,
            displayState: 'active',
            timestamp: 0,
            lastSeen: 5000,
          },
        ],
      ]),
    );
    // Two distinct clients reporting different viewports for the same id
    const { getViewportReports } = await import('@/lib/display-commands');
    vi.mocked(getViewportReports).mockImplementation((id: string) => {
      if (id === 'home-screens') {
        return [
          { width: 1440, height: 2560, lastSeen: 5000 },
          { width: 1024, height: 768, lastSeen: 4000 },
        ];
      }
      return [];
    });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.unadopted[0].viewportReports).toHaveLength(2);
    expect(json.unadopted[0].viewportReports[0]).toMatchObject({ width: 1440, height: 2560 });
    // The primary (back-compat `reportedViewport`) tracks the most recent
    expect(json.unadopted[0].reportedViewport).toEqual({ width: 1440, height: 2560 });
  });
});

/* ─── caching ─────────────────────────────────── */

describe('GET /api/displays caching', () => {
  it('reads config once across two near-simultaneous calls', async () => {
    vi.mocked(readConfig).mockResolvedValue({
      version: 3,
      screens: [],
      settings: {} as never,
      displays: [{ id: 'kitchen', name: 'Kitchen', screens: [] }],
    });
    await GET(makeRequest('?id=kitchen'));
    await GET(makeRequest('?id=bedroom'));
    await GET(makeRequest());
    // 3 requests, 1 disk read
    expect(readConfig).toHaveBeenCalledTimes(1);
  });
});
