import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

vi.mock('@/lib/media-token', () => ({ mintMediaToken: vi.fn(async (resource: string) => `tok-${resource}`) }));

import { libraryPhotoSource, listLibraryMedia } from '../library';

let tmpDir: string;
let origCwd: () => string;
let library: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'library-source-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  library = path.join(tmpDir, 'public', 'backgrounds');
  await fs.mkdir(path.join(library, 'trips', 'deeper'), { recursive: true });
  for (const name of ['a.jpg', 'b.png', 'clip.mp4', 'notes.txt']) await fs.writeFile(path.join(library, 'trips', name), 'x');
  await fs.writeFile(path.join(library, 'trips', 'deeper', 'c.jpg'), 'x');
  await fs.writeFile(path.join(library, 'top.jpg'), 'x');
  await fs.writeFile(path.join(library, 'rotation-unsplash-abc.jpg'), 'x');
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const serve = (file: string) => `/api/backgrounds/serve?file=${encodeURIComponent(file)}`;
const urls = (items: Array<{ url: string }>) => items.map((item) => item.url).sort();

describe('listLibraryMedia', () => {
  it('lists the pictures directly inside a folder, not deeper and not other files', async () => {
    expect(urls((await listLibraryMedia('trips', 'photos'))!)).toEqual([serve('trips/a.jpg'), serve('trips/b.png')].sort());
  });

  it('adds videos with a media token bound to their path when asked', async () => {
    const items = (await listLibraryMedia('trips', 'both'))!;
    expect(items.find((item) => item.type === 'video')).toEqual({ type: 'video', url: `${serve('trips/clip.mp4')}&mt=${encodeURIComponent('tok-trips/clip.mp4')}` });
    expect((await listLibraryMedia('trips', 'videos'))!.map((item) => item.type)).toEqual(['video']);
  });

  it("leaves the background rotation's top-level downloads out of the top level", async () => {
    expect(urls((await listLibraryMedia('', 'photos'))!)).toEqual([serve('top.jpg')]);
  });

  it('cleans the slashes off a folder', async () => {
    expect((await listLibraryMedia('/trips/', 'photos'))!).toHaveLength(2);
  });

  it('answers nothing for a missing folder and null for one outside the library', async () => {
    expect(await listLibraryMedia('nope', 'photos')).toEqual([]);
    expect(await listLibraryMedia('../../etc', 'photos')).toBeNull();
  });

  it('creates the library root when it is not there yet', async () => {
    await fs.rm(library, { recursive: true, force: true });
    expect(await listLibraryMedia('', 'photos')).toEqual([]);
    expect((await fs.stat(library)).isDirectory()).toBe(true);
  });
});

describe('libraryPhotoSource', () => {
  it('plays the whole folder whatever the count', async () => {
    const items = await libraryPhotoSource.list({ source: { kind: 'library', folder: 'trips' }, count: 1, media: 'photos' });
    expect(items).toHaveLength(2);
  });

  it('answers nothing for a folder outside the library', async () => {
    expect(await libraryPhotoSource.list({ source: { kind: 'library', folder: '../x' }, count: 50, media: 'photos' })).toEqual([]);
  });

  it('picks a still picture from the folder, served where it is', async () => {
    const picked = await libraryPhotoSource.pickOne({ source: { kind: 'library', folder: 'trips' }, canvas: { w: 1080, h: 1920 } });
    expect(picked?.kind).toBe('library');
    expect(['trips/a.jpg', 'trips/b.png']).toContain((picked as { path: string }).path);
  });

  it('avoids the picture already showing when there is another', async () => {
    for (let i = 0; i < 10; i++) {
      const picked = await libraryPhotoSource.pickOne({ source: { kind: 'library', folder: 'trips' }, canvas: { w: 1, h: 1 }, previous: 'trips/a.jpg' });
      expect(picked).toEqual({ kind: 'library', path: 'trips/b.png' });
    }
  });

  it('keeps the only picture there is, and has nothing for an empty folder', async () => {
    const only = await libraryPhotoSource.pickOne({ source: { kind: 'library', folder: '' }, canvas: { w: 1, h: 1 }, previous: 'top.jpg' });
    expect(only).toEqual({ kind: 'library', path: 'top.jpg' });
    await fs.mkdir(path.join(library, 'empty'));
    expect(await libraryPhotoSource.pickOne({ source: { kind: 'library', folder: 'empty' }, canvas: { w: 1, h: 1 } })).toBeNull();
  });
});
