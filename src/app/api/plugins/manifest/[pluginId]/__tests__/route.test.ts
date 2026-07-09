import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Bypass display auth — the handler is exercised directly.
vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn().mockResolvedValue(undefined),
  requireSession: vi.fn().mockResolvedValue(undefined),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

import { NextRequest } from 'next/server';
import { GET } from '../route';

let tmpDir: string;
let origCwd: () => string;

async function writeManifest(pluginId: string, manifest: unknown): Promise<void> {
  const dir = path.join(tmpDir, 'data', 'plugins', pluginId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
}

function makeRequest(pluginId: string): NextRequest {
  return new NextRequest(`http://localhost/api/plugins/manifest/${pluginId}`);
}

function makeContext(pluginId: string) {
  return { params: Promise.resolve({ pluginId }) };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-manifest-route-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

describe('GET /api/plugins/manifest/[pluginId]', () => {
  it('returns the manifest JSON for an installed plugin', async () => {
    const manifest = { id: 'my-plugin', name: 'My Plugin', version: '1.0.0' };
    await writeManifest('my-plugin', manifest);
    const res = await GET(makeRequest('my-plugin'), makeContext('my-plugin'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(manifest);
  });

  it('returns 404 for an unknown plugin', async () => {
    const res = await GET(makeRequest('nope'), makeContext('nope'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/not found/i);
  });

  it('returns 404 for a path-traversal pluginId (cannot read outside plugins dir)', async () => {
    // Plant a manifest-shaped file above the plugins directory.
    await fs.mkdir(path.join(tmpDir, 'data'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'data', 'manifest.json'), '{"id":"escaped"}');
    // getPluginManifest swallows the sanitize throw and returns null → 404.
    const res = await GET(makeRequest('..%2F..'), makeContext('../../'));
    expect(res.status).toBe(404);
  });
});
