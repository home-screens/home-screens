import { describe, expect, it } from 'vitest';
import { createWriteStream, promises as fs } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { ZipArchive } from 'archiver';
import {
  composeBackupArchive,
  inspectRestoreArchive,
  openArchiveEntry,
  readArchiveEntryText,
  stageRestoreArchive,
  stagedArchivePath,
  sweepStagedArchives,
  ArchiveTooLargeError,
} from '../backup-archive';
import { libraryRoot } from '../library-files';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

/** A zip of the given entries, written under the sandbox cwd. */
async function writeZip(name: string, entries: Record<string, Buffer | string>): Promise<string> {
  const file = path.join(process.cwd(), name);
  const archive = new ZipArchive({ store: true });
  const done = pipeline(archive, createWriteStream(file));
  for (const [entry, data] of Object.entries(entries)) archive.append(data, { name: entry });
  archive.finalize();
  await done;
  return file;
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of Readable.fromWeb(stream as import('stream/web').ReadableStream)) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

describe('composeBackupArchive', () => {
  it('puts the bundle first and every picture under pictures/, leaving out a file that is gone', async () => {
    await fs.mkdir(path.join(libraryRoot(), 'trips'), { recursive: true });
    await fs.writeFile(path.join(libraryRoot(), 'kitchen.png'), PNG);
    await fs.writeFile(path.join(libraryRoot(), 'trips', 'a.png'), PNG);
    const out = path.join(process.cwd(), 'export.zip');
    await pipeline(
      composeBackupArchive({ _type: 'home-screens-backup', config: {} }, [{ path: 'kitchen.png' }, { path: 'trips/a.png' }, { path: 'vanished.png' }]),
      createWriteStream(out),
    );
    const inspected = await inspectRestoreArchive(out, 1024 * 1024);
    expect(inspected).not.toBeNull();
    expect(JSON.parse(inspected!.bundleText)._type).toBe('home-screens-backup');
    expect(inspected!.pictures.map((p) => p.libraryPath)).toEqual(['kitchen.png', 'trips/a.png']);
    expect(inspected!.pictures[0].bytes).toBe(PNG.length);
  });
});

describe('inspectRestoreArchive', () => {
  it('lists the pictures it will restore and counts the entries that are not ours', async () => {
    const file = await writeZip('mixed.zip', {
      'backup.json': JSON.stringify({ _type: 'home-screens-backup' }),
      'pictures/a.png': PNG,
      'pictures/trips/b.jpg': PNG,
      'pictures/run.exe': 'nope',
      'README.txt': 'hello',
    });
    const inspected = await inspectRestoreArchive(file, 1024);
    expect(inspected!.pictures.map((p) => p.libraryPath)).toEqual(['a.png', 'trips/b.jpg']);
    expect(inspected!.skipped).toBe(2);
  });
  it('refuses an archive whole when an entry name could leave the library', async () => {
    // yauzl checks every name as it decodes it; a zip with a `..` segment is
    // not one we wrote, and nothing in it is trusted.
    const file = await writeZip('traversal.zip', {
      'backup.json': JSON.stringify({ _type: 'home-screens-backup' }),
      'pictures/../data/config.json': 'nope',
    });
    expect(await inspectRestoreArchive(file, 1024)).toBeNull();
  });
  it('is null without a backup.json, for a bundle over the cap, and for a file that is not a zip', async () => {
    expect(await inspectRestoreArchive(await writeZip('nobundle.zip', { 'pictures/a.png': PNG }), 1024)).toBeNull();
    expect(await inspectRestoreArchive(await writeZip('big.zip', { 'backup.json': 'x'.repeat(2000) }), 1024)).toBeNull();
    const notZip = path.join(process.cwd(), 'not.zip');
    await fs.writeFile(notZip, 'just text');
    expect(await inspectRestoreArchive(notZip, 1024)).toBeNull();
  });
});

describe('openArchiveEntry and readArchiveEntryText', () => {
  it('stream one entry\'s bytes and read a small one as text', async () => {
    const file = await writeZip('entries.zip', { 'backup.json': '{}', 'pictures/a.png': PNG, 'pictures/s.svg': '<svg viewBox="0 0 1 1"/>' });
    expect(await readAll(await openArchiveEntry(file, 'pictures/a.png'))).toEqual(PNG);
    expect(await readArchiveEntryText(file, 'pictures/s.svg')).toBe('<svg viewBox="0 0 1 1"/>');
    await expect(openArchiveEntry(file, 'pictures/missing.png')).rejects.toThrow(/not in the archive/);
  });
});

describe('stageRestoreArchive', () => {
  it('lands the body under an id and refuses one over the cap, leaving no part behind', async () => {
    const body = new Blob([PNG]).stream();
    const id = await stageRestoreArchive(body, PNG.length);
    const file = stagedArchivePath(id)!;
    expect(await fs.readFile(file)).toEqual(PNG);

    await expect(stageRestoreArchive(new Blob([PNG]).stream(), PNG.length - 1)).rejects.toBeInstanceOf(ArchiveTooLargeError);
    const left = await fs.readdir(path.dirname(file));
    expect(left.filter((name) => name.endsWith('.part'))).toEqual([]);
  });
  it('only names ids of its own shape', () => {
    expect(stagedArchivePath('../config.json')).toBeNull();
    expect(stagedArchivePath(42)).toBeNull();
  });
  it('sweeps archives nobody restored after a quarter of an hour', async () => {
    const id = await stageRestoreArchive(new Blob([PNG]).stream(), PNG.length);
    const file = stagedArchivePath(id)!;
    const old = new Date(Date.now() - 16 * 60 * 1000);
    await fs.utimes(file, old, old);
    const fresh = await stageRestoreArchive(new Blob([PNG]).stream(), PNG.length);
    await sweepStagedArchives();
    await expect(fs.access(file)).rejects.toThrow();
    await expect(fs.access(stagedArchivePath(fresh)!)).resolves.toBeUndefined();
  });
});
