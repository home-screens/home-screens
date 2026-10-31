import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/mealie', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/mealie')>();
  return { ...real, fetchMealieImage: vi.fn() };
});

import { GET } from '../route';
import { fetchMealieImage, MealieError } from '@/lib/mealie';
import { getDataRoot } from '@/lib/data-root';
import { THUMBNAIL_DIR } from '@/lib/thumbnails';

const ID = '0f1e2d3c-4b5a-4968-8776-655443322110';
const dir = () => path.join(getDataRoot(), THUMBNAIL_DIR, 'mealie');
const get = (id: string, q = '') => GET(new NextRequest(`http://localhost/api/mealie/image/${id}${q}`), { params: Promise.resolve({ recipeId: id }) });
const webp = (bytes: number[]) => new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': 'image/webp' } });

describe('GET /api/mealie/image/[recipeId]', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.rm(dir(), { recursive: true, force: true });
  });

  it('fetches once from Mealie and serves the kept copy after', async () => {
    vi.mocked(fetchMealieImage).mockResolvedValue(webp([1, 2, 3]));
    const first = await get(ID, '?size=tiny&v=abc');
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toContain('immutable');
    expect(fetchMealieImage).toHaveBeenCalledWith(ID, 'tiny-original');
    const second = await get(ID, '?size=tiny&v=abc');
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchMealieImage).toHaveBeenCalledTimes(1);
  });

  it('drops the older copy when the photo changes', async () => {
    vi.mocked(fetchMealieImage).mockResolvedValueOnce(webp([1])).mockResolvedValueOnce(webp([2]));
    await get(ID, '?v=one');
    await get(ID, '?v=two');
    expect(await fs.readdir(dir())).toHaveLength(1);
  });

  it('refuses a made-up id and size', async () => {
    expect((await get('../../secrets')).status).toBe(400);
    expect((await get(ID, '?size=huge')).status).toBe(400);
    expect(fetchMealieImage).not.toHaveBeenCalled();
  });

  it('answers 404 when Mealie has no photo, 502 when it is down', async () => {
    vi.mocked(fetchMealieImage).mockResolvedValueOnce(new Response('', { status: 404 }));
    expect((await get(ID)).status).toBe(404);
    vi.mocked(fetchMealieImage).mockRejectedValueOnce(new MealieError('unreachable', 'down'));
    expect((await get(ID)).status).toBe(502);
  });
});
