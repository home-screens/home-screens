import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { NextRequest } from 'next/server';

// Auth is the only dependency we stub — everything else runs for real against
// a temp data/ directory, so validation + the installed.json atomic write are
// exercised end to end.
vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

let tmpDir: string;
let origCwd: () => string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-plugin-settings-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  vi.resetModules();
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

const SCHEMA = {
  type: 'object',
  properties: {
    haUrl: { type: 'string', title: 'Server address' },
    fastUpdates: { type: 'boolean', title: 'Fast updates', default: true },
  },
};

async function seedPlugin(id: string, opts: { settingsSchema?: unknown } = { settingsSchema: SCHEMA }) {
  const dir = path.join(tmpDir, 'data', 'plugins', id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({
    id, name: id, version: '1.0.0', moduleType: 'w', category: 'c',
    ...(opts.settingsSchema ? { settingsSchema: opts.settingsSchema } : {}),
  }));
  await fs.writeFile(
    path.join(tmpDir, 'data', 'plugins', 'installed.json'),
    JSON.stringify({
      schemaVersion: 1,
      plugins: [{ id, version: '1.0.0', installedAt: '2026-01-01T00:00:00.000Z', enabled: true, moduleType: 'w' }],
    }),
  );
}

const ctx = (id: string) => ({ params: Promise.resolve({ pluginId: id }) });
const getReq = (id: string) => new NextRequest(`http://localhost/api/plugins/settings/${id}`);
const putReq = (id: string, body: unknown) =>
  new NextRequest(`http://localhost/api/plugins/settings/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('GET /api/plugins/settings/[pluginId]', () => {
  it('404s for an unknown plugin', async () => {
    const { GET } = await import('../route');
    const res = await GET(getReq('nope'), ctx('nope'));
    expect(res.status).toBe(404);
  });

  it('returns {} before any settings are saved', async () => {
    await seedPlugin('p1');
    const { GET } = await import('../route');
    const res = await GET(getReq('p1'), ctx('p1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ settings: {} });
  });
});

describe('PUT /api/plugins/settings/[pluginId]', () => {
  it('round-trips declared settings through installed.json', async () => {
    await seedPlugin('p1');
    const { GET, PUT } = await import('../route');

    const put = await PUT(putReq('p1', { settings: { haUrl: 'http://ha.local:8123', fastUpdates: false } }), ctx('p1'));
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({
      ok: true,
      settings: { haUrl: 'http://ha.local:8123', fastUpdates: false },
    });

    const get = await GET(getReq('p1'), ctx('p1'));
    expect(await get.json()).toEqual({
      settings: { haUrl: 'http://ha.local:8123', fastUpdates: false },
    });
  });

  it('drops keys the schema does not declare', async () => {
    await seedPlugin('p1');
    const { PUT } = await import('../route');
    const res = await PUT(putReq('p1', { settings: { haUrl: 'x', sneaky: 'value' } }), ctx('p1'));
    expect(res.status).toBe(200);
    expect((await res.json()).settings).toEqual({ haUrl: 'x' });
  });

  it('400s on a type mismatch against the schema', async () => {
    await seedPlugin('p1');
    const { PUT } = await import('../route');
    const res = await PUT(putReq('p1', { settings: { fastUpdates: 'yes' } }), ctx('p1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('fastUpdates');
  });

  it('400s when the plugin declares no settingsSchema', async () => {
    await seedPlugin('p1', { settingsSchema: undefined });
    const { PUT } = await import('../route');
    const res = await PUT(putReq('p1', { settings: { haUrl: 'x' } }), ctx('p1'));
    expect(res.status).toBe(400);
  });

  it('400s when the body has no settings key', async () => {
    await seedPlugin('p1');
    const { PUT } = await import('../route');
    const res = await PUT(putReq('p1', {}), ctx('p1'));
    expect(res.status).toBe(400);
  });

  it('400s when settings is not an object', async () => {
    await seedPlugin('p1');
    const { PUT } = await import('../route');
    const res = await PUT(putReq('p1', { settings: ['not', 'an', 'object'] }), ctx('p1'));
    expect(res.status).toBe(400);
  });

  it('does NOT change the pluginHash — settings updates must not trigger a bundle reload', async () => {
    await seedPlugin('p1');
    const { PUT } = await import('../route');
    const { getPluginHash } = await import('@/lib/plugins');

    const before = await getPluginHash();
    await PUT(putReq('p1', { settings: { haUrl: 'http://ha.local' } }), ctx('p1'));
    const after = await getPluginHash();
    expect(after).toBe(before);
  });
});
