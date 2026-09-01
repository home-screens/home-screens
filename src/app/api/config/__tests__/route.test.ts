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

  it('overwrites an unreadable config.json instead of refusing every save', async () => {
    vi.mocked(updateConfigAtomic).mockRejectedValue(new SyntaxError('Unexpected token'));
    const res = await PUT(makePutRequest(dummyConfig, 'stale-rev'));

    expect(res.status).toBe(200);
    expect(writeConfig).toHaveBeenCalledWith(dummyConfig);
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
