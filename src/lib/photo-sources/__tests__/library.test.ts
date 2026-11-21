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

describe('listLibraryMedia order', () => {
  it('lists a folder by name, numbers in counting order, whatever order the disk keeps', async () => {
    await fs.mkdir(path.join(library, 'order'));
    for (const name of ['img10.jpg', 'Zoo.jpg', 'img2.jpg', 'apple.jpg', 'img1.jpg']) await fs.writeFile(path.join(library, 'order', name), 'x');
    expect((await listLibraryMedia('order', 'photos'))!.map((item) => item.url))
      .toEqual(['apple.jpg', 'img1.jpg', 'img2.jpg', 'img10.jpg', 'Zoo.jpg'].map((name) => serve(`order/${name}`)));
  });
});

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

  it('plays the chosen pictures as they are, in the order chosen, leaving out anything that is not a picture', async () => {
    const source = { kind: 'library' as const, folder: '', pictures: ['trips/b.png', 'trips/clip.mp4', 'top.jpg'] };
    expect(await libraryPhotoSource.list({ source, count: 1, media: 'photos' })).toEqual([
      { url: serve('trips/b.png'), type: 'image' },
      { url: serve('top.jpg'), type: 'image' },
    ]);
    expect(await libraryPhotoSource.list({ source, count: 1, media: 'videos' })).toEqual([]);
  });

  it('picks one of the chosen pictures, avoiding the one showing', async () => {
    const source = { kind: 'library' as const, folder: '', pictures: ['trips/a.jpg', 'top.jpg'] };
    const picked = await libraryPhotoSource.pickOne({ source, canvas: { w: 1, h: 1 }, previous: 'trips/a.jpg' });
    expect(picked).toEqual({ kind: 'library', path: 'top.jpg' });
    expect(await libraryPhotoSource.pickOne({ source: { kind: 'library', folder: '', pictures: [] }, canvas: { w: 1, h: 1 } })).toBeNull();
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

describe('Live Photos in a library folder', () => {
  it('hangs the clip on its still', async () => {
    await fs.writeFile(path.join(library, 'trips', 'live1.jpg'), 'x');
    await fs.writeFile(path.join(library, 'trips', 'live1.live.mov'), 'x');

    const items = await listLibraryMedia('trips', 'photos');
    const still = items!.find((i) => i.url.includes('live1.jpg'));
    expect(still?.liveUrl).toContain('live1.live.mov');
  });

  it('plays a paired clip over its picture rather than as a slide of its own', async () => {
    // The clip is a library video like any other, so a slideshow showing
    // videos would otherwise reach it twice: once as the picture's movement
    // and once as a three-second film between the photos.
    await fs.writeFile(path.join(library, 'trips', 'both1.jpg'), 'x');
    await fs.writeFile(path.join(library, 'trips', 'both1.live.mov'), 'x');

    const items = await listLibraryMedia('trips', 'both');

    expect(items!.find((i) => i.url.includes('both1.jpg'))?.liveUrl).toContain('both1.live.mov');
    expect(items!.some((i) => i.url.includes('both1.live.mov'))).toBe(false);
  });

  it('plays a clip whose picture is gone as the ordinary video it is', async () => {
    // Delete the still and the clip is left behind. It is a video file and
    // nothing claims it, so it is a slide like any other video rather than
    // something invisible the household cannot find or remove.
    await fs.writeFile(path.join(library, 'trips', 'orphan.live.mov'), 'x');

    const items = await listLibraryMedia('trips', 'both');

    expect(items!.some((i) => i.url.includes('orphan.live.mov'))).toBe(true);
  });

  it('gives a clip two pictures could claim to neither, and plays it on its own', async () => {
    // No way to tell whose moment it was, so neither picture takes it.
    await fs.writeFile(path.join(library, 'trips', 'shared.jpg'), 'x');
    await fs.writeFile(path.join(library, 'trips', 'shared.png'), 'x');
    await fs.writeFile(path.join(library, 'trips', 'shared.live.mov'), 'x');

    const items = await listLibraryMedia('trips', 'both');

    expect(items!.find((i) => i.url.includes('shared.jpg'))?.liveUrl).toBeUndefined();
    expect(items!.find((i) => i.url.includes('shared.png'))?.liveUrl).toBeUndefined();
    expect(items!.some((i) => i.url.includes('shared.live.mov'))).toBe(true);
  });

  it('pairs a clip a Mac wrote in upper case', async () => {
    await fs.writeFile(path.join(library, 'trips', 'IMG_9.JPG'), 'x');
    await fs.writeFile(path.join(library, 'trips', 'IMG_9.live.MOV'), 'x');

    const items = await listLibraryMedia('trips', 'photos');
    const still = items!.find((i) => i.url.includes('IMG_9.JPG'));
    expect(still?.liveUrl).toContain('IMG_9.live.MOV');
  });

  it('leaves a still alone when there is no clip beside it', async () => {
    const items = await listLibraryMedia('trips', 'photos');
    expect(items!.find((i) => i.url.includes('a.jpg'))?.liveUrl).toBeUndefined();
  });

  it('does not mistake an ordinary movie for a clip', async () => {
    // clip.mp4 sits beside nothing of the same name, and a camera dump's
    // IMG.JPG + IMG.MOV pair must stay two separate things.
    await fs.writeFile(path.join(library, 'trips', 'pair.jpg'), 'x');
    await fs.writeFile(path.join(library, 'trips', 'pair.mov'), 'x');

    const items = await listLibraryMedia('trips', 'both');
    expect(items!.find((i) => i.url.includes('pair.jpg'))?.liveUrl).toBeUndefined();
    expect(items!.some((i) => i.url.includes('pair.mov'))).toBe(true);
  });

  it('mints the clip a token bound to the clip, not the still', async () => {
    await fs.writeFile(path.join(library, 'trips', 'tok.jpg'), 'x');
    await fs.writeFile(path.join(library, 'trips', 'tok.live.mov'), 'x');

    const items = await listLibraryMedia('trips', 'photos');
    const still = items!.find((i) => i.url.includes('tok.jpg'));
    // The serve route checks the token against the file it is asked for.
    expect(still!.liveUrl).toContain(encodeURIComponent('tok-trips/tok.live.mov'));
  });
});
