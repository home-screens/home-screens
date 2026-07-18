import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { NextRequest } from 'next/server';

let tmpDir: string;
let origCwd: () => string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-auth-start-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  vi.resetModules();
});

afterEach(async () => {
  process.cwd = origCwd;
  vi.unstubAllGlobals();
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

async function seedInstalledGarmin(id: string, enabled = true) {
  const dir = path.join(tmpDir, 'data', 'plugins', id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({
    id, name: id, version: '1.0.0', moduleType: 'w', category: 'c',
    allowedDomains: ['connectapi.garmin.com'], auth: { type: 'garmin' },
  }));
  await fs.writeFile(path.join(tmpDir, 'data', 'plugins', 'installed.json'), JSON.stringify({
    schemaVersion: 1,
    plugins: [{ id, version: '1.0.0', installedAt: 'x', enabled, moduleType: 'w' }],
  }));
}

const ctx = (id: string) => ({ params: Promise.resolve({ pluginId: id }) });
function postReq(id: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/plugins/auth/${id}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function jsonResponse(body: unknown, init?: { status?: number; setCookie?: string[] }): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  for (const c of init?.setCookie ?? []) headers.append('set-cookie', c);
  return new Response(JSON.stringify(body), { status: init?.status ?? 200, headers });
}

describe('POST /api/plugins/auth/[pluginId]/start (garmin)', () => {
  it('404s when the plugin is not installed', async () => {
    const { POST } = await import('../route');
    const res = await POST(postReq('ghost', { email: 'a@b.c', password: 'x' }), ctx('ghost'));
    expect(res.status).toBe(404);
  });

  it('400s without credentials', async () => {
    await seedInstalledGarmin('garmin');
    const { POST } = await import('../route');
    const res = await POST(postReq('garmin', {}), ctx('garmin'));
    expect(res.status).toBe(400);
  });

  it('returns connected and stores tokens on a no-MFA login', async () => {
    await seedInstalledGarmin('garmin');
    // Route by URL: sign-in page prime, consumer fetch, login, OAuth1, exchange.
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('/mobile/sso/en/sign-in')) return new Response('<html></html>', { status: 200 });
      if (url.includes('thegarth.s3.amazonaws.com')) return jsonResponse({ consumer_key: 'ck', consumer_secret: 'cs' });
      if (url.includes('/mobile/api/login')) return jsonResponse({ serviceTicketId: 'ST' });
      if (url.includes('/preauthorized')) return new Response('oauth_token=OT1&oauth_token_secret=OS1', { status: 200 });
      if (url.includes('/exchange/')) return jsonResponse({ access_token: 'AT', token_type: 'Bearer', expires_in: 3600 });
      throw new Error(`unexpected fetch: ${url}`);
    }));
    const { POST } = await import('../route');
    const res = await POST(postReq('garmin', { email: 'a@b.c', password: 'pw' }), ctx('garmin'));
    expect(await res.json()).toMatchObject({ status: 'connected' });
    const { loadPluginTokens } = await import('@/lib/plugin-auth');
    expect(await loadPluginTokens('garmin')).toMatchObject({ access_token: 'AT' });
  });

  it('returns mfa_required and persists pending state on an MFA challenge', async () => {
    await seedInstalledGarmin('garmin');
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('/mobile/sso/en/sign-in')) return new Response('<html></html>', { status: 200 });
      if (url.includes('/mobile/api/login')) {
        return jsonResponse({ responseStatus: { type: 'MFA_REQUIRED' } }, { setCookie: ['S=1; Path=/'] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));
    const { POST } = await import('../route');
    const res = await POST(postReq('garmin', { email: 'a@b.c', password: 'pw' }), ctx('garmin'));
    expect(await res.json()).toMatchObject({ status: 'mfa_required' });
    const { loadPendingAuth } = await import('@/lib/plugin-auth');
    expect(await loadPendingAuth('garmin')).toMatchObject({ kind: 'garmin_mfa' });
  });
});
