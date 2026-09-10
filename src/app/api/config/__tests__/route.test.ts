import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/config')>();
  return {
    ...actual,
    readConfig: vi.fn(),
    writeConfig: vi.fn(),
    updateConfigAtomic: vi.fn(),
  };
});

// The cached read is the same document here; the route's own caching choice
// is not what these tests are about, and a module-level TTL cache would leak
// between cases.
vi.mock('@/lib/config-cache', () => ({
  readConfigCached: async () => {
    const { readConfig } = await import('@/lib/config');
    return readConfig();
  },
  invalidateConfigReadCache: vi.fn(),
  __resetConfigReadCacheForTests: vi.fn(),
}));

vi.mock('@/lib/kiosk', () => ({
  syncKioskConf: vi.fn().mockResolvedValue(undefined),
  applyDisplaySettings: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/telemetry', () => ({
  maybeSendBeacon: vi.fn().mockResolvedValue(undefined),
}));

import { GET, PUT } from '@/app/api/config/route';
import { readConfig, writeConfig, updateConfigAtomic, configRevision } from '@/lib/config';
import { CONFIG_REVISION_HEADER } from '@/lib/config-revision';

const dummyConfig = {
  screens: [{ id: 's1', name: 'Main', modules: [] }],
  settings: { displayWidth: 1080, displayHeight: 1920 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readConfig).mockResolvedValue(dummyConfig as never);
  vi.mocked(writeConfig).mockResolvedValue(undefined);
  // Stand-in for the real queue: read, mutate, write when the mutator
  // returned something other than what it was given.
  vi.mocked(updateConfigAtomic).mockImplementation(async (mutator) => {
    const current = await readConfig();
    const result = await mutator(current);
    if (result !== current) await writeConfig(result);
    return result;
  });
});

// ------- GET tests -------

describe('GET /api/config', () => {
  it('returns the config as JSON', async () => {
    const req = new NextRequest('http://localhost/api/config');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.screens).toHaveLength(1);
    expect(json.settings.displayWidth).toBe(1080);
  });

  it('sends the config revision header', async () => {
    const res = await GET(new NextRequest('http://localhost/api/config'));
    expect(res.headers.get(CONFIG_REVISION_HEADER)).toBe(configRevision(dummyConfig as never));
  });

  it('returns 500 when readConfig throws', async () => {
    vi.mocked(readConfig).mockRejectedValue(new Error('disk error'));

    const req = new NextRequest('http://localhost/api/config');
    const res = await GET(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});

/* ─── Per-display scoping ─────────────────────────
 * A wall polls this every 3 seconds. It used to receive every display's
 * screens and filter client-side, so a 4-screen display downloaded and diffed
 * a 41-screen sibling's layout forever.
 */

const multiDisplayConfig = {
  screens: [],
  settings: { displayWidth: 1080, displayHeight: 1920 },
  displays: [
    {
      id: 'kitchen',
      name: 'Kitchen',
      screens: [{ id: 'k1', name: 'Kitchen screen', modules: [{ id: 'm1', type: 'clock' }] }],
      displayWidth: 1080,
    },
    {
      id: 'office',
      name: 'Office',
      screens: [
        { id: 'o1', name: 'Office one', modules: [] },
        { id: 'o2', name: 'Office two', modules: [] },
      ],
    },
  ],
};

describe('GET /api/config?display=', () => {
  beforeEach(() => {
    vi.mocked(readConfig).mockResolvedValue(multiDisplayConfig as never);
  });

  it('sends the requested display in full', async () => {
    const res = await GET(new NextRequest('http://localhost/api/config?display=kitchen'));
    const json = await res.json();

    const kitchen = json.displays.find((d: { id: string }) => d.id === 'kitchen');
    expect(kitchen.screens).toHaveLength(1);
    expect(kitchen.screens[0].modules).toHaveLength(1);
    expect(kitchen.displayWidth).toBe(1080);
  });

  it('trims every other display to the id and name display-control needs', async () => {
    const res = await GET(new NextRequest('http://localhost/api/config?display=kitchen'));
    const json = await res.json();

    // Still enumerable as a target...
    expect(json.displays.map((d: { id: string }) => d.id)).toEqual(['kitchen', 'office']);
    const office = json.displays.find((d: { id: string }) => d.id === 'office');
    expect(office.name).toBe('Office');
    // ...but its layout is not on the wire.
    expect(office.screens).toEqual([]);
  });

  it('still sends the whole document\'s revision, not the scoped body\'s', async () => {
    // The editor compares its PUT against this header. A hash over a scoped
    // body would never match the document a save is applied to.
    const res = await GET(new NextRequest('http://localhost/api/config?display=kitchen'));
    expect(res.headers.get(CONFIG_REVISION_HEADER)).toBe(
      configRevision(multiDisplayConfig as never),
    );
  });

  it('leaves no matching display for an unknown id, so the client self-heals', async () => {
    const res = await GET(new NextRequest('http://localhost/api/config?display=nope'));
    const json = await res.json();

    expect(json.displays.find((d: { id: string }) => d.id === 'nope')).toBeUndefined();
    expect(json.displays.every((d: { screens: unknown[] }) => d.screens.length === 0)).toBe(true);
  });

  it('returns the untouched document when no display is asked for', async () => {
    const res = await GET(new NextRequest('http://localhost/api/config'));
    const json = await res.json();

    expect(json.displays).toEqual(multiDisplayConfig.displays);
  });
});

// ------- PUT tests -------

describe('PUT /api/config', () => {
  function makePutRequest(body: unknown, revision?: string): NextRequest {
    return new NextRequest('http://localhost/api/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(revision ? { [CONFIG_REVISION_HEADER]: revision } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  it('saves valid config and returns it', async () => {
    const res = await PUT(makePutRequest(dummyConfig));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(writeConfig).toHaveBeenCalledWith(dummyConfig);
    expect(json.screens).toHaveLength(1);
  });

  it('saves when the sent revision matches the config on disk', async () => {
    const edited = { ...dummyConfig, screens: [...dummyConfig.screens, { id: 's2', name: 'Two', modules: [] }] };
    const res = await PUT(makePutRequest(edited, configRevision(dummyConfig as never)));

    expect(res.status).toBe(200);
    expect(writeConfig).toHaveBeenCalledWith(edited);
    expect(res.headers.get(CONFIG_REVISION_HEADER)).toBe(configRevision(edited as never));
  });

  it('returns 409 with the newer config when the sent revision is stale', async () => {
    const onDisk = { ...dummyConfig, screens: [{ id: 'theirs', name: 'Theirs', modules: [] }] };
    vi.mocked(readConfig).mockResolvedValue(onDisk as never);
    const res = await PUT(makePutRequest(dummyConfig, configRevision(dummyConfig as never)));

    expect(res.status).toBe(409);
    expect(writeConfig).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.config.screens[0].id).toBe('theirs');
    expect(res.headers.get(CONFIG_REVISION_HEADER)).toBe(configRevision(onDisk as never));
  });

  it('refuses an unreadable config instead of overwriting through a failed transaction', async () => {
    vi.mocked(readConfig).mockRejectedValue(new SyntaxError('Unexpected token'));
    const res = await PUT(makePutRequest(dummyConfig));

    expect(res.status).toBe(500);
    expect(writeConfig).not.toHaveBeenCalled();
  });

  it('rejects invalid calendar ownership values before writing', async () => {
    const res = await PUT(makePutRequest({ ...dummyConfig, settings: { ...dummyConfig.settings, calendar: { personSources: { alex: 'not-an-array' } } } }));
    expect(res.status).toBe(400);
    expect(writeConfig).not.toHaveBeenCalled();
  });

  it('returns 400 when screens is missing', async () => {
    const res = await PUT(makePutRequest({ settings: {} }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('screens');
  });

  it('returns 400 when settings is missing', async () => {
    const res = await PUT(makePutRequest({ screens: [] }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('settings');
  });

  it('returns 400 when screens is not an array', async () => {
    const res = await PUT(makePutRequest({ screens: 'not-array', settings: {} }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('screens');
  });

  it('returns 400 when body is null', async () => {
    const req = new NextRequest('http://localhost/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'null',
    });
    const res = await PUT(req);

    expect(res.status).toBe(400);
  });
});
