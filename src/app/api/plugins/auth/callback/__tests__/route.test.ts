import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { NextRequest } from 'next/server';

let tmpDir: string;
let origCwd: () => string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-auth-callback-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  vi.resetModules();
});

afterEach(async () => {
  process.cwd = origCwd;
  vi.unstubAllGlobals();
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

async function seedOAuthPlugin(id: string) {
  const dir = path.join(tmpDir, 'data', 'plugins', id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({
    id, name: id, version: '1.0.0', moduleType: 'w', category: 'c',
    secrets: [{ key: 'client_id', label: 'Client ID', required: true }],
    allowedDomains: ['api.example.com'],
    auth: {
      type: 'oauth2', flow: 'authorization_code',
      authorizationUrl: 'https://auth.example.com/authorize',
      tokenUrl: 'https://auth.example.com/token',
      scopes: ['read'], tokenPlacement: 'header', secrets: { clientId: 'client_id' },
    },
  }));
  const secretsDir = path.join(tmpDir, 'data', 'plugin-secrets');
  await fs.mkdir(secretsDir, { recursive: true });
  await fs.writeFile(path.join(secretsDir, `${id}.json`), JSON.stringify({ client_id: 'cid' }));
}

const req = (query: string) => new NextRequest(`http://localhost/api/plugins/auth/callback${query}`);

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('GET /api/plugins/auth/callback', () => {
  it('exchanges the code and renders a success page for a valid signed state', async () => {
    await seedOAuthPlugin('p1');
    const { signAuthFlowState, savePendingAuth, loadPluginTokens } = await import('@/lib/plugin-auth');
    await savePendingAuth('p1', { kind: 'authorization_code', redirectUri: 'http://localhost/api/plugins/auth/callback' });
    const state = await signAuthFlowState('p1');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 })));

    const { GET } = await import('../route');
    const res = await GET(req(`?code=abc&state=${encodeURIComponent(state)}`));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Connected');
    expect(html).toContain('plugin-auth-success');
    expect(await loadPluginTokens('p1')).toMatchObject({ access_token: 'AT' });
  });

  it('renders a failure page for an invalid state', async () => {
    const { GET } = await import('../route');
    const res = await GET(req('?code=abc&state=bogus'));
    const html = await res.text();
    expect(html).toContain('Sign-in failed');
    expect(html).not.toContain('plugin-auth-success');
  });

  it('renders a failure page when the provider returns an error', async () => {
    const { GET } = await import('../route');
    const res = await GET(req('?error=access_denied'));
    expect(await res.text()).toContain('Sign-in failed');
  });
});
