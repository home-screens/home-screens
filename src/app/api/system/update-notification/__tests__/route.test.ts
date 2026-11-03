import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { NextRequest } from 'next/server';

// Bypass withDisplayAuth (GET) and withAuth (POST) by making both guards no-ops.
// This mirrors the pattern used in src/app/api/config/__tests__/route.test.ts
// and src/app/api/chores/data/__tests__/route.test.ts.
vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

let tmpDir: string;
let origCwd: () => string;

// Route module re-imported each test so the json-store's lazy process.cwd()
// call resolves to our tmpDir rather than the real project root.
let GET: (req: NextRequest) => Promise<Response>;
let POST: (req: NextRequest) => Promise<Response>;

async function seedStateFile(data: object): Promise<void> {
  const dataDir = path.join(tmpDir, 'data');
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    path.join(dataDir, 'update-notification-state.json'),
    JSON.stringify(data),
    'utf-8',
  );
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/system/update-notification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-screens-update-notif-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;

  vi.resetModules();
  const route = await import('@/app/api/system/update-notification/route');
  GET = route.GET as unknown as (req: NextRequest) => Promise<Response>;
  POST = route.POST as unknown as (req: NextRequest) => Promise<Response>;
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

// ---------------------------------------------------------------------------
// GET tests
// ---------------------------------------------------------------------------

describe('GET /api/system/update-notification', () => {
  it('returns the persisted state when the file exists', async () => {
    await seedStateFile({ lastDismissedVersion: 'v1.5.0' });

    const req = new NextRequest('http://localhost/api/system/update-notification');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ lastDismissedVersion: 'v1.5.0' });
  });

  it('returns the default state when no file exists', async () => {
    const req = new NextRequest('http://localhost/api/system/update-notification');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ lastDismissedVersion: null });
  });
});

// ---------------------------------------------------------------------------
// POST tests
// ---------------------------------------------------------------------------

describe('POST /api/system/update-notification', () => {
  it('dismiss writes the version and returns it', async () => {
    const res = await POST(makePostRequest({ action: 'dismiss', version: 'v1.6.0' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ lastDismissedVersion: 'v1.6.0' });

    // Verify the value is actually persisted.
    const req = new NextRequest('http://localhost/api/system/update-notification');
    const getRes = await GET(req);
    const getJson = await getRes.json();
    expect(getJson).toEqual({ lastDismissedVersion: 'v1.6.0' });
  });

  it('returns 400 for an unknown action', async () => {
    const res = await POST(makePostRequest({ action: 'frobnicate' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: 'Invalid action' });
  });

  it('returns 400 when version is missing', async () => {
    const res = await POST(makePostRequest({ action: 'dismiss' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: 'Invalid version' });
  });

  it('returns 400 when version is not a string', async () => {
    const res = await POST(makePostRequest({ action: 'dismiss', version: 42 }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: 'Invalid version' });
  });

  it('returns 400 when version exceeds 64 characters', async () => {
    // 'v' + 64 'a's = 65 characters total
    const longVersion = 'v' + 'a'.repeat(64);
    const res = await POST(makePostRequest({ action: 'dismiss', version: longVersion }));

    expect(res.status).toBe(400);
  });

  it('returns 400 when version is whitespace-only', async () => {
    const res = await POST(makePostRequest({ action: 'dismiss', version: '   ' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: 'Invalid version' });
  });

  it('clears the failed-update marker on clearFailedUpdate', async () => {
    const marker = path.join(tmpDir, 'data', 'upgrade-failed.json');
    await fs.mkdir(path.dirname(marker), { recursive: true });
    await fs.writeFile(marker, JSON.stringify({ tag: 'v2.0.0', reason: 'did-not-start', at: '2026-09-18T10:00:00Z' }));

    const { readFailedUpdate } = await import('@/lib/upgrade-failed-state');
    expect(await readFailedUpdate()).toEqual({ tag: 'v2.0.0', reason: 'did-not-start', at: '2026-09-18T10:00:00Z' });

    const res = await POST(makePostRequest({ action: 'clearFailedUpdate' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await readFailedUpdate()).toBeNull();

    // Clearing twice is fine; the marker is simply absent.
    expect((await POST(makePostRequest({ action: 'clearFailedUpdate' }))).status).toBe(200);
  });

  it('reads a malformed marker as absent', async () => {
    const marker = path.join(tmpDir, 'data', 'upgrade-failed.json');
    await fs.mkdir(path.dirname(marker), { recursive: true });
    await fs.writeFile(marker, '{"reason":"did-not-start"}');
    const { readFailedUpdate } = await import('@/lib/upgrade-failed-state');
    expect(await readFailedUpdate()).toBeNull();
  });

  it('returns 400 when the request body is malformed JSON', async () => {
    const req = new NextRequest('http://localhost/api/system/update-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: 'Invalid JSON body' });
  });
});
