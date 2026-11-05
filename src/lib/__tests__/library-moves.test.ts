import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

/**
 * Moving files and renaming folders on a real temp library, with the config
 * update mocked so the tests can watch what the rewriter was asked to do.
 */
const configState = vi.hoisted(() => ({ config: {} as Record<string, unknown>, failWrite: false }));
vi.mock('@/lib/config', () => ({
  configRevision: (c: unknown) => `rev-${JSON.stringify(c).length}`,
  updateConfigAtomic: vi.fn(async (mutator: (c: unknown) => unknown) => {
    const next = await mutator(configState.config);
    if (configState.failWrite && next !== configState.config) throw new Error('disk full');
    configState.config = next as Record<string, unknown>;
    return next;
  }),
}));

import { moveLibraryFiles, renameLibraryFolder, LibraryMoveError, cleanFolderPath, cleanLibraryPath } from '@/lib/library-moves';

let tmpDir: string;
let origCwd: () => string;
let bgsDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lib-moves-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  bgsDir = path.join(tmpDir, 'public', 'backgrounds');
  await fs.mkdir(bgsDir, { recursive: true });
  configState.config = {};
  configState.failWrite = false;
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function seed(rel: string, content = 'x') {
  const abs = path.join(bgsDir, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content);
}
const exists = (rel: string) => fs.access(path.join(bgsDir, rel)).then(() => true, () => false);

describe('path cleaning', () => {
  it('normalizes spellings and refuses traversal', () => {
    expect(cleanLibraryPath('nature//a.jpg')).toBe('nature/a.jpg');
    expect(cleanLibraryPath('./nature/a.jpg')).toBe('nature/a.jpg');
    expect(cleanLibraryPath('../a.jpg')).toBeNull();
    expect(cleanFolderPath('')).toBe('');
    expect(cleanFolderPath('/')).toBe('');
    expect(cleanFolderPath('trips/')).toBe('trips');
  });
});

describe('moveLibraryFiles', () => {
  it('moves files under their own names and rewrites every reference form', async () => {
    await seed('a.jpg');
    await seed('nature/b.jpg');
    await seed('trips/.keep');
    configState.config = { screens: [
      { id: 's1', name: 'Hall', backgroundImage: 'a.jpg' },
      { id: 's2', name: 'Den', backgroundImage: '/api/backgrounds/serve?file=nature%2Fb.jpg&mt=tok' },
      { id: 's3', name: 'Old', backgroundImage: '/backgrounds/a.jpg' },
      { id: 's4', name: 'Other', backgroundImage: 'c.jpg' },
    ] };

    const before = `rev-${JSON.stringify(configState.config).length}`;

    const result = await moveLibraryFiles(['a.jpg', 'nature/b.jpg'], 'trips');

    expect(result.moved).toEqual([
      { from: 'a.jpg', to: 'trips/a.jpg' },
      { from: 'nature/b.jpg', to: 'trips/b.jpg' },
    ]);
    expect(result.rewritten).toBe(3);
    // Both revisions, so an editor copy of exactly the old one can follow.
    expect(result.previousRevision).toBe(before);
    expect(result.revision).toBe(`rev-${JSON.stringify(configState.config).length}`);
    expect(result.revision).not.toBe(before);
    expect(await exists('trips/a.jpg')).toBe(true);
    expect(await exists('trips/b.jpg')).toBe(true);
    expect(await exists('a.jpg')).toBe(false);
    const screens = configState.config.screens as { backgroundImage: string }[];
    expect(screens.map((s) => s.backgroundImage)).toEqual([
      'trips/a.jpg',
      '/api/backgrounds/serve?file=trips%2Fb.jpg&mt=tok',
      '/backgrounds/trips/a.jpg',
      'c.jpg',
    ]);
  });

  it('moves to the top level and skips a file already there', async () => {
    await seed('nature/a.jpg');
    await seed('b.jpg');
    const result = await moveLibraryFiles(['nature/a.jpg', 'b.jpg'], '');
    expect(result.moved).toEqual([{ from: 'nature/a.jpg', to: 'a.jpg' }]);
    expect(result.rewritten).toBe(0);
  });

  it('refuses two selected files that share a name, and ignores a repeated source', async () => {
    await seed('one/photo.jpg', 'one');
    await seed('two/photo.jpg', 'two');
    await seed('trips/.keep');
    await expect(moveLibraryFiles(['one/photo.jpg', 'two/photo.jpg'], 'trips')).rejects.toMatchObject({ status: 409 });
    expect(await fs.readFile(path.join(bgsDir, 'one/photo.jpg'), 'utf8')).toBe('one');
    expect(await fs.readFile(path.join(bgsDir, 'two/photo.jpg'), 'utf8')).toBe('two');
    expect(await exists('trips/photo.jpg')).toBe(false);

    const result = await moveLibraryFiles(['one/photo.jpg', 'one/photo.jpg'], 'trips');
    expect(result.moved).toEqual([{ from: 'one/photo.jpg', to: 'trips/photo.jpg' }]);
  });

  it('never overwrites a file that appears in the target between the check and the move', async () => {
    await seed('a.jpg', 'mine');
    await seed('trips/a.jpg', 'theirs');
    await expect(moveLibraryFiles(['a.jpg'], 'trips')).rejects.toMatchObject({ status: 409 });
    expect(await fs.readFile(path.join(bgsDir, 'trips/a.jpg'), 'utf8')).toBe('theirs');
    expect(await fs.readFile(path.join(bgsDir, 'a.jpg'), 'utf8')).toBe('mine');
  });

  it("keeps a slideshow's last picture behind and moves the rest", async () => {
    await seed('nature/a.jpg');
    await seed('nature/b.jpg');
    await seed('trips/.keep');
    configState.config = { screens: [{ id: 's1', name: 'Hall', modules: [
      { id: 'm1', type: 'photo-slideshow', config: { photoSource: { kind: 'library', folder: 'nature' } } },
    ] }] };

    const result = await moveLibraryFiles(['nature/a.jpg', 'nature/b.jpg'], 'trips');

    expect(result.moved).toEqual([{ from: 'nature/a.jpg', to: 'trips/a.jpg' }]);
    expect(result.kept).toEqual([{
      path: 'nature/b.jpg',
      usage: [{ kind: 'slideshow', name: 'Hall', configPath: 'screens[0].modules[0].config.photoSource.folder', screenId: 's1', moduleId: 'm1' }],
    }]);
    expect(await exists('trips/a.jpg')).toBe(true);
    expect(await exists('nature/b.jpg')).toBe(true);
  });

  it('moves a slideshow picture out while another stays, and counts only what the slideshow plays', async () => {
    await seed('nature/a.jpg');
    await seed('nature/clip.mp4');
    await seed('trips/.keep');
    // Photos only: the video left in the folder is nothing the slideshow can show.
    configState.config = { screens: [{ id: 's1', name: 'Hall', modules: [
      { id: 'm1', type: 'photo-slideshow', config: { photoSource: { kind: 'library', folder: 'nature' } } },
    ] }] };

    const result = await moveLibraryFiles(['nature/a.jpg', 'nature/clip.mp4'], 'trips');

    expect(result.moved).toEqual([{ from: 'nature/clip.mp4', to: 'trips/clip.mp4' }]);
    expect(result.kept.map((k) => k.path)).toEqual(['nature/a.jpg']);
  });

  it('puts every file back when the config write fails, leaving references intact', async () => {
    await seed('a.jpg');
    await seed('nature/b.jpg');
    await seed('trips/.keep');
    configState.config = { screens: [{ id: 's1', name: 'Hall', backgroundImage: 'a.jpg' }] };
    configState.failWrite = true;
    await expect(moveLibraryFiles(['a.jpg', 'nature/b.jpg'], 'trips')).rejects.toThrow('disk full');
    expect(await exists('a.jpg')).toBe(true);
    expect(await exists('nature/b.jpg')).toBe(true);
    expect(await exists('trips/a.jpg')).toBe(false);
    expect(await exists('trips/b.jpg')).toBe(false);
    expect((configState.config.screens as { backgroundImage: string }[])[0].backgroundImage).toBe('a.jpg');
  });

  it('refuses the whole batch when a name clashes, moving nothing', async () => {
    await seed('a.jpg');
    await seed('b.jpg');
    await seed('trips/b.jpg');
    await expect(moveLibraryFiles(['a.jpg', 'b.jpg'], 'trips')).rejects.toMatchObject({ status: 409 });
    expect(await exists('a.jpg')).toBe(true);
    expect(await exists('trips/a.jpg')).toBe(false);
  });

  it('refuses a missing file, a bad folder, and a rotation name at the top level', async () => {
    await seed('trips/.keep');
    await expect(moveLibraryFiles(['nope.jpg'], 'trips')).rejects.toMatchObject({ status: 404 });
    await seed('a.jpg');
    await expect(moveLibraryFiles(['a.jpg'], 'missing-folder')).rejects.toMatchObject({ status: 404 });
    await expect(moveLibraryFiles(['a.jpg'], '../etc')).rejects.toBeInstanceOf(LibraryMoveError);
    await seed('trips/rotation-mine.jpg');
    await expect(moveLibraryFiles(['trips/rotation-mine.jpg'], '')).rejects.toMatchObject({ status: 400 });
  });
});

describe('renameLibraryFolder', () => {
  it('renames in place and rewrites file references and slideshow folders, subfolders included', async () => {
    await seed('trips/a.jpg');
    await seed('trips/kids/b.jpg');
    configState.config = { screens: [
      { id: 's1', name: 'Hall', backgroundImage: 'trips/a.jpg' },
      { id: 's2', name: 'Den', modules: [
        { id: 'm1', type: 'photo-slideshow', config: { photoSource: { kind: 'library', folder: 'trips' } } },
        { id: 'm2', type: 'fullscreen-photo', config: { photoSource: { kind: 'library', folder: 'trips/kids' } } },
        { id: 'm3', type: 'video', config: { file: 'trips/kids/b.jpg' } },
        { id: 'm4', type: 'photo-slideshow', config: { photoSource: { kind: 'library', folder: 'tripsy' } } },
      ] },
    ] };

    const before = `rev-${JSON.stringify(configState.config).length}`;

    const result = await renameLibraryFolder('trips', 'Summer 2026');

    expect(result).toMatchObject({ from: 'trips', to: 'Summer-2026', rewritten: 4 });
    expect(result.previousRevision).toBe(before);
    expect(result.revision).toBe(`rev-${JSON.stringify(configState.config).length}`);
    expect(result.revision).not.toBe(before);
    expect(await exists('Summer-2026/kids/b.jpg')).toBe(true);
    expect(await exists('trips')).toBe(false);
    const screens = configState.config.screens as Array<{ backgroundImage?: string; modules?: { config: { photoSource?: { folder: string }; file?: string } }[] }>;
    expect(screens[0].backgroundImage).toBe('Summer-2026/a.jpg');
    expect(screens[1].modules!.map((m) => m.config.photoSource?.folder ?? m.config.file)).toEqual([
      'Summer-2026', 'Summer-2026/kids', 'Summer-2026/kids/b.jpg', 'tripsy',
    ]);
  });

  it('refuses a clash, a missing folder, the top level, and going too deep', async () => {
    await seed('trips/.keep');
    await seed('other/.keep');
    await expect(renameLibraryFolder('trips', 'other')).rejects.toMatchObject({ status: 409 });
    await expect(renameLibraryFolder('nope', 'x')).rejects.toMatchObject({ status: 404 });
    await expect(renameLibraryFolder('', 'x')).rejects.toMatchObject({ status: 400 });
    await expect(renameLibraryFolder('trips', '...')).rejects.toMatchObject({ status: 400 });
    expect(await exists('trips')).toBe(true);
  });

  it('is a no-op when the sanitized name is unchanged', async () => {
    await seed('trips/.keep');
    expect(await renameLibraryFolder('trips', 'trips')).toMatchObject({ from: 'trips', to: 'trips', rewritten: 0 });
  });

  it('renames the folder back when the config write fails', async () => {
    await seed('trips/a.jpg');
    configState.config = { screens: [{ id: 's1', backgroundImage: 'trips/a.jpg' }] };
    configState.failWrite = true;
    await expect(renameLibraryFolder('trips', 'summer')).rejects.toThrow('disk full');
    expect(await exists('trips/a.jpg')).toBe(true);
    expect(await exists('summer')).toBe(false);
    expect((configState.config.screens as { backgroundImage: string }[])[0].backgroundImage).toBe('trips/a.jpg');
  });
});
