import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// Bypass session auth but PRESERVE the withAuth try/catch → 500 behaviour, so a
// throw from the real installPlugin (SHA mismatch, path traversal) surfaces as
// the same 500 + detail the production route would return. `fetchWithTimeout`
// is the tarball download; we stub it per test.
vi.mock('@/lib/api-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-utils')>('@/lib/api-utils');
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
    withAuth: (
      handler: (req: unknown, ctx: unknown) => Promise<Response>,
      errorMsg: string,
    ) => async (req: unknown, ctx: unknown) => {
      try {
        return await handler(req, ctx);
      } catch (err) {
        if (err instanceof Response) return err;
        return actual.errorResponse(err, errorMsg);
      }
    },
  };
});

// Keep the REAL install/uninstall/enable pipeline (that's the code under test);
// only the remote registry fetch is stubbed.
vi.mock('@/lib/plugins', async () => {
  const actual = await vi.importActual<typeof import('@/lib/plugins')>('@/lib/plugins');
  return {
    ...actual,
    fetchRegistry: vi.fn(),
  };
});

vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));

import { NextRequest } from 'next/server';
import { POST, DELETE, PATCH } from '../route';
import { fetchWithTimeout } from '@/lib/api-utils';
import { fetchRegistry } from '@/lib/plugins';
import type { PluginRegistry } from '@/types/plugins';

const mockFetch = vi.mocked(fetchWithTimeout);
const mockRegistry = vi.mocked(fetchRegistry);

let tmpDir: string;
let origCwd: () => string;

function makeRequest(method: string, body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/plugins/install', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Build a well-formed plugin tarball (pkg/manifest.json + pkg/dist/bundle.js). */
function buildTarball(manifest: Record<string, unknown>, bundle = 'export default {}'): {
  buffer: Buffer;
  sha256: string;
} {
  const work = mkdtempSync(path.join(os.tmpdir(), 'hs-tar-'));
  try {
    const pkg = path.join(work, 'pkg');
    mkdirSync(path.join(pkg, 'dist'), { recursive: true });
    writeFileSync(path.join(pkg, 'manifest.json'), JSON.stringify(manifest));
    writeFileSync(path.join(pkg, 'dist', 'bundle.js'), bundle);
    const out = path.join(work, 'plugin.tgz');
    execFileSync('tar', ['-czf', out, '-C', work, 'pkg']);
    const buffer = readFileSync(out);
    return { buffer, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Build a wrapped tarball with a manifest but no dist/bundle.js. */
function buildBundlelessTarball(manifest: Record<string, unknown>): {
  buffer: Buffer;
  sha256: string;
} {
  const work = mkdtempSync(path.join(os.tmpdir(), 'hs-tar-nobundle-'));
  try {
    const pkg = path.join(work, 'pkg');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(path.join(pkg, 'manifest.json'), JSON.stringify(manifest));
    const out = path.join(work, 'plugin.tgz');
    execFileSync('tar', ['-czf', out, '-C', work, 'pkg']);
    const buffer = readFileSync(out);
    return { buffer, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Build a hostile tarball whose listing contains a `../` traversal entry. */
function buildTraversalTarball(): { buffer: Buffer; sha256: string } {
  const work = mkdtempSync(path.join(os.tmpdir(), 'hs-tar-evil-'));
  try {
    const root = path.join(work, 'root');
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(work, 'evil.txt'), 'pwned');
    const out = path.join(work, 'evil.tgz');
    // -P keeps the literal `../evil.txt` entry name instead of stripping it.
    execFileSync('tar', ['-cPzf', out, '../evil.txt'], { cwd: root });
    const buffer = readFileSync(out);
    return { buffer, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Build a flat tarball (no wrapping directory) — strip-components=1 leaves no manifest. */
function buildFlatTarball(): { buffer: Buffer; sha256: string } {
  const work = mkdtempSync(path.join(os.tmpdir(), 'hs-tar-flat-'));
  try {
    writeFileSync(path.join(work, 'manifest.json'), '{}');
    const out = path.join(work, 'flat.tgz');
    execFileSync('tar', ['-czf', out, '-C', work, 'manifest.json']);
    const buffer = readFileSync(out);
    return { buffer, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const VALID_MANIFEST = {
  id: 'test-plugin',
  name: 'Test Plugin',
  version: '1.0.0',
  moduleType: 'test-widget',
  category: 'fun',
};

function registryWith(id: string, version: string, downloadUrl: string, sha256: string): PluginRegistry {
  return {
    schemaVersion: 1,
    lastUpdated: '2026-01-01',
    plugins: [
      {
        id,
        name: 'Test Plugin',
        description: 'd',
        author: 'a',
        repo: 'https://example.com/repo',
        license: 'MIT',
        category: 'fun',
        tags: [],
        icon: 'box',
        verified: true,
        versions: [
          {
            version,
            minAppVersion: '0.0.0',
            releaseDate: '2026-01-01',
            downloadUrl,
            sha256,
          },
        ],
      },
    ],
  };
}

async function readInstalled(): Promise<{ plugins: Array<{ id: string; version: string; enabled: boolean; previousVersion?: string }> }> {
  const raw = await fs.readFile(path.join(tmpDir, 'data', 'plugins', 'installed.json'), 'utf-8');
  return JSON.parse(raw);
}

async function seedInstalled(plugins: unknown[]): Promise<void> {
  const dir = path.join(tmpDir, 'data', 'plugins');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'installed.json'),
    JSON.stringify({ schemaVersion: 1, plugins }),
  );
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-install-route-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  mockFetch.mockReset();
  mockRegistry.mockReset();
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

describe('POST /api/plugins/install — request validation', () => {
  it('returns 400 when pluginId is missing', async () => {
    const res = await POST(makeRequest('POST', { version: '1.0.0' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it('returns 400 when version is missing', async () => {
    const res = await POST(makeRequest('POST', { pluginId: 'test-plugin' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the plugin is not in the registry', async () => {
    mockRegistry.mockResolvedValue(registryWith('other', '1.0.0', 'https://x/p.tgz', 'a'.repeat(64)));
    const res = await POST(makeRequest('POST', { pluginId: 'test-plugin', version: '1.0.0' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/not found in registry/i);
  });

  it('returns 404 when the requested version is not published', async () => {
    mockRegistry.mockResolvedValue(registryWith('test-plugin', '1.0.0', 'https://x/p.tgz', 'a'.repeat(64)));
    const res = await POST(makeRequest('POST', { pluginId: 'test-plugin', version: '9.9.9' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/version not found/i);
  });
});

describe('POST /api/plugins/install — download failures', () => {
  it('returns 502 when the tarball download throws', async () => {
    mockRegistry.mockResolvedValue(registryWith('test-plugin', '1.0.0', 'https://x/p.tgz', 'a'.repeat(64)));
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await POST(makeRequest('POST', { pluginId: 'test-plugin', version: '1.0.0' }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/failed to download/i);
  });

  it('returns 502 when the tarball download is non-2xx', async () => {
    mockRegistry.mockResolvedValue(registryWith('test-plugin', '1.0.0', 'https://x/p.tgz', 'a'.repeat(64)));
    mockFetch.mockResolvedValue(new Response('nope', { status: 404 }));
    const res = await POST(makeRequest('POST', { pluginId: 'test-plugin', version: '1.0.0' }));
    expect(res.status).toBe(502);
  });
});

describe('POST /api/plugins/install — signature + tarball guards (real installPlugin)', () => {
  it('rejects a tarball whose SHA-256 does not match the registry digest', async () => {
    const { buffer } = buildTarball(VALID_MANIFEST);
    // Registry advertises a WRONG digest — the signature guard must reject.
    mockRegistry.mockResolvedValue(registryWith('test-plugin', '1.0.0', 'https://x/p.tgz', 'b'.repeat(64)));
    mockFetch.mockResolvedValue(new Response(new Uint8Array(buffer), { status: 200 }));
    const res = await POST(makeRequest('POST', { pluginId: 'test-plugin', version: '1.0.0' }));
    expect(res.status).toBe(500);
    expect((await res.json()).detail).toMatch(/sha-256 mismatch/i);
    // Nothing should have been written to disk.
    await expect(
      fs.access(path.join(tmpDir, 'data', 'plugins', 'test-plugin')),
    ).rejects.toThrow();
  });

  it('rejects a tarball containing a path-traversal (../) entry', async () => {
    const { buffer, sha256 } = buildTraversalTarball();
    mockRegistry.mockResolvedValue(registryWith('test-plugin', '1.0.0', 'https://x/p.tgz', sha256));
    mockFetch.mockResolvedValue(new Response(new Uint8Array(buffer), { status: 200 }));
    const res = await POST(makeRequest('POST', { pluginId: 'test-plugin', version: '1.0.0' }));
    expect(res.status).toBe(500);
    expect((await res.json()).detail).toMatch(/path traversal/i);
    // The escaped file must NOT have been written outside the plugin dir.
    await expect(fs.access(path.join(tmpDir, 'data', 'evil.txt'))).rejects.toThrow();
  });

  it('rejects a flat tarball missing manifest.json after extraction', async () => {
    const { buffer, sha256 } = buildFlatTarball();
    mockRegistry.mockResolvedValue(registryWith('test-plugin', '1.0.0', 'https://x/p.tgz', sha256));
    mockFetch.mockResolvedValue(new Response(new Uint8Array(buffer), { status: 200 }));
    const res = await POST(makeRequest('POST', { pluginId: 'test-plugin', version: '1.0.0' }));
    expect(res.status).toBe(500);
    expect((await res.json()).detail).toMatch(/manifest\.json is missing/i);
  });

  it('rejects a tarball with a valid manifest but no dist/bundle.js', async () => {
    const { buffer, sha256 } = buildBundlelessTarball(VALID_MANIFEST);
    mockRegistry.mockResolvedValue(registryWith('test-plugin', '1.0.0', 'https://x/p.tgz', sha256));
    mockFetch.mockResolvedValue(new Response(new Uint8Array(buffer), { status: 200 }));
    const res = await POST(makeRequest('POST', { pluginId: 'test-plugin', version: '1.0.0' }));
    expect(res.status).toBe(500);
    expect((await res.json()).detail).toMatch(/bundle is missing at dist\/bundle\.js/i);
    // Guard fired before promotion — nothing landed in the plugin dir.
    await expect(
      fs.access(path.join(tmpDir, 'data', 'plugins', 'test-plugin')),
    ).rejects.toThrow();
  });

  it('rejects a tarball whose manifest is malformed (missing required fields)', async () => {
    // Valid JSON, but not a valid manifest — validateExtractedPlugin must
    // reject via validateManifest, through the real install pipeline.
    const { buffer, sha256 } = buildTarball({ id: 'test-plugin', name: 'Only a name' });
    mockRegistry.mockResolvedValue(registryWith('test-plugin', '1.0.0', 'https://x/p.tgz', sha256));
    mockFetch.mockResolvedValue(new Response(new Uint8Array(buffer), { status: 200 }));
    const res = await POST(makeRequest('POST', { pluginId: 'test-plugin', version: '1.0.0' }));
    expect(res.status).toBe(500);
    const detail = (await res.json()).detail as string;
    expect(detail).toMatch(/manifest is invalid/i);
    expect(detail).toMatch(/version/);
    await expect(
      fs.access(path.join(tmpDir, 'data', 'plugins', 'test-plugin')),
    ).rejects.toThrow();
  });
});

describe('POST /api/plugins/install — successful install', () => {
  it('lands the plugin files and an installed.json entry for a valid tarball', async () => {
    const { buffer, sha256 } = buildTarball(VALID_MANIFEST);
    mockRegistry.mockResolvedValue(registryWith('test-plugin', '1.0.0', 'https://x/p.tgz', sha256));
    mockFetch.mockResolvedValue(new Response(new Uint8Array(buffer), { status: 200 }));

    const res = await POST(makeRequest('POST', { pluginId: 'test-plugin', version: '1.0.0' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // Files landed under the plugin directory.
    const base = path.join(tmpDir, 'data', 'plugins', 'test-plugin');
    expect(await fs.readFile(path.join(base, 'manifest.json'), 'utf-8')).toContain('test-plugin');
    await expect(fs.access(path.join(base, 'dist', 'bundle.js'))).resolves.toBeUndefined();

    // installed.json records the plugin.
    const installed = await readInstalled();
    expect(installed.plugins).toEqual([
      expect.objectContaining({ id: 'test-plugin', version: '1.0.0', enabled: true }),
    ]);
  });
});

describe('DELETE /api/plugins/install', () => {
  it('returns 400 when pluginId is missing', async () => {
    const res = await DELETE(makeRequest('DELETE', {}));
    expect(res.status).toBe(400);
  });

  it('removes the plugin directory and its installed.json entry', async () => {
    const base = path.join(tmpDir, 'data', 'plugins', 'gone');
    await fs.mkdir(base, { recursive: true });
    await fs.writeFile(path.join(base, 'manifest.json'), '{}');
    await seedInstalled([{ id: 'gone', version: '1.0.0', enabled: true, moduleType: 'x' }]);

    const res = await DELETE(makeRequest('DELETE', { pluginId: 'gone' }));
    expect(res.status).toBe(200);
    await expect(fs.access(base)).rejects.toThrow();
    expect((await readInstalled()).plugins).toEqual([]);
  });
});

describe('PATCH /api/plugins/install', () => {
  it('returns 400 when pluginId is missing', async () => {
    const res = await PATCH(makeRequest('PATCH', { enabled: false }));
    expect(res.status).toBe(400);
  });

  it('toggles the enabled flag on the installed entry', async () => {
    await seedInstalled([{ id: 'p', version: '1.0.0', enabled: true, moduleType: 'x' }]);
    const res = await PATCH(makeRequest('PATCH', { pluginId: 'p', enabled: false }));
    expect(res.status).toBe(200);
    expect((await readInstalled()).plugins[0].enabled).toBe(false);
  });

  it('clears previousVersion when clearPrevVersion is set', async () => {
    await seedInstalled([
      { id: 'p', version: '2.0.0', enabled: true, moduleType: 'x', previousVersion: '1.0.0' },
    ]);
    const res = await PATCH(makeRequest('PATCH', { pluginId: 'p', clearPrevVersion: true }));
    expect(res.status).toBe(200);
    expect((await readInstalled()).plugins[0].previousVersion).toBeUndefined();
  });
});
