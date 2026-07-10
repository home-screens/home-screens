import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { signMediaToken } from '@/lib/media-token';

// Controllable auth: `authRejects` simulates auth-enabled with no valid
// Bearer/session/IP credential; `secret` is the media-token signing secret.
const authState = vi.hoisted(() => ({ authRejects: false, secret: null as string | null }));

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {
    if (authState.authRejects) throw new Response('{"error":"Authentication required"}', { status: 401 });
  }),
  requireDisplayAuth: vi.fn(async () => {
    if (authState.authRejects) throw new Response('{"error":"Authentication required"}', { status: 401 });
  }),
  getMediaTokenSecret: vi.fn(async () => authState.secret),
  isAuthEnabled: vi.fn(async () => authState.secret !== null),
}));

const SECRET = 's'.repeat(64);
// 1000 distinguishable bytes so range assertions can verify exact slices
const VIDEO_BYTES = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));

let tmpDir: string;
let origCwd: () => string;
let bgsDir: string;

beforeEach(async () => {
  authState.authRejects = false;
  authState.secret = null;
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bg-serve-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  bgsDir = path.join(tmpDir, 'public', 'backgrounds');
  await fs.mkdir(bgsDir, { recursive: true });
  vi.resetModules();
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function getGET() {
  const mod = await import('@/app/api/backgrounds/serve/route');
  return mod.GET;
}

function makeRequest(params: Record<string, string>, headers?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/backgrounds/serve');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url, { headers });
}

describe('video streaming with Range support', () => {
  beforeEach(async () => {
    await fs.writeFile(path.join(bgsDir, 'clip.mp4'), VIDEO_BYTES);
  });

  it('serves the full file with 200 when no Range header is sent', async () => {
    const GET = await getGET();
    const res = await GET(makeRequest({ file: 'clip.mp4' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('video/mp4');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('Content-Length')).toBe('1000');
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.equals(VIDEO_BYTES)).toBe(true);
  });

  it('serves a mid-file range as 206 with exact bytes', async () => {
    const GET = await getGET();
    const res = await GET(makeRequest({ file: 'clip.mp4' }, { range: 'bytes=100-199' }));
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 100-199/1000');
    expect(res.headers.get('Content-Length')).toBe('100');
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.equals(VIDEO_BYTES.subarray(100, 200))).toBe(true);
  });

  it('serves an open-ended range to EOF', async () => {
    const GET = await getGET();
    const res = await GET(makeRequest({ file: 'clip.mp4' }, { range: 'bytes=900-' }));
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 900-999/1000');
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.equals(VIDEO_BYTES.subarray(900))).toBe(true);
  });

  it('returns 416 with the file size for an unsatisfiable range', async () => {
    const GET = await getGET();
    const res = await GET(makeRequest({ file: 'clip.mp4' }, { range: 'bytes=5000-' }));
    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe('bytes */1000');
  });

  it('returns 416 for a malformed Range header', async () => {
    const GET = await getGET();
    const res = await GET(makeRequest({ file: 'clip.mp4' }, { range: 'bytes=oops' }));
    expect(res.status).toBe(416);
  });

  it('returns 404 for a missing video file', async () => {
    const GET = await getGET();
    const res = await GET(makeRequest({ file: 'ghost.mp4' }));
    expect(res.status).toBe(404);
  });

  it('serves .webm and .mov with their video MIME types', async () => {
    const GET = await getGET();
    await fs.writeFile(path.join(bgsDir, 'a.webm'), VIDEO_BYTES);
    await fs.writeFile(path.join(bgsDir, 'b.mov'), VIDEO_BYTES);
    expect((await GET(makeRequest({ file: 'a.webm' }))).headers.get('Content-Type')).toBe('video/webm');
    expect((await GET(makeRequest({ file: 'b.mov' }))).headers.get('Content-Type')).toBe('video/quicktime');
  });
});

describe('media token gate (auth enabled, no Bearer/session)', () => {
  beforeEach(async () => {
    authState.authRejects = true;
    authState.secret = SECRET;
    await fs.writeFile(path.join(bgsDir, 'clip.mp4'), VIDEO_BYTES);
    await fs.writeFile(path.join(bgsDir, 'photo.jpg'), Buffer.from('jpeg-bytes'));
  });

  it('rejects a video request without a token', async () => {
    const GET = await getGET();
    const res = await GET(makeRequest({ file: 'clip.mp4' }));
    expect(res.status).toBe(401);
  });

  it('accepts a video request with a valid token bound to the file', async () => {
    const GET = await getGET();
    const mt = signMediaToken(SECRET, 'clip.mp4');
    const res = await GET(makeRequest({ file: 'clip.mp4', mt }));
    expect(res.status).toBe(200);
  });

  it('rejects a token minted for a different file', async () => {
    const GET = await getGET();
    const mt = signMediaToken(SECRET, 'other.mp4');
    const res = await GET(makeRequest({ file: 'clip.mp4', mt }));
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const GET = await getGET();
    const mt = signMediaToken(SECRET, 'clip.mp4', -1000);
    const res = await GET(makeRequest({ file: 'clip.mp4', mt }));
    expect(res.status).toBe(401);
  });

  it('still rejects images without any credential', async () => {
    const GET = await getGET();
    const res = await GET(makeRequest({ file: 'photo.jpg' }));
    expect(res.status).toBe(401);
  });

  it('accepts images with a Bearer credential (requireDisplayAuth passes)', async () => {
    authState.authRejects = false;
    const GET = await getGET();
    const res = await GET(makeRequest({ file: 'photo.jpg' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
  });
});

describe('auth disabled', () => {
  it('serves video without any token', async () => {
    await fs.writeFile(path.join(bgsDir, 'clip.mp4'), VIDEO_BYTES);
    const GET = await getGET();
    const res = await GET(makeRequest({ file: 'clip.mp4' }));
    expect(res.status).toBe(200);
  });
});

describe('path safety', () => {
  it('rejects traversal in the file parameter', async () => {
    const GET = await getGET();
    const res = await GET(makeRequest({ file: '../../etc/passwd' }));
    expect(res.status).toBe(400);
  });

  it('rejects traversal to a video outside the backgrounds root', async () => {
    await fs.writeFile(path.join(tmpDir, 'outside.mp4'), VIDEO_BYTES);
    const GET = await getGET();
    const res = await GET(makeRequest({ file: '../../outside.mp4' }));
    expect(res.status).toBe(400);
  });
});
