import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { NextRequest } from 'next/server';

let tmpDir: string;
let origCwd: () => string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-auth-poll-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  vi.resetModules();
});

afterEach(async () => {
  process.cwd = origCwd;
  vi.unstubAllGlobals();
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

async function seedInstalledGarmin(id: string) {
  const dir = path.join(tmpDir, 'data', 'plugins', id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({
    id, name: id, version: '1.0.0', moduleType: 'w', category: 'c',
    allowedDomains: ['connectapi.garmin.com'], auth: { type: 'garmin' },
  }));
  await fs.writeFile(path.join(tmpDir, 'data', 'plugins', 'installed.json'), JSON.stringify({
    schemaVersion: 1,
    plugins: [{ id, version: '1.0.0', installedAt: 'x', enabled: true, moduleType: 'w' }],
  }));
}

const ctx = (id: string) => ({ params: Promise.resolve({ pluginId: id }) });
function putReq(id: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/plugins/auth/${id}/poll`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function jsonResponse(body: unknown, init?: { status?: number }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('PUT /api/plugins/auth/[pluginId]/poll (garmin MFA)', () => {
  it('409s when there is no pending MFA state', async () => {
    await seedInstalledGarmin('garmin');
    const { PUT } = await import('../route');
    const res = await PUT(putReq('garmin', { mfaCode: '123456' }), ctx('garmin'));
    expect(res.status).toBe(409);
  });

  it('completes MFA and stores tokens with a valid code', async () => {
    await seedInstalledGarmin('garmin');
    const { savePendingAuth, loadPluginTokens } = await import('@/lib/plugin-auth');
    await savePendingAuth('garmin', { kind: 'garmin_mfa', mfa: { cookies: ['S=1'], mfaMethod: 'email' } });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('thegarth.s3.amazonaws.com')) return jsonResponse({ consumer_key: 'ck', consumer_secret: 'cs' });
      if (url.includes('mfa/verifyCode')) return jsonResponse({ serviceTicketId: 'ST' });
      if (url.includes('/preauthorized')) return new Response('oauth_token=OT1&oauth_token_secret=OS1', { status: 200 });
      if (url.includes('/exchange/')) return jsonResponse({ access_token: 'AT', token_type: 'Bearer', expires_in: 3600 });
      throw new Error(`unexpected fetch: ${url}`);
    }));

    const { PUT } = await import('../route');
    const res = await PUT(putReq('garmin', { mfaCode: '123456' }), ctx('garmin'));
    expect(await res.json()).toMatchObject({ status: 'connected' });
    expect(await loadPluginTokens('garmin')).toMatchObject({ access_token: 'AT' });
  });

  it('reports a wrong code as retryable', async () => {
    await seedInstalledGarmin('garmin');
    const { savePendingAuth } = await import('@/lib/plugin-auth');
    await savePendingAuth('garmin', { kind: 'garmin_mfa', mfa: { cookies: ['S=1'], mfaMethod: 'email' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ responseStatus: { type: 'INVALID' } }, { status: 401 })));

    const { PUT } = await import('../route');
    const res = await PUT(putReq('garmin', { mfaCode: '000000' }), ctx('garmin'));
    expect(await res.json()).toMatchObject({ status: 'mfa_required' });
  });
});
