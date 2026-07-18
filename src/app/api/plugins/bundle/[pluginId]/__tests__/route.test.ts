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

async function writeBundle(pluginId: string, content: string): Promise<void> {
  const dir = path.join(tmpDir, 'data', 'plugins', pluginId, 'dist');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'bundle.js'), content);
}

function makeRequest(pluginId: string): NextRequest {
  return new NextRequest(`http://localhost/api/plugins/bundle/${pluginId}`);
}

function makeContext(pluginId: string) {
  return { params: Promise.resolve({ pluginId }) };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-bundle-route-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

describe('GET /api/plugins/bundle/[pluginId]', () => {
  it('serves the bundle as application/javascript', async () => {
    await writeBundle('my-plugin', 'export default 42;');
    const res = await GET(makeRequest('my-plugin'), makeContext('my-plugin'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/javascript');
    expect(await res.text()).toBe('export default 42;');
  });

  it('returns 404 when the bundle file does not exist', async () => {
    await fs.mkdir(path.join(tmpDir, 'data', 'plugins', 'my-plugin'), { recursive: true });
    const res = await GET(makeRequest('my-plugin'), makeContext('my-plugin'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/not found/i);
  });

  it('returns 404 for an entirely unknown plugin', async () => {
    const res = await GET(makeRequest('nope'), makeContext('nope'));
    expect(res.status).toBe(404);
  });

  it('rejects a path-traversal pluginId (cannot escape the plugins dir)', async () => {
    // Plant a file one level up from the plugins directory.
    await fs.mkdir(path.join(tmpDir, 'data'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'data', 'secret.js'), 'TOP SECRET');
    const res = await GET(
      makeRequest('../../secret'),
      makeContext('../../secret'),
    );
    // getPluginBundlePath → sanitizePluginId throws inside the route's own
    // try/catch → errorResponse 500. The file is never served.
    expect(res.status).toBe(500);
    expect((await res.json()).detail).toMatch(/invalid plugin id/i);
  });

  it('rejects a pluginId containing a dot', async () => {
    const res = await GET(makeRequest('My.Plugin'), makeContext('My.Plugin'));
    expect(res.status).toBe(500);
    expect((await res.json()).detail).toMatch(/invalid plugin id/i);
  });
});
