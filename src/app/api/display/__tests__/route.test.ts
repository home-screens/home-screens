import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies before importing the route
vi.mock('@/lib/display-commands', () => {
  const queue: Array<{ type: string; payload?: Record<string, unknown>; timestamp: number; displayId?: string }> = [];
  let status: Record<string, unknown> | null = null;
  return {
    enqueueCommand: vi.fn((displayId: string | undefined, type: string, payload?: Record<string, unknown>) => {
      queue.push({ displayId, type, payload, timestamp: Date.now() });
    }),
    drainCommands: vi.fn(() => queue.splice(0)),
    getDisplayStatus: vi.fn(() => status),
    setDisplayStatus: vi.fn((s: Record<string, unknown>) => {
      status = s;
    }),
    // Re-export for type usage
    DisplayCommandType: undefined,
  };
});

vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(),
  writeConfig: vi.fn(),
  // Mirror the real updateConfigAtomic by reading via the mocked readConfig,
  // running the mutator, then "writing" via the mocked writeConfig. Tests
  // assert against readConfig/writeConfig spies as before.
  updateConfigAtomic: vi.fn(async (mutator: (c: unknown) => unknown | Promise<unknown>) => {
    const { readConfig, writeConfig } = await import('@/lib/config');
    const current = await readConfig();
    const mutated = await mutator(current);
    await writeConfig(mutated as never);
    return mutated;
  }),
}));

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

import { GET, POST } from '@/app/api/display/[action]/route';
import { enqueueCommand, drainCommands, getDisplayStatus, setDisplayStatus } from '@/lib/display-commands';
import { readConfig, writeConfig } from '@/lib/config';
import { requireSession } from '@/lib/auth';
import { __resetAdoptedCacheForTests } from '@/lib/adopted-display-cache';

function makeParams(action: string) {
  return { params: Promise.resolve({ action }) };
}

function makeRequest(body?: Record<string, unknown>): NextRequest {
  if (body) {
    return new NextRequest('http://localhost/api/display/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  return new NextRequest('http://localhost/api/display/test', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  // The adopted-id cache is a module-level singleton with a 1.5s TTL. Tests
  // mutate readConfig's return between cases, so without a reset one test's
  // config would linger into the next via a cache hit.
  __resetAdoptedCacheForTests();
});

// ------- GET tests -------

describe('GET /api/display/commands', () => {
  it('returns drained commands', async () => {
    vi.mocked(drainCommands).mockReturnValue([
      { type: 'wake', timestamp: 1 },
      { type: 'sleep', timestamp: 2 },
    ]);

    const res = await GET(makeRequest(), makeParams('commands'));
    const json = await res.json();

    expect(drainCommands).toHaveBeenCalled();
    expect(json.commands).toHaveLength(2);
    expect(json.commands[0].type).toBe('wake');
  });
});

describe('GET /api/display/status', () => {
  it('returns 404 when no status reported', async () => {
    vi.mocked(getDisplayStatus).mockReturnValue(null);

    const res = await GET(makeRequest(), makeParams('status'));
    expect(res.status).toBe(404);
  });

  it('returns status when available', async () => {
    const status = {
      currentScreen: { index: 0, id: 's1', name: 'Main' },
      screenCount: 2,
      activeProfile: null,
      displayState: 'active' as const,
      timestamp: 123,
    };
    vi.mocked(getDisplayStatus).mockReturnValue(status);

    const res = await GET(makeRequest(), makeParams('status'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.currentScreen.id).toBe('s1');
  });
});

describe('GET simple commands (bookmarkable)', () => {
  for (const action of ['wake', 'sleep', 'next-screen', 'prev-screen', 'reload', 'clear-alerts']) {
    it(`GET /${action} enqueues command on the default queue`, async () => {
      const res = await GET(makeRequest(), makeParams(action));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({ ok: true, command: action });
      expect(enqueueCommand).toHaveBeenCalledWith(undefined, action);
    });
  }

  it('GET /wake?display=kitchen targets a specific display', async () => {
    const req = new NextRequest('http://localhost/api/display/wake?display=kitchen', { method: 'GET' });
    const res = await GET(req, makeParams('wake'));
    expect(res.status).toBe(200);
    expect(enqueueCommand).toHaveBeenCalledWith('kitchen', 'wake');
  });

  it('GET /wake?display=all broadcasts', async () => {
    const req = new NextRequest('http://localhost/api/display/wake?display=all', { method: 'GET' });
    const res = await GET(req, makeParams('wake'));
    expect(res.status).toBe(200);
    expect(enqueueCommand).toHaveBeenCalledWith('all', 'wake');
  });

  it('GET /unknown returns 404', async () => {
    const res = await GET(makeRequest(), makeParams('unknown'));
    expect(res.status).toBe(404);
  });
});

describe('display ID slug validation at the route boundary', () => {
  const badSlugs = ['Kitchen', 'kitchen!', 'my kitchen', 'my_kitchen', '-kitchen'];
  for (const bad of badSlugs) {
    it(`GET /wake?display=${bad} returns 400`, async () => {
      const req = new NextRequest(
        `http://localhost/api/display/wake?display=${encodeURIComponent(bad)}`,
        { method: 'GET' },
      );
      const res = await GET(req, makeParams('wake'));
      expect(res.status).toBe(400);
      // The command must NOT have been enqueued despite the invalid slug
      expect(enqueueCommand).not.toHaveBeenCalled();
    });
  }

  it('GET /wake?display=<65 chars> returns 400 (length cap)', async () => {
    const tooLong = 'a'.repeat(65);
    const req = new NextRequest(
      `http://localhost/api/display/wake?display=${tooLong}`,
      { method: 'GET' },
    );
    const res = await GET(req, makeParams('wake'));
    expect(res.status).toBe(400);
  });

  it('POST /status rejects an invalid displayId in the body', async () => {
    const res = await POST(
      makeRequest({
        currentScreen: { index: 0, id: 's1', name: 'Main' },
        screenCount: 1,
        activeProfile: null,
        displayState: 'active',
        timestamp: Date.now(),
        displayId: 'INVALID',
      }),
      makeParams('status'),
    );
    expect(res.status).toBe(400);
  });

  it('GET /commands?display=all is rejected (broadcast is enqueue-only)', async () => {
    const req = new NextRequest(
      'http://localhost/api/display/commands?display=all',
      { method: 'GET' },
    );
    const res = await GET(req, makeParams('commands'));
    // `commands` is a read-only action, so 'all' is disallowed
    expect(res.status).toBe(400);
  });
});

// ------- POST tests -------

describe('POST simple commands', () => {
  it('POST /wake enqueues command on the default queue', async () => {
    const res = await POST(makeRequest(), makeParams('wake'));
    const json = await res.json();

    expect(json).toEqual({ ok: true, command: 'wake' });
    expect(enqueueCommand).toHaveBeenCalledWith(undefined, 'wake');
  });

  it('POST /wake?display=kitchen targets a specific display', async () => {
    const req = new NextRequest('http://localhost/api/display/wake?display=kitchen', { method: 'POST' });
    const res = await POST(req, makeParams('wake'));
    expect(res.status).toBe(200);
    expect(enqueueCommand).toHaveBeenCalledWith('kitchen', 'wake');
  });
});

describe('POST /api/display/brightness', () => {
  it('accepts valid brightness 0-100', async () => {
    const res = await POST(makeRequest({ value: 50 }), makeParams('brightness'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, command: 'brightness', value: 50 });
    expect(enqueueCommand).toHaveBeenCalledWith(undefined, 'brightness', { value: 50 });
  });

  it('accepts brightness 0 (full black)', async () => {
    const res = await POST(makeRequest({ value: 0 }), makeParams('brightness'));
    expect(res.status).toBe(200);
  });

  it('accepts brightness 100 (full bright)', async () => {
    const res = await POST(makeRequest({ value: 100 }), makeParams('brightness'));
    expect(res.status).toBe(200);
  });

  it('rejects brightness out of range', async () => {
    const res = await POST(makeRequest({ value: 150 }), makeParams('brightness'));
    expect(res.status).toBe(400);
  });

  it('rejects negative brightness', async () => {
    const res = await POST(makeRequest({ value: -1 }), makeParams('brightness'));
    expect(res.status).toBe(400);
  });

  it('rejects non-number brightness', async () => {
    const res = await POST(makeRequest({ value: 'high' }), makeParams('brightness'));
    expect(res.status).toBe(400);
  });

  it('rejects missing value', async () => {
    const res = await POST(makeRequest({}), makeParams('brightness'));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/display/profile', () => {
  it('requires auth', async () => {
    vi.mocked(requireSession).mockRejectedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403 }),
    );

    const res = await POST(makeRequest({ profile: 'day' }), makeParams('profile'));
    expect(res.status).toBe(403);
  });

  it('switches to a valid profile', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined as never);
    vi.mocked(readConfig).mockResolvedValue({
      version: 1,
      screens: [],
      settings: { activeProfile: undefined } as never,
      profiles: [{ id: 'day', name: 'Day', screenIds: [] }],
    });
    vi.mocked(writeConfig).mockResolvedValue(undefined);

    const res = await POST(makeRequest({ profile: 'day' }), makeParams('profile'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, profile: 'day' });
    expect(writeConfig).toHaveBeenCalled();
  });

  it('rejects unknown profile ID', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined as never);
    vi.mocked(readConfig).mockResolvedValue({
      version: 1,
      screens: [],
      settings: { activeProfile: undefined } as never,
      profiles: [{ id: 'day', name: 'Day', screenIds: [] }],
    });

    const res = await POST(makeRequest({ profile: 'nonexistent' }), makeParams('profile'));
    expect(res.status).toBe(404);
  });

  it('clears profile with empty string', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined as never);
    vi.mocked(readConfig).mockResolvedValue({
      version: 1,
      screens: [],
      settings: { activeProfile: 'day' } as never,
      profiles: [],
    });
    vi.mocked(writeConfig).mockResolvedValue(undefined);

    const res = await POST(makeRequest({ profile: '' }), makeParams('profile'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, profile: '' });
  });

  it('rejects non-string profile', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined as never);

    const res = await POST(makeRequest({ profile: 42 }), makeParams('profile'));
    expect(res.status).toBe(400);
  });

  it('writes per-display activeProfile when displayId is provided', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined as never);
    const display: { id: string; name: string; screenIds: string[]; activeProfile?: string } = {
      id: 'kitchen',
      name: 'Kitchen',
      screenIds: [],
    };
    vi.mocked(readConfig).mockResolvedValue({
      version: 3,
      screens: [],
      settings: { activeProfile: undefined } as never,
      profiles: [{ id: 'day', name: 'Day', screenIds: [] }],
      displays: [display],
    });
    vi.mocked(writeConfig).mockResolvedValue(undefined);

    const res = await POST(
      makeRequest({ profile: 'day', displayId: 'kitchen' }),
      makeParams('profile'),
    );
    expect(res.status).toBe(200);
    // The mutator now produces an immutable update — the original `display`
    // reference is left untouched and a new object is written via
    // writeConfig. Inspecting the writeConfig payload is the right place
    // to verify the persisted state.
    expect(writeConfig).toHaveBeenCalled();
    const written = vi.mocked(writeConfig).mock.calls[0][0] as { displays: Array<{ id: string; activeProfile?: string }> };
    const writtenDisplay = written.displays.find((d) => d.id === 'kitchen');
    expect(writtenDisplay?.activeProfile).toBe('day');
  });

  it('returns 404 when targeting an unknown display', async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined as never);
    vi.mocked(readConfig).mockResolvedValue({
      version: 3,
      screens: [],
      settings: { activeProfile: undefined } as never,
      profiles: [{ id: 'day', name: 'Day', screenIds: [] }],
      displays: [],
    });

    const res = await POST(
      makeRequest({ profile: 'day', displayId: 'kitchen' }),
      makeParams('profile'),
    );
    expect(res.status).toBe(404);
  });

  it('accepts an owned-profile ID when the target display owns its profile list', async () => {
    // The display owns its own profile list. `owned-day` exists only
    // inside `display.profiles` — the global pool is empty. The endpoint
    // should still accept it because owned-profiles mode resolves
    // activeProfile against the display's own list.
    vi.mocked(requireSession).mockResolvedValue(undefined as never);
    const display: {
      id: string;
      name: string;
      screenIds: string[];
      profiles: Array<{ id: string; name: string; screenIds: string[] }>;
      activeProfile?: string;
    } = {
      id: 'kitchen',
      name: 'Kitchen',
      screenIds: [],
      profiles: [{ id: 'owned-day', name: 'Owned Day', screenIds: [] }],
    };
    vi.mocked(readConfig).mockResolvedValue({
      version: 3,
      screens: [],
      settings: { activeProfile: undefined } as never,
      profiles: [],
      displays: [display],
    });
    vi.mocked(writeConfig).mockResolvedValue(undefined);

    const res = await POST(
      makeRequest({ profile: 'owned-day', displayId: 'kitchen' }),
      makeParams('profile'),
    );
    expect(res.status).toBe(200);
    // Immutable update — assert against the writeConfig payload, not the
    // local `display` reference (which is left unchanged by design).
    const written = vi.mocked(writeConfig).mock.calls[0][0] as { displays: Array<{ id: string; activeProfile?: string }> };
    const writtenDisplay = written.displays.find((d) => d.id === 'kitchen');
    expect(writtenDisplay?.activeProfile).toBe('owned-day');
  });

  it('rejects a global-pool profile ID against an owned-profiles display', async () => {
    // The display owns its own profile list (`owned-day`). The global
    // pool contains `global-day`. A request to activate `global-day` on
    // the owned-profiles display must 404 — this is the whole point of
    // the owned-vs-pool distinction and the only test that locks in
    // "owned-profiles mode ignores the global pool."
    vi.mocked(requireSession).mockResolvedValue(undefined as never);
    vi.mocked(readConfig).mockResolvedValue({
      version: 3,
      screens: [],
      settings: { activeProfile: undefined } as never,
      profiles: [{ id: 'global-day', name: 'Global Day', screenIds: [] }],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screenIds: [],
        profiles: [{ id: 'owned-day', name: 'Owned Day', screenIds: [] }],
      }],
    });

    const res = await POST(
      makeRequest({ profile: 'global-day', displayId: 'kitchen' }),
      makeParams('profile'),
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /api/display/alert', () => {
  it('enqueues alert with title and message', async () => {
    const res = await POST(
      makeRequest({ title: 'Warning', message: 'Storm coming', type: 'warning', duration: 5000 }),
      makeParams('alert'),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, command: 'alert' });
    expect(enqueueCommand).toHaveBeenCalledWith(undefined, 'alert', {
      type: 'warning',
      title: 'Warning',
      message: 'Storm coming',
      duration: 5000,
    });
  });

  it('accepts alert with only title', async () => {
    const res = await POST(makeRequest({ title: 'Heads up' }), makeParams('alert'));
    expect(res.status).toBe(200);
  });

  it('accepts alert with only message', async () => {
    const res = await POST(makeRequest({ message: 'Something happened' }), makeParams('alert'));
    expect(res.status).toBe(200);
  });

  it('rejects alert with neither title nor message', async () => {
    const res = await POST(makeRequest({ type: 'info' }), makeParams('alert'));
    expect(res.status).toBe(400);
  });

  it('defaults to type info when not specified', async () => {
    await POST(makeRequest({ title: 'Test' }), makeParams('alert'));
    expect(enqueueCommand).toHaveBeenCalledWith(undefined, 'alert', expect.objectContaining({ type: 'info' }));
  });

  it('falls back to info for invalid alert type', async () => {
    await POST(makeRequest({ title: 'Bad', type: 'bogus' }), makeParams('alert'));
    expect(enqueueCommand).toHaveBeenCalledWith(undefined, 'alert', expect.objectContaining({ type: 'info' }));
  });

  it('forwards icon and dismissible fields', async () => {
    await POST(
      makeRequest({ title: 'Alert', icon: '🔔', dismissible: false }),
      makeParams('alert'),
    );
    expect(enqueueCommand).toHaveBeenCalledWith(undefined, 'alert', expect.objectContaining({
      icon: '🔔',
      dismissible: false,
    }));
  });

  it('targets a specific display via displayId in body', async () => {
    await POST(
      makeRequest({ title: 'Hi', displayId: 'kitchen' }),
      makeParams('alert'),
    );
    expect(enqueueCommand).toHaveBeenCalledWith('kitchen', 'alert', expect.any(Object));
  });
});

describe('POST /api/display/status', () => {
  it('accepts valid status body', async () => {
    const res = await POST(
      makeRequest({
        currentScreen: { index: 0, id: 's1', name: 'Main' },
        screenCount: 2,
        activeProfile: null,
        displayState: 'active',
        timestamp: Date.now(),
      }),
      makeParams('status'),
    );

    expect(res.status).toBe(200);
    expect(setDisplayStatus).toHaveBeenCalled();
  });

  it('rejects missing currentScreen', async () => {
    const res = await POST(
      makeRequest({ displayState: 'active', timestamp: 1 }),
      makeParams('status'),
    );
    expect(res.status).toBe(400);
  });

  it('rejects non-object currentScreen', async () => {
    const res = await POST(
      makeRequest({ currentScreen: true, displayState: 'active', timestamp: 1 }),
      makeParams('status'),
    );
    expect(res.status).toBe(400);
  });

  it('rejects currentScreen without id', async () => {
    const res = await POST(
      makeRequest({ currentScreen: { index: 0 }, displayState: 'active', timestamp: 1 }),
      makeParams('status'),
    );
    expect(res.status).toBe(400);
  });

  it('rejects missing displayState', async () => {
    const res = await POST(
      makeRequest({ currentScreen: { index: 0, id: 's1', name: 'X' }, timestamp: 1 }),
      makeParams('status'),
    );
    expect(res.status).toBe(400);
  });

  it('rejects missing timestamp', async () => {
    const res = await POST(
      makeRequest({
        currentScreen: { index: 0, id: 's1', name: 'X' },
        displayState: 'active',
      }),
      makeParams('status'),
    );
    expect(res.status).toBe(400);
  });

  it('silently drops hwStats on the status endpoint (moved to /api/display/hw-stats)', async () => {
    // Old reporter builds may still POST hwStats to /status. The new handler
    // strips that field and persists only the browser-heartbeat portion —
    // no 400/403, no attempt to record hardware data from this path.
    vi.mocked(readConfig).mockResolvedValue({
      displays: [{ id: 'kitchen', name: 'Kitchen', screens: [] }],
    } as never);
    const body = {
      displayId: 'kitchen',
      currentScreen: { index: 0, id: '', name: '' },
      screenCount: 0,
      activeProfile: null,
      displayState: 'active',
      timestamp: Date.now(),
      hwStats: {
        piModel: 'Pi 4', cpuModel: 'ARMv8', cpuCores: 4,
        cpuTempC: 42.0, load1: 0.1, load5: 0.1, load15: 0.1,
        throttled: null, memoryTotal: 1, memoryFree: 1, diskTotal: 1, diskFree: 1,
        reportedAt: new Date().toISOString(),
      },
    };
    const req = new NextRequest('http://localhost/api/display/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const res = await POST(req, makeParams('status'));
    expect(res.status).toBe(200);

    expect(setDisplayStatus).toHaveBeenCalled();
    const [statusArg] = vi.mocked(setDisplayStatus).mock.calls[0];
    expect((statusArg as { hwStats?: unknown }).hwStats).toBeUndefined();
  });
});

describe('POST /unknown', () => {
  it('returns 404', async () => {
    const res = await POST(makeRequest(), makeParams('unknown'));
    expect(res.status).toBe(404);
  });
});
