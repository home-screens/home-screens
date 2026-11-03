import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { safeLibraryPath, writeLibraryFile, libraryRoot, libraryMediaKind, listLibraryFolder } from '@/lib/library-files';

// The vitest sandbox chdirs each test file into an isolated cwd, so these
// real fs writes never touch the repo's library. Scoped to one named folder;
// never rm the library root itself (see the 2026-07-09 wipe note in
// icloud-import.test.ts).
const DIR = path.join(libraryRoot(), 'library-files-test');

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  return new Response(chunks.join('')).body!;
}

beforeEach(async () => {
  await fs.rm(DIR, { recursive: true, force: true });
  await fs.mkdir(DIR, { recursive: true });
});

describe('safeLibraryPath', () => {
  it('resolves paths inside the library', () => {
    expect(safeLibraryPath('family/pic.jpg')).toBe(path.join(libraryRoot(), 'family', 'pic.jpg'));
    expect(safeLibraryPath('')).toBe(libraryRoot());
  });

  it('rejects traversal out of the library', () => {
    expect(safeLibraryPath('../../etc/passwd')).toBeNull();
    expect(safeLibraryPath('family/../../secrets.json')).toBeNull();
  });
});

describe('libraryMediaKind', () => {
  it('lists pictures and videos by their name', () => {
    expect(libraryMediaKind('beach.jpg')).toBe('image');
    expect(libraryMediaKind('family/clip.mp4')).toBe('video');
    expect(libraryMediaKind('notes.txt')).toBeNull();
  });

  it('leaves out the background rotation\'s top-level downloads, but not a family picture so named', () => {
    expect(libraryMediaKind('rotation-unsplash-abc123.jpg')).toBeNull();
    expect(libraryMediaKind('family/rotation-day.jpg')).toBe('image');
  });
});

describe('listLibraryFolder', () => {
  it('lists the folder the same way the counts do', async () => {
    await fs.writeFile(path.join(DIR, 'kids.jpg'), 'x');
    await fs.writeFile(path.join(DIR, 'rotation-day.jpg'), 'x');
    await fs.writeFile(path.join(DIR, 'notes.txt'), 'x');
    expect((await listLibraryFolder('library-files-test')).sort())
      .toEqual(['library-files-test/kids.jpg', 'library-files-test/rotation-day.jpg']);
  });
});

describe('writeLibraryFile', () => {
  it('streams the body to disk', async () => {
    const file = path.join(DIR, 'ok.jpg');
    await writeLibraryFile(file, streamOf('jpeg', '-bytes'), 1024);
    expect(await fs.readFile(file, 'utf-8')).toBe('jpeg-bytes');
  });

  it('rejects a body over the byte cap and leaves nothing behind, neither the file nor a temp', async () => {
    const file = path.join(DIR, 'huge.mp4');
    await expect(
      writeLibraryFile(file, streamOf('x'.repeat(64), 'y'.repeat(64)), 100),
    ).rejects.toThrow('byte limit');
    await expect(fs.access(file)).rejects.toThrow();
    expect(await fs.readdir(DIR)).toEqual([]);
  });

  it('never puts a cut-off download under the final name, and keeps the picture it would replace', async () => {
    const file = path.join(DIR, 'wall.jpg');
    await fs.writeFile(file, 'the old picture');
    const dropped = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('half of the new'));
        controller.error(new Error('connection reset'));
      },
    });
    await expect(writeLibraryFile(file, dropped, 1024)).rejects.toThrow('connection reset');
    expect(await fs.readFile(file, 'utf-8')).toBe('the old picture');
    expect(await fs.readdir(DIR)).toEqual(['wall.jpg']);
  });

  it('writes beside the file and takes the final name only once whole', async () => {
    const file = path.join(DIR, 'new.jpg');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slow = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode('first half,'));
        await gate;
        controller.enqueue(new TextEncoder().encode(' second half'));
        controller.close();
      },
    });
    const writing = writeLibraryFile(file, slow, 1024);
    // Wait for the first chunk to land somewhere.
    for (let i = 0; i < 50 && (await fs.readdir(DIR)).length === 0; i++) await new Promise((r) => setTimeout(r, 5));
    const during = await fs.readdir(DIR);
    expect(during).toHaveLength(1);
    expect(during[0]).toMatch(/^new\.jpg\..+\.tmp$/);
    await expect(fs.access(file)).rejects.toThrow();

    release();
    await writing;
    expect(await fs.readdir(DIR)).toEqual(['new.jpg']);
    expect(await fs.readFile(file, 'utf-8')).toBe('first half, second half');
  });

  it('rejects a missing body', async () => {
    await expect(writeLibraryFile(path.join(DIR, 'none.jpg'), null, 100)).rejects.toThrow('empty');
  });
});
