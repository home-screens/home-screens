import { describe, it, expect, vi } from 'vitest';
import { MAX_CACHED_PICTURE_BYTES, createPictureBytesCache, servePicture } from '../picture-proxy';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 1, 2, 3]);

describe('servePicture', () => {
  it('loads once, then answers from the cache', async () => {
    const cache = createPictureBytesCache();
    const load = vi.fn(async () => ({ data: PNG.buffer.slice(0), declaredType: 'image/png' }));
    const first = await servePicture(cache, 'k', 'image/jpeg', load);
    const second = await servePicture(cache, 'k', 'image/jpeg', load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(first.headers.get('Content-Type')).toBe('image/png');
    expect(first.headers.get('Cache-Control')).toBe('public, max-age=604800, immutable');
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(PNG);
  });

  it('says what the picture is when the source only says "a file"', async () => {
    const res = await servePicture(createPictureBytesCache(), 'k', 'image/jpeg', async () => ({ data: PNG.buffer.slice(0), declaredType: 'application/octet-stream' }));
    expect(res.headers.get('Content-Type')).toBe('image/png');
  });

  it('falls back to the route\'s own type when nothing says', async () => {
    const res = await servePicture(createPictureBytesCache(), 'k', 'image/jpeg', async () => ({ data: new Uint8Array([1, 2, 3]).buffer, declaredType: null }));
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
  });

  it('serves a picture over the cap without keeping it', async () => {
    const cache = createPictureBytesCache();
    const load = vi.fn(async () => ({ data: new ArrayBuffer(MAX_CACHED_PICTURE_BYTES + 1), declaredType: 'image/jpeg' }));
    expect((await servePicture(cache, 'big', 'image/jpeg', load)).status).toBe(200);
    await servePicture(cache, 'big', 'image/jpeg', load);
    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.get('big')).toBeNull();
  });

  it('passes the source\'s refusal straight through and keeps nothing', async () => {
    const cache = createPictureBytesCache();
    const res = await servePicture(cache, 'gone', 'image/jpeg', async () => new Response(null, { status: 404 }));
    expect(res.status).toBe(404);
    expect(cache.get('gone')).toBeNull();
  });
});
