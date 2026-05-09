import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Bypass display auth — every test here exercises the handler directly.
vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn().mockResolvedValue(undefined),
  requireSession: vi.fn().mockResolvedValue(undefined),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

import { NextRequest } from 'next/server';
import { GET } from '../route';

let tmpDir: string;
let origCwd: () => string;

async function writeAsset(pluginId: string, relPath: string, body: string): Promise<void> {
  const dir = path.join(tmpDir, 'data', 'plugins', pluginId, ...relPath.split('/').slice(0, -1));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, path.basename(relPath)), body);
}

function makeRequest(pluginId: string, segments: string[]): NextRequest {
  const url = `http://localhost/api/plugins/asset/${pluginId}/${segments.join('/')}`;
  return new NextRequest(url);
}

function makeContext(pluginId: string, segments: string[]) {
  return { params: Promise.resolve({ pluginId, path: segments }) };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-asset-route-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

describe('GET /api/plugins/asset/[pluginId]/[...path]', () => {
  it('returns the file with application/json Content-Type for .json assets', async () => {
    await writeAsset('my-plugin', 'translations/en-US.json', '{"hello":"hi"}');

    const res = await GET(
      makeRequest('my-plugin', ['translations', 'en-US.json']),
      makeContext('my-plugin', ['translations', 'en-US.json']),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300');
    expect(await res.text()).toBe('{"hello":"hi"}');
  });

  it('serves an existing JSON file as application/json', async () => {
    await writeAsset('my-plugin', 'data.json', '{"foo":42}');

    const res = await GET(
      makeRequest('my-plugin', ['data.json']),
      makeContext('my-plugin', ['data.json']),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
  });

  it('serves non-JSON files as application/octet-stream', async () => {
    await writeAsset('my-plugin', 'icon.bin', 'binary-bytes');

    const res = await GET(
      makeRequest('my-plugin', ['icon.bin']),
      makeContext('my-plugin', ['icon.bin']),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
  });

  it('returns 400 for invalid pluginId (path traversal)', async () => {
    const res = await GET(
      makeRequest('..%2F..%2Fetc', ['passwd']),
      makeContext('../../../etc', ['passwd']),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid plugin id/i);
  });

  it('returns 400 for invalid pluginId (dot)', async () => {
    const res = await GET(
      makeRequest('My.Plugin', ['file.json']),
      makeContext('My.Plugin', ['file.json']),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid plugin id/i);
  });

  it('returns 400 for parent-directory traversal in path segments', async () => {
    await writeAsset('my-plugin', 'translations/en-US.json', '{"hello":"hi"}');

    const res = await GET(
      makeRequest('my-plugin', ['..', 'bundle.js']),
      makeContext('my-plugin', ['..', 'bundle.js']),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid asset path/i);
  });

  it('returns 400 for nested traversal (translations/../../../etc/passwd)', async () => {
    await writeAsset('my-plugin', 'translations/en-US.json', '{"hello":"hi"}');

    const res = await GET(
      makeRequest('my-plugin', ['translations', '..', '..', '..', 'etc', 'passwd']),
      makeContext('my-plugin', ['translations', '..', '..', '..', 'etc', 'passwd']),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid asset path/i);
  });

  it('returns 400 for empty path segments', async () => {
    const res = await GET(
      makeRequest('my-plugin', ['']),
      makeContext('my-plugin', ['']),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for backslash injection in path', async () => {
    const res = await GET(
      makeRequest('my-plugin', ['win\\path.json']),
      makeContext('my-plugin', ['win\\path.json']),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for embedded NUL bytes', async () => {
    const res = await GET(
      makeRequest('my-plugin', ['file.json']),
      makeContext('my-plugin', ['file\0.json']),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the file does not exist', async () => {
    // Plugin directory exists, file does not.
    await fs.mkdir(path.join(tmpDir, 'data', 'plugins', 'my-plugin'), { recursive: true });

    const res = await GET(
      makeRequest('my-plugin', ['translations', 'en-US.json']),
      makeContext('my-plugin', ['translations', 'en-US.json']),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 404 when the path resolves to a directory, not a file', async () => {
    // Create a directory but not a file at the requested path.
    await fs.mkdir(path.join(tmpDir, 'data', 'plugins', 'my-plugin', 'translations'), {
      recursive: true,
    });

    const res = await GET(
      makeRequest('my-plugin', ['translations']),
      makeContext('my-plugin', ['translations']),
    );
    expect(res.status).toBe(404);
  });

  it('does not let pluginId "foo" reach files in pluginId "foo-bar"', async () => {
    // Sanity check on the trailing-separator containment guard. The
    // resolved path for "foo" + "../foo-bar/secret" would normalise to
    // the foo-bar directory; the segment-level filter rejects `..`
    // before resolution can even happen.
    await writeAsset('foo-bar', 'secret.json', '{"secret":true}');

    const res = await GET(
      makeRequest('foo', ['..', 'foo-bar', 'secret.json']),
      makeContext('foo', ['..', 'foo-bar', 'secret.json']),
    );
    expect(res.status).toBe(400);
  });
});
