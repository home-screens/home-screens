import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';

// Auth on: display auth refuses, so only a valid media token gets through.
const authState = vi.hoisted(() => ({ displayOk: false }));

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(async () => {
    if (!authState.displayOk) throw new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 });
  }),
  isAuthEnabled: vi.fn().mockResolvedValue(true),
  getMediaTokenSecret: vi.fn(async () => 'secret'),
}));

import { GET } from '../route';
import { CUSTOM_ICON_DIR, addCustomIcon } from '@/lib/custom-icon-data';
import { withUrls } from '@/lib/custom-icon-http';
import { signMediaToken } from '@/lib/media-token';

beforeEach(async () => {
  authState.displayOk = false;
  await fs.rm(path.join(process.cwd(), CUSTOM_ICON_DIR), { recursive: true, force: true });
});

async function seed() {
  return (await addCustomIcon(await sharp({ create: { width: 40, height: 40, channels: 4, background: '#38bdf8' } }).png().toBuffer(), 'Water')).icon;
}

describe('/api/custom-icons/serve', () => {
  it('serves the picture to a URL from the catalog, and lets the browser keep it', async () => {
    const [entry] = await withUrls([await seed()]);
    const res = await GET(new NextRequest(`http://localhost${entry.url}`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).format).toBe('webp');
  });

  it('refuses a request with no token and no display credentials', async () => {
    const icon = await seed();
    const res = await GET(new NextRequest(`http://localhost/api/custom-icons/serve?h=${icon.hash}`));
    expect(res.status).toBe(401);
  });

  it('refuses a token minted for some other resource', async () => {
    const icon = await seed();
    const token = signMediaToken('secret', 'some-video.mp4');
    const res = await GET(new NextRequest(`http://localhost/api/custom-icons/serve?h=${icon.hash}&mt=${encodeURIComponent(token)}`));
    expect(res.status).toBe(401);
  });

  it('refuses a malformed hash before touching the disk', async () => {
    authState.displayOk = true;
    const res = await GET(new NextRequest('http://localhost/api/custom-icons/serve?h=../../config.json'));
    expect(res.status).toBe(400);
  });

  it('answers 404 for a picture that is gone', async () => {
    authState.displayOk = true;
    const res = await GET(new NextRequest(`http://localhost/api/custom-icons/serve?h=${'a'.repeat(32)}`));
    expect(res.status).toBe(404);
  });
});
