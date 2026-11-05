import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

const importOne = vi.hoisted(() => vi.fn());
vi.mock('@/lib/photo-sources', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/photo-sources')>();
  return { ...actual, getPickableSource: vi.fn(() => ({ importOne })) };
});

import { getPickableSource, PhotoSourceError } from '@/lib/photo-sources';
import { UnsupportedImageFormatError } from '@/lib/library-import';
import { POST } from '@/app/api/photo-source/import/route';

function req(body: unknown) {
  return new NextRequest('http://localhost/api/photo-source/import', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  importOne.mockResolvedValue({ path: 'immich/immich-abc.jpg', reused: false });
});

describe('POST /api/photo-source/import', () => {
  it('copies the picture into its source folder and answers the serve URL', async () => {
    const res = await POST(req({ kind: 'immich', ref: 'abc' }));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ path: '/api/backgrounds/serve?file=immich%2Fimmich-abc.jpg', file: 'immich/immich-abc.jpg', reused: false });
    expect(getPickableSource).toHaveBeenCalledWith('immich');
    expect(importOne).toHaveBeenCalledWith({ ref: 'abc', folder: 'immich' });
  });

  it.each([
    ['unsplash', 'aB3_x', 'unsplash'],
    ['nasa', 'apod:2026-11-01', 'nasa'],
    ['nasa', 'image:PIA12345', 'nasa'],
  ])('lands a %s pick in its own folder by default', async (kind, ref, folder) => {
    await POST(req({ kind, ref }));
    expect(importOne).toHaveBeenCalledWith({ ref, folder });
  });

  it('uses the folder the picker names, top level included, without its slashes', async () => {
    await POST(req({ kind: 'immich', ref: 'abc', folder: '/calendar-art/' }));
    await POST(req({ kind: 'immich', ref: 'abc', folder: '' }));
    expect(importOne.mock.calls.map(([args]) => args.folder)).toEqual(['calendar-art', '']);
  });

  it('answers 200 when an earlier copy was reused', async () => {
    importOne.mockResolvedValue({ path: 'immich/immich-abc.jpg', reused: true });
    const res = await POST(req({ kind: 'immich', ref: 'abc' }));
    expect(res.status).toBe(200);
    expect((await res.json()).reused).toBe(true);
  });

  it('refuses an unknown source, a bad picture id, and a folder that is not one', async () => {
    const cases: Array<[unknown, string]> = [
      [{ kind: 'library', ref: 'a.jpg' }, 'Unknown photo source'],
      [{ ref: 'abc' }, 'Unknown photo source'],
      [{ kind: 'immich', ref: '../etc' }, 'Invalid picture'],
      [{ kind: 'nasa', ref: 'PIA1' }, 'Invalid picture'],
      [{ kind: 'immich' }, 'Invalid picture'],
      [{ kind: 'immich', ref: 'abc', folder: 7 }, 'Invalid folder'],
      [{ kind: 'immich', ref: 'abc', folder: '../../etc' }, 'Invalid folder'],
    ];
    for (const [body, error] of cases) {
      const res = await POST(req(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(await res.json()).toEqual({ error });
    }
    expect(importOne).not.toHaveBeenCalled();
  });

  it('refuses a body that is not JSON', async () => {
    const res = await POST(req('{nope'));
    expect(res.status).toBe(400);
    expect(importOne).not.toHaveBeenCalled();
  });

  it('answers a picture the display cannot show with 415 and its message', async () => {
    importOne.mockRejectedValue(new UnsupportedImageFormatError());
    const res = await POST(req({ kind: 'nasa', ref: 'image:T1' }));
    expect(res.status).toBe(415);
    expect((await res.json()).error).toMatch(/can't show/);
  });

  it('answers a failure the source explained with its own status and body', async () => {
    importOne.mockRejectedValue(new PhotoSourceError('Immich key is missing asset.view', 403, { error: 'missing-permission', permission: 'asset.view' }));
    const res = await POST(req({ kind: 'immich', ref: 'abc' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'missing-permission', permission: 'asset.view' });
  });

  it('answers anything else with a 500', async () => {
    importOne.mockRejectedValue(new Error('disk full'));
    const res = await POST(req({ kind: 'immich', ref: 'abc' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Failed to save the picture');
  });
});
