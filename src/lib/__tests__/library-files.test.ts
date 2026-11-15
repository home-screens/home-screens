import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { identifyDownload, safeLibraryPath, writeLibraryFile, libraryRoot, libraryMediaKind, listLibraryFolder } from '@/lib/library-files';

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

describe('identifyDownload', () => {
  const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00];
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48];
  const HEIC = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0];

  /** A download that arrives a few bytes at a time, answered with the type given (or none). */
  function download(bytes: number[], contentType: string | null, pieceSize = bytes.length): Response {
    let at = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (at >= bytes.length) return controller.close();
        controller.enqueue(new Uint8Array(bytes.slice(at, at + pieceSize)));
        at += pieceSize;
      },
    });
    return new Response(body, { headers: contentType ? { 'Content-Type': contentType } : undefined });
  }

  async function bytesOf(body: ReadableStream<Uint8Array> | null): Promise<number[]> {
    return [...new Uint8Array(await new Response(body).arrayBuffer())];
  }

  it('takes the server at its word when it names a format the display can show', async () => {
    const res = download(PNG, 'image/jpeg; charset=binary');
    const { ext, body } = await identifyDownload(res, 'image');
    expect(ext).toBe('.jpg');
    // Nothing was read to find out.
    expect(body).toBe(res.body);

    expect((await identifyDownload(download([1, 2, 3], 'video/mp4'))).ext).toBe('.mp4');
  });

  it('knows a picture by its bytes when the server answers a plain download, and keeps every byte', async () => {
    const jpeg = await identifyDownload(download(JPEG, 'application/octet-stream', 5), 'image');
    expect(jpeg.ext).toBe('.jpg');
    expect(await bytesOf(jpeg.body)).toEqual(JPEG);

    const png = await identifyDownload(download(PNG, 'application/octet-stream', 1));
    expect(png.ext).toBe('.png');
    expect(await bytesOf(png.body)).toEqual(PNG);
  });

  it('knows a picture that came with no type, or with one nobody uses', async () => {
    expect((await identifyDownload(download(JPEG, null), 'image')).ext).toBe('.jpg');
    expect((await identifyDownload(download(JPEG, 'image/jpg'), 'image')).ext).toBe('.jpg');
  });

  it('has no answer for bytes the display cannot show, whatever they are called, and still hands the body on', async () => {
    const heic = await identifyDownload(download(HEIC, 'application/octet-stream'), 'image');
    expect(heic.ext).toBeNull();
    expect(await bytesOf(heic.body)).toEqual(HEIC);

    expect((await identifyDownload(download(HEIC, 'image/heic'), 'image')).ext).toBeNull();
    expect((await identifyDownload(download([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e], 'text/html'), 'image')).ext).toBeNull();
  });

  it('never takes a video for a picture, or a picture for a video', async () => {
    expect((await identifyDownload(download(JPEG, 'video/mp4'), 'image')).ext).toBe('.jpg');
    expect((await identifyDownload(download([1, 2, 3], 'video/mp4'), 'image')).ext).toBeNull();
    // A video is only known by its declared type; its body is not read.
    const res = download(JPEG, 'application/octet-stream');
    const asVideo = await identifyDownload(res, 'video');
    expect(asVideo.ext).toBeNull();
    expect(asVideo.body).toBe(res.body);
  });

  it('copes with a download shorter than the bytes it looks at, and with one that has no body', async () => {
    const short = await identifyDownload(download([0xff, 0xd8, 0xff], 'application/octet-stream'), 'image');
    expect(short.ext).toBe('.jpg');
    expect(await bytesOf(short.body)).toEqual([0xff, 0xd8, 0xff]);

    expect(await identifyDownload(new Response(null, { status: 204 }), 'image')).toEqual({ ext: null, body: null });
  });

  it('lets the caller stop a download it will not keep', async () => {
    let cancelled = false;
    const res = new Response(new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(HEIC)); },
      cancel() { cancelled = true; },
    }), { headers: { 'Content-Type': 'application/octet-stream' } });

    const { ext, body } = await identifyDownload(res, 'image');
    expect(ext).toBeNull();
    await body!.cancel();
    expect(cancelled).toBe(true);
  });

  it('writes to disk through writeLibraryFile', async () => {
    const { ext, body } = await identifyDownload(download(JPEG, 'application/octet-stream', 4), 'image');
    const file = path.join(DIR, `named${ext}`);
    await writeLibraryFile(file, body, 1024);
    expect([...await fs.readFile(file)]).toEqual(JPEG);
  });
});
