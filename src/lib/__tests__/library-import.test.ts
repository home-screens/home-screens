import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// A small cap so "too big" can be tested without a 50 MB body.
vi.mock('@/lib/media-formats', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/media-formats')>();
  return { ...actual, MAX_IMPORT_IMAGE_BYTES: 16 };
});

import { importPictureToLibrary, titleSlug, UnsupportedImageFormatError } from '@/lib/library-import';
import { libraryRevision } from '@/lib/library-revision';

let tmpDir: string;
let origCwd: () => string;
let library: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'library-import-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  library = path.join(tmpDir, 'public', 'backgrounds');
  await fs.mkdir(library, { recursive: true });
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function picture(type: string | null, bytes = [1, 2, 3]): Response {
  return new Response(new Uint8Array(bytes), { status: 200, headers: type ? { 'content-type': type } : {} });
}

async function filesIn(folder: string): Promise<string[]> {
  try {
    return (await fs.readdir(path.join(library, folder))).sort();
  } catch {
    return [];
  }
}

describe('importPictureToLibrary', () => {
  it("leads the file name with the picture's title, so the library reads like the pictures", async () => {
    const open = vi.fn(async () => ({ response: picture('image/jpeg'), title: 'Colors of the Moon' }));
    const result = await importPictureToLibrary({ kind: 'nasa', id: '2026-11-01', folder: 'nasa', open });
    expect(result).toEqual({ path: 'nasa/colors-of-the-moon--nasa-2026-11-01.jpg', reused: false });
  });

  it('reuses a titled copy for a repeat pick, and never another picture whose id only ends the same way', async () => {
    await fs.mkdir(path.join(library, 'unsplash'));
    await fs.writeFile(path.join(library, 'unsplash', 'lake-at-dawn--unsplash-xyz.jpg'), 'old');
    await fs.writeFile(path.join(library, 'unsplash', 'other--unsplash-axyz.jpg'), 'other');
    const open = vi.fn(async () => picture('image/jpeg'));
    expect(await importPictureToLibrary({ kind: 'unsplash', id: 'xyz', folder: 'unsplash', open }))
      .toEqual({ path: 'unsplash/lake-at-dawn--unsplash-xyz.jpg', reused: true });
    expect(open).not.toHaveBeenCalled();
  });


  it('saves the picture as <kind>-<id> in the folder, with the extension from its type, and bumps the revision', async () => {
    const before = libraryRevision();
    const open = vi.fn(async () => picture('image/png'));

    const result = await importPictureToLibrary({ kind: 'immich', id: 'abc-123', folder: 'immich', open });

    expect(result).toEqual({ path: 'immich/immich-abc-123.png', reused: false });
    expect(open).toHaveBeenCalledTimes(1);
    expect([...await fs.readFile(path.join(library, 'immich', 'immich-abc-123.png'))]).toEqual([1, 2, 3]);
    expect(libraryRevision()).not.toBe(before);
  });

  it('reuses an earlier copy of the same picture without downloading or bumping the revision', async () => {
    await fs.mkdir(path.join(library, 'unsplash'));
    await fs.writeFile(path.join(library, 'unsplash', 'unsplash-xyz.webp'), 'old');
    const before = libraryRevision();
    const open = vi.fn(async () => picture('image/jpeg'));

    const result = await importPictureToLibrary({ kind: 'unsplash', id: 'xyz', folder: 'unsplash', open });

    expect(result).toEqual({ path: 'unsplash/unsplash-xyz.webp', reused: true });
    expect(open).not.toHaveBeenCalled();
    expect(libraryRevision()).toBe(before);
    expect(await filesIn('unsplash')).toEqual(['unsplash-xyz.webp']);
  });

  it('does not take a non-picture with the same name for a copy', async () => {
    await fs.writeFile(path.join(library, 'nasa-2026-11-01.txt'), 'notes');

    const result = await importPictureToLibrary({ kind: 'nasa', id: '2026-11-01', folder: '', open: async () => picture('image/jpeg') });

    expect(result).toEqual({ path: 'nasa-2026-11-01.jpg', reused: false });
  });

  it('reads the type through parameters and case', async () => {
    const result = await importPictureToLibrary({ kind: 'nasa', id: 'a', folder: '', open: async () => picture('Image/PNG; charset=binary') });
    expect(result.path).toBe('nasa-a.png');
  });

  it('turns characters outside the file-name alphabet into underscores', async () => {
    const result = await importPictureToLibrary({ kind: 'immich', id: 'a/b c', folder: '', open: async () => picture('image/jpeg') });
    expect(result.path).toBe('immich-a_b_c.jpg');
  });

  it('falls back to a web-picture extension on the URL when the type says nothing useful', async () => {
    const jpeg = await importPictureToLibrary({
      kind: 'nasa', id: 'one', folder: '', urlHint: 'https://images-assets.nasa.gov/x~orig.JPEG?v=2', open: async () => picture('application/octet-stream'),
    });
    expect(jpeg.path).toBe('nasa-one.jpg');
    const png = await importPictureToLibrary({
      kind: 'nasa', id: 'two', folder: '', urlHint: 'https://apod.nasa.gov/a.png', open: async () => picture(null),
    });
    expect(png.path).toBe('nasa-two.png');
  });

  it('refuses a TIFF even when the URL claims a web picture, and writes nothing', async () => {
    const before = libraryRevision();
    await expect(importPictureToLibrary({
      kind: 'nasa', id: 'tif', folder: 'nasa', urlHint: 'https://x/a.jpg', open: async () => picture('image/tiff'),
    })).rejects.toBeInstanceOf(UnsupportedImageFormatError);
    expect(await filesIn('nasa')).toEqual([]);
    expect(libraryRevision()).toBe(before);
  });

  it('refuses something that is not a picture at all, with a message a person can read', async () => {
    const error = await importPictureToLibrary({ kind: 'unsplash', id: 'page', folder: '', open: async () => picture('text/html') })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnsupportedImageFormatError);
    expect((error as Error).message).toMatch(/can't show/);
  });

  it('throws on a failed download and leaves the library and its revision alone', async () => {
    const before = libraryRevision();
    await expect(importPictureToLibrary({
      kind: 'immich', id: 'gone', folder: 'immich', open: async () => new Response('', { status: 404 }),
    })).rejects.toThrow(/404/);
    expect(await filesIn('immich')).toEqual([]);
    expect(libraryRevision()).toBe(before);
  });

  it('stops a picture over the size cap mid-stream and removes the partial file', async () => {
    const before = libraryRevision();
    await expect(importPictureToLibrary({
      kind: 'immich', id: 'huge', folder: 'immich', open: async () => picture('image/jpeg', Array.from({ length: 64 }, () => 7)),
    })).rejects.toThrow(/byte limit/);
    expect(await filesIn('immich')).toEqual([]);
    expect(libraryRevision()).toBe(before);
  });

  it('refuses a folder outside the library without downloading', async () => {
    const open = vi.fn(async () => picture('image/jpeg'));
    await expect(importPictureToLibrary({ kind: 'immich', id: 'x', folder: '../../etc', open })).rejects.toThrow(/invalid folder/);
    expect(open).not.toHaveBeenCalled();
  });
});

describe('titleSlug', () => {
  it.each([
    ['Colors of the Moon', 'colors-of-the-moon'],
    ['IMG_2041.HEIC', 'img_2041'],
    ['Crème brûlée -- at the café!', 'creme-brulee-at-the-cafe'],
    ['   ', ''],
    ['a'.repeat(80), 'a'.repeat(60)],
  ])('%s', (title, slug) => {
    expect(titleSlug(title)).toBe(slug);
  });
});

