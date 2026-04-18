import { describe, it, expect, beforeEach } from 'vitest';

describe('POST /api/display/console-log', () => {
  beforeEach(async () => {
    const { __resetForTests } = await import('@/lib/display-commands');
    __resetForTests();
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
