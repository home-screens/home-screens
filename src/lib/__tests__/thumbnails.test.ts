import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import {
  THUMBNAIL_DIR,
  removeThumbnails,
  thumbnailPath,
  thumbnailWidth,
  wallCopyPath,
} from '@/lib/thumbnails';

let tmpDir: string;
let origCwd: () => string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'thumbs-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writePng(name: string, width: number, height: number, channels: 3 | 4 = 3): Promise<string> {
  const abs = path.join(tmpDir, name);
  await fs.writeFile(abs, await sharp({
    create: { width, height, channels, background: { r: 200, g: 40, b: 40, alpha: channels === 4 ? 0.5 : 1 } },
  }).png().toBuffer());
  return abs;
}

async function cacheEntries(): Promise<string[]> {
  return fs.readdir(path.join(tmpDir, THUMBNAIL_DIR)).catch(() => []);
}

describe('thumbnailWidth', () => {
  it('accepts only the listed widths', () => {
    expect(thumbnailWidth('480')).toBe(480);
    expect(thumbnailWidth('320')).toBe(320);
    expect(thumbnailWidth('481')).toBeNull();
    expect(thumbnailWidth('4000')).toBeNull();
    expect(thumbnailWidth('abc')).toBeNull();
    expect(thumbnailWidth(null)).toBeNull();
  });
});

describe('thumbnailPath', () => {
  it('writes a WebP no wider than asked and reuses it on the next call', async () => {
    const abs = await writePng('big.png', 1600, 800);

    const first = await thumbnailPath(abs, 'big.png', 480);
    const meta = await sharp(first).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(480);
    expect(meta.height).toBe(240);
    expect(first.startsWith(path.join(tmpDir, THUMBNAIL_DIR))).toBe(true);

    const before = await fs.stat(first);
    const second = await thumbnailPath(abs, 'big.png', 480);
    expect(second).toBe(first);
    expect((await fs.stat(second)).mtimeMs).toBe(before.mtimeMs);
    expect(await cacheEntries()).toHaveLength(1);
  });

  it('never enlarges a picture smaller than the requested width', async () => {
    const abs = await writePng('small.png', 200, 100);
    const meta = await sharp(await thumbnailPath(abs, 'small.png', 480)).metadata();
    expect(meta.width).toBe(200);
  });

  it('replaces the copy when the original changes and prunes the stale one', async () => {
    const abs = await writePng('pic.png', 800, 800);
    const first = await thumbnailPath(abs, 'pic.png', 320);

    // A different file under the same name: new size, new mtime.
    await fs.writeFile(abs, await sharp({
      create: { width: 900, height: 300, channels: 3, background: '#3355ff' },
    }).png().toBuffer());
    const later = new Date(Date.now() + 5000);
    await fs.utimes(abs, later, later);

    const second = await thumbnailPath(abs, 'pic.png', 320);
    expect(second).not.toBe(first);
    expect((await sharp(second).metadata()).height).toBe(107);
    expect(await cacheEntries()).toEqual([path.basename(second)]);
  });

  it('keeps separate widths side by side and removes them all on delete', async () => {
    const abs = await writePng('multi.png', 1000, 1000);
    await thumbnailPath(abs, 'multi.png', 320);
    await thumbnailPath(abs, 'multi.png', 640);
    expect(await cacheEntries()).toHaveLength(2);

    await removeThumbnails('multi.png');
    expect(await cacheEntries()).toHaveLength(0);
    // Deleting a file that never had copies is a no-op, not an error.
    await expect(removeThumbnails('never.png')).resolves.toBeUndefined();
  });

  it('throws for a file sharp cannot decode, leaving nothing behind', async () => {
    const abs = path.join(tmpDir, 'bad.jpg');
    await fs.writeFile(abs, 'not an image');
    await expect(thumbnailPath(abs, 'bad.jpg', 480)).rejects.toThrow();
    expect(await cacheEntries()).toHaveLength(0);
  });
});

describe('wallCopyPath', () => {
  it('writes a JPEG that still covers the box on both sides and reuses it', async () => {
    // Landscape picture, portrait box: the height decides (1920 / 3000).
    const abs = await writePng('wide.png', 4000, 3000);

    const first = await wallCopyPath(abs, 'wide.png', { w: 1080, h: 1920 });
    expect(first).not.toBeNull();
    const meta = await sharp(first!).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(2560);
    expect(meta.height).toBe(1920);

    const before = await fs.stat(first!);
    expect(await wallCopyPath(abs, 'wide.png', { w: 1080, h: 1920 })).toBe(first);
    expect((await fs.stat(first!)).mtimeMs).toBe(before.mtimeMs);
    expect(await cacheEntries()).toHaveLength(1);
  });

  it('keeps transparency as WebP', async () => {
    const abs = await writePng('logo.png', 3000, 3000, 4);
    const copy = await wallCopyPath(abs, 'logo.png', { w: 720, h: 720 });
    const meta = await sharp(copy!).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.hasAlpha).toBe(true);
    expect(meta.width).toBe(720);
  });

  it('turns a sideways camera JPEG upright before sizing it', async () => {
    // Stored 4000x3000 with EXIF orientation 6: it shows as 3000x4000.
    const abs = path.join(tmpDir, 'phone.jpg');
    await fs.writeFile(abs, await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: '#224488' },
    }).jpeg().withMetadata({ orientation: 6 }).toBuffer());

    const meta = await sharp((await wallCopyPath(abs, 'phone.jpg', { w: 1080, h: 1920 }))!).metadata();
    expect(meta.width).toBe(1440);
    expect(meta.height).toBe(1920);
  });

  it('serves an original about the size of the box as it is, and remembers that', async () => {
    const abs = await writePng('fits.png', 1200, 2000);
    expect(await wallCopyPath(abs, 'fits.png', { w: 1080, h: 1920 })).toBeNull();
    // The answer is kept on disk as an empty marker, so the next ask needs no decode.
    const entries = await cacheEntries();
    expect(entries).toHaveLength(1);
    expect((await fs.stat(path.join(tmpDir, THUMBNAIL_DIR, entries[0]))).size).toBe(0);
    expect(await wallCopyPath(abs, 'fits.png', { w: 1080, h: 1920 })).toBeNull();
  });

  it('replaces the copy when the original changes, and a delete removes every kind of copy', async () => {
    const abs = await writePng('pic.png', 4000, 4000);
    const first = await wallCopyPath(abs, 'pic.png', { w: 720, h: 720 });
    await thumbnailPath(abs, 'pic.png', 320);

    await fs.writeFile(abs, await sharp({
      create: { width: 3000, height: 3000, channels: 3, background: '#3355ff' },
    }).png().toBuffer());
    const later = new Date(Date.now() + 5000);
    await fs.utimes(abs, later, later);

    const second = await wallCopyPath(abs, 'pic.png', { w: 720, h: 720 });
    expect(second).not.toBe(first);
    // The stale wall copy is gone; the grid thumbnail is a different kind and stays.
    expect(await cacheEntries()).toHaveLength(2);
    expect(await cacheEntries()).toContain(path.basename(second!));

    await removeThumbnails('pic.png');
    expect(await cacheEntries()).toHaveLength(0);
  });

  it('throws for a file sharp cannot decode, leaving nothing behind', async () => {
    const abs = path.join(tmpDir, 'bad.jpg');
    await fs.writeFile(abs, 'not an image');
    await expect(wallCopyPath(abs, 'bad.jpg', { w: 720, h: 720 })).rejects.toThrow();
    expect(await cacheEntries()).toHaveLength(0);
  });
});
