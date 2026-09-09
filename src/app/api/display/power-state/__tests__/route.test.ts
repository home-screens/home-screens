import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(),
}));

import { GET } from '@/app/api/display/power-state/route';
import { readConfig } from '@/lib/config';
import { __resetConfigReadCacheForTests } from '@/lib/config-cache';
import {
  __resetForTests,
  getDisplayStatus,
  setDisplayStatus,
  type DisplayStatus,
} from '@/lib/display-commands';

function req(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/display/power-state${query}`);
}

function asleepStatus(): DisplayStatus {
  return {
    currentScreen: { index: 0, id: 's1', name: 'Home' },
    screenCount: 1,
    activeProfile: null,
    displayState: 'asleep',
    timestamp: Date.now(),
  };
}

const MULTI = {
  screens: [],
  settings: { sleep: { enabled: true, panelPowerOff: true } },
  displays: [{ id: 'kitchen', name: 'Kitchen', screens: [] }],
};

const LEGACY = {
  screens: [],
  settings: { sleep: { enabled: true, panelPowerOff: true } },
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetConfigReadCacheForTests();
  __resetForTests();
});

describe('GET /api/display/power-state', () => {
  it('rejects a missing or malformed display id', async () => {
    expect((await GET(req(''))).status).toBe(400);
    expect((await GET(req('?display=Not%20Valid'))).status).toBe(400);
  });

  it('refuses an unadopted display', async () => {
    vi.mocked(readConfig).mockResolvedValue(MULTI as never);
    const res = await GET(req('?display=garage'));
    expect(res.status).toBe(403);
  });

  it('answers off for an adopted display that is asleep with a fresh heartbeat', async () => {
    vi.mocked(readConfig).mockResolvedValue(MULTI as never);
    setDisplayStatus(asleepStatus(), 'kitchen');

    const res = await GET(req('?display=kitchen'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ power: 'off' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('answers on when the display has not reported yet', async () => {
    vi.mocked(readConfig).mockResolvedValue(MULTI as never);
    expect(await (await GET(req('?display=kitchen'))).json()).toEqual({ power: 'on' });
  });

  it('answers on when the setting is off even while asleep', async () => {
    vi.mocked(readConfig).mockResolvedValue({
      ...MULTI,
      settings: { sleep: { enabled: true } },
    } as never);
    setDisplayStatus(asleepStatus(), 'kitchen');
    expect(await (await GET(req('?display=kitchen'))).json()).toEqual({ power: 'on' });
  });

  it('reads the legacy default slot for main when no registry exists', async () => {
    // The hub's own browser reports with no displayId in single-display mode;
    // the hub Pi's agent asks as `main`.
    vi.mocked(readConfig).mockResolvedValue(LEGACY as never);
    setDisplayStatus(asleepStatus());

    expect(await (await GET(req('?display=main'))).json()).toEqual({ power: 'off' });
    expect(getDisplayStatus()?.panelPower).toBeUndefined();
  });

  it('records the agent check-in without refreshing browser liveness', async () => {
    vi.mocked(readConfig).mockResolvedValue(MULTI as never);
    setDisplayStatus(asleepStatus(), 'kitchen');
    const before = getDisplayStatus('kitchen');

    await new Promise((r) => setTimeout(r, 5));
    const res = await GET(req('?display=kitchen&applied=off'));
    expect(await res.json()).toEqual({ power: 'off' });

    const after = getDisplayStatus('kitchen');
    expect(after?.panelPower?.applied).toBe('off');
    expect(after?.panelPower?.agentSeen).toBeGreaterThan(0);
    expect(after?.lastSeen).toBe(before?.lastSeen);
    expect(after?.browserSeen).toBe(before?.browserSeen);
  });

  it('brings the panel back when only the hardware reporter is still heard from', async () => {
    // The browser crashed while asleep: its last displayState stays frozen at
    // `asleep`, and the reporter's stub heartbeat keeps `lastSeen` fresh. The
    // decision must key off the browser's own liveness.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-08T03:00:00Z'));
      vi.mocked(readConfig).mockResolvedValue(MULTI as never);
      setDisplayStatus(asleepStatus(), 'kitchen');
      expect(await (await GET(req('?display=kitchen'))).json()).toEqual({ power: 'off' });

      vi.setSystemTime(new Date('2026-09-08T03:05:00Z'));
      setDisplayStatus(
        { currentScreen: { index: 0, id: '', name: '' }, screenCount: 0, activeProfile: null, displayState: 'active', timestamp: 0 },
        'kitchen',
      );
      const status = getDisplayStatus('kitchen');
      expect(status?.displayState).toBe('asleep');
      expect(status?.lastSeen).toBe(Date.now());
      expect(await (await GET(req('?display=kitchen'))).json()).toEqual({ power: 'on' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('records a check-in for a display with no browser status yet', async () => {
    vi.mocked(readConfig).mockResolvedValue(MULTI as never);
    await GET(req('?display=kitchen&applied=on'));
    expect(getDisplayStatus('kitchen')?.panelPower?.applied).toBe('on');
    expect(getDisplayStatus('kitchen')?.lastSeen).toBeUndefined();
  });

  it('ignores a malformed applied value', async () => {
    vi.mocked(readConfig).mockResolvedValue(MULTI as never);
    await GET(req('?display=kitchen&applied=maybe'));
    expect(getDisplayStatus('kitchen')?.panelPower).toBeUndefined();
  });

  it('answers on when the config cannot be read', async () => {
    vi.mocked(readConfig).mockRejectedValue(new Error('disk'));
    // Unreadable config: the adoption gate falls back to legacy semantics, so
    // `main` is still permitted and must land on the safe answer.
    expect(await (await GET(req('?display=main'))).json()).toEqual({ power: 'on' });
  });
});
