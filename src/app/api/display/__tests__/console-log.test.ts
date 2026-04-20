import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Run each test against a fresh tmp cwd so parallel workers can't race the
// real data/auth.json. With no auth.json in the tmp dir, `requireDisplayAuth`
// is a no-op (passwordHash is null), matching the intent of these tests.
describe('POST /api/display/console-log', () => {
  let tmpDir: string;
  let origCwd: () => string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-screens-console-log-test-'));
    origCwd = process.cwd;
    process.cwd = () => tmpDir;
    const { clearAuthCache } = await import('@/lib/auth');
    clearAuthCache();
    const { __resetForTests } = await import('@/lib/display-commands');
    __resetForTests();
  });

  afterEach(async () => {
    const { clearAuthCache } = await import('@/lib/auth');
    process.cwd = origCwd;
    clearAuthCache();
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  it('stores entries keyed by displayId so the bundle endpoint can fetch them', async () => {
    const { POST } = await import('../console-log/route');
    const { getConsoleLog } = await import('@/lib/display-commands');

    const body = {
      displayId: 'kitchen',
      entries: [
        { level: 'error', message: 'oops', timestamp: Date.now() },
        { level: 'log',   message: 'hello', timestamp: Date.now() },
      ],
    };
    const req = new Request('http://localhost/api/display/console-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as unknown as import('next/server').NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(getConsoleLog('kitchen')).toHaveLength(2);
  });

  it('rejects an invalid displayId', async () => {
    const { POST } = await import('../console-log/route');
    const req = new Request('http://localhost/api/display/console-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayId: 'All Displays!', entries: [] }),
    }) as unknown as import('next/server').NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
