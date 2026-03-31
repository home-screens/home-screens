import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(),
  writeConfig: vi.fn(),
}));

vi.mock('@/lib/kiosk', () => ({
  syncKioskConf: vi.fn().mockResolvedValue(undefined),
  applyDisplaySettings: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/telemetry', () => ({
  maybeSendBeacon: vi.fn().mockResolvedValue(undefined),
}));

import { GET, PUT } from '@/app/api/config/route';
import { readConfig, writeConfig } from '@/lib/config';

const dummyConfig = {
  screens: [{ id: 's1', name: 'Main', modules: [] }],
  settings: { displayWidth: 1080, displayHeight: 1920 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readConfig).mockResolvedValue(dummyConfig as never);
  vi.mocked(writeConfig).mockResolvedValue(undefined);
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
  function makePutRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
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
