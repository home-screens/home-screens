import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type { MediaInventory } from '@/lib/media-inventory';

// Mock auth to be a no-op for all tests (the route.test.ts convention): the
// 401 case flips requireSession to reject with a Response.
vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
  getMediaTokenSecret: vi.fn(),
}));

// Hoisted config holder: each test re-imports the route after
// vi.resetModules(), which re-runs this factory into a fresh registry; the
// implementation reads configState.config at call time, so per-test seeding
// survives that.
const configState = vi.hoisted(() => ({ config: {} as unknown }));

vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(async () => configState.config),
}));

let tmpDir: string;
let origCwd: () => string;
let bgsDir: string;

beforeEach(async () => {
  configState.config = {};
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bg-inventory-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  bgsDir = path.join(tmpDir, 'public', 'backgrounds');
  await fs.mkdir(bgsDir, { recursive: true });
  // Reset modules so BGS is recomputed with the new cwd
  vi.resetModules();
});

afterEach(async () => {
  process.cwd = origCwd;
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** Import fresh each test so BGS picks up the overridden process.cwd() */
async function getHandlers() {
  return import('@/app/api/backgrounds/inventory/route');
}

function makeGetRequest(): NextRequest {
  return new NextRequest(new URL('http://localhost/api/backgrounds/inventory'));
}

/** A real 1x1 transparent PNG: image-size must read width 1, height 1 from it. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const CLIP = Buffer.from('video-bytes');
const GARBAGE = Buffer.from('not a real png');

/**
 * A JPEG whose SOF marker (the only place dimensions live) sits past the
 * route's 64 KiB header probe: two fat APP1 pad segments push it out to
 * byte ~85k. The probe parse throws "exceeded buffer limits", so the item
 * only gets dimensions if the route retries against the whole file.
 */
function bigHeaderJpeg(): Buffer {
  const padSegment = (length: number) =>
    Buffer.concat([
      Buffer.from([0xff, 0xe1]),
      Buffer.from([length >> 8, length & 0xff]),
      Buffer.alloc(length - 2, 0x41),
    ]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    padSegment(65535),
    padSegment(20000),
    // SOF0: precision 8, height 0x01e0 = 480, width 0x0280 = 640
    Buffer.from([
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03,
      0x00, 0x02, 0x00, 0x02, 0x00, 0x02, 0x00, 0x02, 0x00,
    ]),
    Buffer.from([0xff, 0xd9]), // EOI
  ]);
}

describe('GET /api/backgrounds/inventory', () => {
  it('lists every image and video with bytes, image dimensions, and folders', async () => {
    const { GET } = await getHandlers();
    const natureDir = path.join(bgsDir, 'nature');
    await fs.mkdir(natureDir);
    await fs.writeFile(path.join(natureDir, 'a.png'), PNG_1X1);
    await fs.writeFile(path.join(natureDir, 'wide.jpg'), 'jpeg-bytes');
    await fs.writeFile(path.join(natureDir, 'clip.mp4'), CLIP);
    await fs.writeFile(path.join(bgsDir, 'bad.png'), GARBAGE);
    // Non-media files are invisible at either depth.
    await fs.writeFile(path.join(bgsDir, 'notes.txt'), 'text');
    await fs.writeFile(path.join(natureDir, 'notes.txt'), 'text');

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json: MediaInventory = await res.json();

    expect(json.items.map((i) => i.path)).toEqual([
      'bad.png',
      'nature/a.png',
      'nature/clip.mp4',
      'nature/wide.jpg',
    ]);

    const byPath = new Map(json.items.map((i) => [i.path, i]));
    expect(byPath.get('nature/a.png')).toMatchObject({
      kind: 'image',
      bytes: PNG_1X1.length,
      width: 1,
      height: 1,
    });
    expect(byPath.get('nature/wide.jpg')).toMatchObject({ kind: 'image', bytes: 10 });

    const clip = byPath.get('nature/clip.mp4')!;
    expect(clip.kind).toBe('video');
    expect(clip.bytes).toBe(CLIP.length);
    expect(clip.width).toBeUndefined();
    expect(clip.height).toBeUndefined();

    const bad = byPath.get('bad.png')!;
    expect(bad.kind).toBe('image');
    expect(bad.bytes).toBe(GARBAGE.length);
    // A corrupt image stays listed, just without dimensions.
    expect(bad.width).toBeUndefined();
    expect(bad.height).toBeUndefined();

    // Directory output is order-sensitive: sorted by path.
    expect(json.directories).toEqual([{ name: 'nature', path: 'nature' }]);
  });

  it('walks two folder levels deep, lists empty folders, and stops at the third', async () => {
    const { GET } = await getHandlers();
    await fs.mkdir(path.join(bgsDir, 'themes', 'christmas'), { recursive: true });
    await fs.mkdir(path.join(bgsDir, 'a', 'b', 'c'), { recursive: true });
    await fs.writeFile(path.join(bgsDir, 'themes', 'christmas', 'clip.mp4'), CLIP);
    await fs.writeFile(path.join(bgsDir, 'a', 'b', 'c', 'deep.png'), PNG_1X1);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json: MediaInventory = await res.json();

    expect(json.items.map((i) => i.path)).toEqual(['themes/christmas/clip.mp4']);
    // Order-sensitive: subfolders sorted by path, empty ones included.
    expect(json.directories).toEqual([
      { name: 'a', path: 'a' },
      { name: 'b', path: 'a/b' },
      { name: 'themes', path: 'themes' },
      { name: 'christmas', path: 'themes/christmas' },
    ]);
    // The depth-3 folder 'c' and its file are never listed.
    expect(json.directories.some((d) => d.path === 'a/b/c')).toBe(false);
  });

  it('hides top-level rotation files, which the background rotation owns', async () => {
    const { GET } = await getHandlers();
    await fs.writeFile(path.join(bgsDir, 'rotation-unsplash-abc.jpg'), 'jpeg-bytes');
    await fs.writeFile(path.join(bgsDir, 'mine.jpg'), 'jpeg-bytes');
    // Only the top level is the rotation's; a user folder may use the word.
    await fs.mkdir(path.join(bgsDir, 'trips'));
    await fs.writeFile(path.join(bgsDir, 'trips', 'rotation-class.jpg'), 'jpeg-bytes');

    const res = await GET(makeGetRequest());
    const json: MediaInventory = await res.json();
    expect(json.items.map((i) => i.path)).toEqual(['mine.jpg', 'trips/rotation-class.jpg']);
  });

  it('skips symlinks, as the picker listing does', async () => {
    const { GET } = await getHandlers();
    await fs.writeFile(path.join(bgsDir, 'real.png'), PNG_1X1);
    await fs.symlink(path.join(bgsDir, 'real.png'), path.join(bgsDir, 'link.png'));

    const res = await GET(makeGetRequest());
    const json: MediaInventory = await res.json();
    expect(json.items.map((i) => i.path)).toEqual(['real.png']);
  });

  it('recovers dimensions that sit beyond the 64 KiB header probe', async () => {
    const { GET } = await getHandlers();
    await fs.writeFile(path.join(bgsDir, 'fat-exif.jpg'), bigHeaderJpeg());
    await fs.writeFile(path.join(bgsDir, 'small.png'), PNG_1X1);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json: MediaInventory = await res.json();

    const byPath = new Map(json.items.map((i) => [i.path, i]));
    // The probe cannot see the SOF marker out at ~85k; only the full-file
    // retry can recover these dimensions.
    expect(byPath.get('fat-exif.jpg')).toMatchObject({
      kind: 'image',
      bytes: bigHeaderJpeg().length,
      width: 640,
      height: 480,
    });
    // A normal small file parses straight from the header stage.
    expect(byPath.get('small.png')).toMatchObject({ kind: 'image', width: 1, height: 1 });
  });

  it('pairs each item with the config usage scan', async () => {
    configState.config = {
      version: 4,
      screens: [{ id: 's1', name: 'Home', backgroundImage: 'nature/a.png' }],
    };
    const { GET } = await getHandlers();
    const natureDir = path.join(bgsDir, 'nature');
    await fs.mkdir(natureDir);
    await fs.writeFile(path.join(natureDir, 'a.png'), PNG_1X1);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json: MediaInventory = await res.json();

    expect(Array.isArray(json.usage['nature/a.png'])).toBe(true);
    expect(json.usage['nature/a.png'][0].kind).toBe('screen');
    expect(json.usage['nature/a.png']).toEqual([
      expect.objectContaining({ kind: 'screen', name: 'Home', configPath: 'screens[0].backgroundImage' }),
    ]);
  });

  it('reports config references to files and folders that are not in the library', async () => {
    await fs.writeFile(path.join(bgsDir, 'have.jpg'), 'jpeg-bytes');
    await fs.writeFile(path.join(bgsDir, 'rotation-unsplash-live.jpg'), 'jpeg-bytes');
    await fs.mkdir(path.join(bgsDir, 'nature'));
    configState.config = { screens: [
      { id: 's1', name: 'Hall', backgroundImage: 'have.jpg' },
      { id: 's2', name: 'Porch', backgroundImage: '/api/backgrounds/serve?file=gone.jpg' },
      // Hidden from the listing, but on disk: not missing.
      { id: 's3', name: 'Rot', backgroundImage: 'rotation-unsplash-live.jpg' },
      { id: 's4', name: 'Den', modules: [
        { id: 'm1', type: 'photo-slideshow', config: { photoSource: { kind: 'library', folder: 'old-trips' } } },
        { id: 'm2', type: 'photo-slideshow', config: { photoSource: { kind: 'library', folder: 'nature' } } },
      ] },
    ] };
    const { GET } = await getHandlers();
    const json: MediaInventory = await (await GET(makeGetRequest())).json();
    expect(json.missing).toEqual([
      { path: 'gone.jpg', kind: 'file', uses: [expect.objectContaining({ name: 'Porch', screenId: 's2' })] },
      { path: 'old-trips', kind: 'folder', uses: [expect.objectContaining({ name: 'Den', screenId: 's4', moduleId: 'm1' })] },
    ]);
  });

  it('lists the slideshows on the walls, one pointed at an empty folder included', async () => {
    await fs.mkdir(path.join(bgsDir, 'nature'));
    await fs.writeFile(path.join(bgsDir, 'nature', 'a.png'), 'png');
    await fs.mkdir(path.join(bgsDir, 'empty-yet'));
    configState.config = { screens: [
      { id: 's1', name: 'Den', modules: [
        { id: 'm1', type: 'photo-slideshow', config: { photoSource: { kind: 'library', folder: 'nature' }, mediaTypes: 'both' } },
        { id: 'm2', type: 'fullscreen-photo', config: { photoSource: { kind: 'library', folder: 'empty-yet' } } },
      ] },
    ] };
    const { GET } = await getHandlers();
    const json: MediaInventory = await (await GET(makeGetRequest())).json();
    expect(json.slideshows.map((s) => [s.folder, s.shows, s.use.name, s.use.moduleId])).toEqual([
      ['nature', 'both', 'Den', 'm1'],
      ['empty-yet', 'photos', 'Den', 'm2'],
    ]);
  });

  it('sums the listed bytes and reports the volume space', async () => {
    await fs.writeFile(path.join(bgsDir, 'a.jpg'), 'aaaa');
    await fs.writeFile(path.join(bgsDir, 'b.mp4'), 'bbbbbb');
    const { GET } = await getHandlers();
    const json: MediaInventory = await (await GET(makeGetRequest())).json();
    expect(json.storage.bytes).toBe(10);
    expect(json.storage.freeBytes).toBeGreaterThan(0);
    expect(json.storage.totalBytes).toBeGreaterThanOrEqual(json.storage.freeBytes!);
  });

  it('returns an empty usage map when the config references nothing', async () => {
    configState.config = {
      version: 4,
      screens: [{ id: 's1', name: 'Home', backgroundImage: '' }],
    };
    const { GET } = await getHandlers();
    await fs.writeFile(path.join(bgsDir, 'a.png'), PNG_1X1);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json: MediaInventory = await res.json();

    expect(json.items).toHaveLength(1);
    expect(json.usage).toEqual({});
  });

  it('returns the empty inventory when the library folder is missing', async () => {
    const { GET } = await getHandlers();
    await fs.rm(bgsDir, { recursive: true, force: true });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ items: [], directories: [], usage: {}, missing: [], storage: { bytes: 0 }, slideshows: [] });
  });

  it('rejects an unauthenticated request', async () => {
    const { GET } = await getHandlers();
    // Same registry instance the freshly imported route captured.
    const { requireSession } = await import('@/lib/auth');
    vi.mocked(requireSession).mockRejectedValueOnce(
      Response.json({ error: 'Unauthorized' }, { status: 401 }),
    );

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it('answers 500 with the fallback message when the config read fails', async () => {
    const { GET } = await getHandlers();
    const { readConfig } = await import('@/lib/config');
    vi.mocked(readConfig).mockRejectedValueOnce(new Error('corrupt config'));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to build media inventory');
  });
});
