import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';

const authState = vi.hoisted(() => ({ mediaSecret: null as string | null, sessionOk: true }));

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {
    if (!authState.sessionOk) throw new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 });
  }),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
  getMediaTokenSecret: vi.fn(async () => authState.mediaSecret),
}));

import { GET, POST } from '../route';
import { CUSTOM_ICON_DIR, updateCustomIcon } from '@/lib/custom-icon-data';

beforeEach(async () => {
  authState.mediaSecret = null;
  authState.sessionOk = true;
  await fs.rm(path.join(process.cwd(), CUSTOM_ICON_DIR), { recursive: true, force: true });
});

async function png(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 64, channels: 4, background: '#22c55e' } }).png().toBuffer();
}

function upload(content: Buffer, fileName: string, type: string, name?: string): NextRequest {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(content)], fileName, { type }));
  if (name) form.append('name', name);
  return new NextRequest('http://localhost/api/custom-icons', { method: 'POST', body: form });
}

describe('/api/custom-icons', () => {
  it('adds a picture named after its file and lists it with a serve URL', async () => {
    const res = await POST(upload(await png(), 'taco-tuesday.png', 'image/png'));
    expect(res.status).toBe(201);
    const { icon, existing } = await res.json();
    expect(existing).toBe(false);
    expect(icon.name).toBe('taco tuesday');
    expect(icon.url).toBe(`/api/custom-icons/serve?h=${icon.hash}`);
    // Pending until "Use this icon" keeps it.
    expect((await (await GET(new NextRequest('http://localhost/api/custom-icons'))).json()).icons).toEqual([]);
    await updateCustomIcon(icon.id, { keep: true });

    const list = await (await GET(new NextRequest('http://localhost/api/custom-icons'))).json();
    expect(list.icons.map((i: { id: string }) => i.id)).toEqual([icon.id]);
    expect(list.bytes).toBe(icon.bytes);
    expect(list.usage).toBeUndefined();
  });

  it('answers with the icon it already has for the same picture', async () => {
    const { icon } = await (await POST(upload(await png(), 'taco.png', 'image/png', 'Taco'))).json();
    await updateCustomIcon(icon.id, { keep: true });
    const again = await POST(upload(await png(), 'taco-again.png', 'image/png'));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ existing: true, icon: { id: icon.id, name: 'Taco' } });
  });

  it('uses a name sent with the picture', async () => {
    const res = await POST(upload(await png(), 'IMG_0042.png', 'image/png', "Dad's chili"));
    expect((await res.json()).icon.name).toBe("Dad's chili");
  });

  it('binds every URL to one library-wide token when auth is on', async () => {
    authState.mediaSecret = 'secret';
    for (const body of [await png(), await sharp({ create: { width: 30, height: 30, channels: 3, background: '#000' } }).png().toBuffer()]) {
      const { icon } = await (await POST(upload(body, 'a.png', 'image/png'))).json();
      await updateCustomIcon(icon.id, { keep: true });
    }
    const { icons } = await (await GET(new NextRequest('http://localhost/api/custom-icons'))).json();
    const tokens = icons.map((i: { url: string }) => new URL(i.url, 'http://x').searchParams.get('mt'));
    expect(tokens[0]).toBeTruthy();
    // One token for the whole library, and the same one on the next fetch,
    // so a wall's <img> never reloads just because the list was re-read.
    expect(tokens[1]).toBe(tokens[0]);
    const again = await (await GET(new NextRequest('http://localhost/api/custom-icons'))).json();
    expect(new URL(again.icons[0].url, 'http://x').searchParams.get('mt')).toBe(tokens[0]);
  });

  it('answers with a code the pickers can word for a file that is not a picture', async () => {
    const res = await POST(upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.svg', 'image/svg+xml'));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'not-a-picture' });
  });

  it('refuses a body larger than the limit from its header', async () => {
    const big = new NextRequest('http://localhost/api/custom-icons', {
      method: 'POST',
      body: 'x',
      headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(20 * 1024 * 1024) },
    });
    const res = await POST(big);
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: 'too-big' });
  });

  it('needs a session to add', async () => {
    authState.sessionOk = false;
    const res = await POST(upload(await png(), 'a.png', 'image/png'));
    expect(res.status).toBe(401);
  });

  it('reports where each icon is used when asked', async () => {
    const { icon } = await (await POST(upload(await png(), 'a.png', 'image/png', 'Chili'))).json();
    const meals = { savedMeals: [{ id: 'm1', name: 'Chili night', emoji: `custom:${icon.id}` }], plan: [] };
    await fs.writeFile(path.join(process.cwd(), 'data', 'meals.json'), JSON.stringify(meals));
    const body = await (await GET(new NextRequest('http://localhost/api/custom-icons?usage=1'))).json();
    expect(body.usage[icon.id].meals).toEqual(['Chili night']);
  });
});
