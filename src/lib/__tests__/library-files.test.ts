import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { safeLibraryPath, writeLibraryFile, libraryRoot } from '@/lib/library-files';

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

describe('writeLibraryFile', () => {
  it('streams the body to disk', async () => {
    const file = path.join(DIR, 'ok.jpg');
    await writeLibraryFile(file, streamOf('jpeg', '-bytes'), 1024);
    expect(await fs.readFile(file, 'utf-8')).toBe('jpeg-bytes');
  });

  it('rejects a body over the byte cap and removes the partial file', async () => {
    const file = path.join(DIR, 'huge.mp4');
    await expect(
      writeLibraryFile(file, streamOf('x'.repeat(64), 'y'.repeat(64)), 100),
    ).rejects.toThrow('byte limit');
    await expect(fs.access(file)).rejects.toThrow();
  });

  it('rejects a missing body', async () => {
    await expect(writeLibraryFile(path.join(DIR, 'none.jpg'), null, 100)).rejects.toThrow('empty');
  });
});
