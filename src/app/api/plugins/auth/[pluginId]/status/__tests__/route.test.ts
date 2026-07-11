import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { NextRequest } from 'next/server';

let tmpDir: string;
let origCwd: () => string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-auth-status-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  vi.resetModules();
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

async function seedManifest(id: string, auth: unknown) {
  const dir = path.join(tmpDir, 'data', 'plugins', id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({
    id, name: id, version: '1.0.0', moduleType: 'w', category: 'c', ...(auth ? { auth } : {}),
  }));
}

const ctx = (id: string) => ({ params: Promise.resolve({ pluginId: id }) });
const req = (id: string) => new NextRequest(`http://localhost/api/plugins/auth/${id}/status`);

describe('GET /api/plugins/auth/[pluginId]/status', () => {
  it('404s when the plugin declares no auth adapter', async () => {
    await seedManifest('p1', null);
    const { GET } = await import('../route');
    const res = await GET(req('p1'), ctx('p1'));
    expect(res.status).toBe(404);
  });

  it('reports disconnected before any tokens exist', async () => {
    await seedManifest('p1', { type: 'garmin' });
    const { GET } = await import('../route');
    const res = await GET(req('p1'), ctx('p1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ connected: false });
  });

  it('reports connected once tokens are stored', async () => {
    await seedManifest('p1', { type: 'garmin' });
    const { savePluginTokens } = await import('@/lib/plugin-auth');
    await savePluginTokens('p1', { access_token: 'a', token_type: 'Bearer', expiry_date: Date.now() + 100000 });
    const { GET } = await import('../route');
    const res = await GET(req('p1'), ctx('p1'));
    expect(await res.json()).toMatchObject({ connected: true });
  });
});
