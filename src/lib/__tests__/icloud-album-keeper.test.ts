import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { createAlbumKeeper, type AlbumKeeper, type AlbumKeeperOptions } from '@/lib/icloud-album-keeper';

interface Entry {
  guid: string;
}

const FILE = path.join('data', 'icloud-albums.json');
const isEntry = (value: unknown): value is Entry => typeof (value as Entry | null)?.guid === 'string';
const album = (...guids: string[]): Entry[] => guids.map((guid) => ({ guid }));

/** A keeper as a hub that has just started would build it: nothing in memory. */
function startHub(read: AlbumKeeperOptions<Entry>['read'], extra: Partial<AlbumKeeperOptions<Entry>> = {}): AlbumKeeper<Entry> {
  return createAlbumKeeper<Entry>({ backend: 'test', read, isEntry, ...extra });
}

async function savedAlbums(): Promise<Record<string, { entries: Entry[]; readAt: number }>> {
  return JSON.parse(await fs.readFile(FILE, 'utf-8').catch(() => '{}'));
}

/** Wait for a save set off behind a read to land. */
async function saved(key: string, guids: string[] | null) {
  await vi.waitFor(async () => {
    expect((await savedAlbums())[key]?.entries.map((entry) => entry.guid) ?? null).toEqual(guids);
  });
}

/** Let a read that was set off behind an answer finish. */
async function settle() {
  await vi.advanceTimersByTimeAsync(0);
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await startHub(async () => null).clear();
});

afterEach(() => {
  vi.useRealTimers();
  warn.mockRestore();
});

describe('createAlbumKeeper', () => {
  it('reads an album once and answers later callers from the copy in hand', async () => {
    const read = vi.fn(async () => album('a', 'b'));
    const hub = startHub(read);

    expect(await hub.entries('T')).toEqual(album('a', 'b'));
    expect(await hub.entries('T')).toEqual(album('a', 'b'));
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('shares one read between callers who ask before it answers', async () => {
    let release!: (entries: Entry[]) => void;
    const read = vi.fn(() => new Promise<Entry[]>((resolve) => { release = resolve; }));
    const hub = startHub(read);

    const asks = [hub.entries('T'), hub.entries('T'), hub.refresh('T')];
    await vi.waitFor(() => expect(read).toHaveBeenCalled());
    release(album('a'));

    expect(await Promise.all(asks)).toEqual([album('a'), album('a'), album('a')]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('answers an aged copy at once and reads behind it', async () => {
    vi.useFakeTimers();
    let answer = album('a');
    const read = vi.fn(async () => answer);
    const hub = startHub(read);
    await hub.entries('T');

    vi.advanceTimersByTime(5 * 60_000 - 1);
    await hub.entries('T');
    expect(read).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2);
    answer = album('a', 'b');
    expect(await hub.entries('T')).toEqual(album('a'));
    await settle();
    expect(await hub.entries('T')).toEqual(album('a', 'b'));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('keeps the copy through a failed read, tries again a minute later, and gives up on it after a day', async () => {
    vi.useFakeTimers();
    const read = vi.fn<AlbumKeeperOptions<Entry>['read']>(async () => album('a'));
    const hub = startHub(read);
    await hub.entries('T');
    read.mockRejectedValue(new Error('iCloud is away'));

    vi.advanceTimersByTime(5 * 60_000 + 1);
    expect(await hub.entries('T')).toEqual(album('a'));
    await settle();
    expect(read).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();

    // Not on every poll while Apple is away.
    vi.advanceTimersByTime(30_000);
    await hub.entries('T');
    await settle();
    expect(read).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(31_000);
    await hub.entries('T');
    await settle();
    expect(read).toHaveBeenCalledTimes(3);

    // A day on, the copy is too old to show as the album.
    vi.advanceTimersByTime(24 * 60 * 60_000);
    await expect(hub.entries('T')).rejects.toThrow('iCloud is away');
  });

  it('throws for an album it has never read when Apple does not answer, and remembers nothing of it', async () => {
    const read = vi.fn<AlbumKeeperOptions<Entry>['read']>().mockRejectedValueOnce(new Error('iCloud is away')).mockResolvedValue(album('a'));
    const hub = startHub(read);

    await expect(hub.entries('T')).rejects.toThrow('iCloud is away');
    expect(await hub.entries('T')).toEqual(album('a'));
  });

  it('remembers an album that is gone for a minute', async () => {
    vi.useFakeTimers();
    const read = vi.fn<AlbumKeeperOptions<Entry>['read']>(async () => null);
    const hub = startHub(read);

    expect(await hub.entries('T')).toBeNull();
    expect(await hub.entries('T')).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(61_000);
    read.mockResolvedValue(album('a'));
    expect(await hub.entries('T')).toEqual(album('a'));
  });

  it('keeps albums apart by token', async () => {
    const hub = startHub(async (token) => album(token));
    expect(await hub.entries('one')).toEqual(album('one'));
    expect(await hub.entries('two')).toEqual(album('two'));
  });

  describe('an empty answer for an album that had items', () => {
    it('is taken as a failed read while the backend says the items are still there', async () => {
      vi.useFakeTimers();
      const read = vi.fn(async () => album('a', 'b'));
      const stillHasItems = vi.fn(async () => true);
      const hub = startHub(read, { stillHasItems });
      await hub.entries('T');

      read.mockResolvedValue([]);
      await expect(hub.refresh('T')).rejects.toThrow('still has items');
      expect(stillHasItems).toHaveBeenCalledWith('T', album('a', 'b'));
      expect(await hub.entries('T')).toEqual(album('a', 'b'));
    });

    it('empties the album once the backend agrees they are gone', async () => {
      const read = vi.fn(async () => album('a'));
      const hub = startHub(read, { stillHasItems: async () => false });
      await hub.entries('T');

      read.mockResolvedValue([]);
      expect(await hub.refresh('T')).toEqual([]);
      expect(await hub.entries('T')).toEqual([]);
    });

    it('is taken at its word by a backend with no such check, and for an album first read empty', async () => {
      const read = vi.fn(async () => album('a'));
      const hub = startHub(read);
      await hub.entries('T');
      read.mockResolvedValue([]);
      expect(await hub.refresh('T')).toEqual([]);

      const stillHasItems = vi.fn(async () => true);
      expect(await startHub(async () => [], { stillHasItems }).entries('new')).toEqual([]);
      expect(stillHasItems).not.toHaveBeenCalled();
    });
  });

  describe('across a restart', () => {
    it('lists an album from disk at once, and reads Apple behind it', async () => {
      await startHub(async () => album('a', 'b')).entries('T');
      await saved('test:T', ['a', 'b']);

      // The hub starts again; Apple takes its time.
      let release!: (entries: Entry[]) => void;
      const read = vi.fn(() => new Promise<Entry[]>((resolve) => { release = resolve; }));
      const hub = startHub(read);

      expect(await hub.entries('T')).toEqual(album('a', 'b'));
      expect(read).toHaveBeenCalledTimes(1);

      release(album('a', 'b', 'c'));
      await vi.waitFor(async () => expect(await hub.entries('T')).toEqual(album('a', 'b', 'c')));
      await saved('test:T', ['a', 'b', 'c']);
    });

    it('still lists the album when Apple cannot be read after the restart', async () => {
      await startHub(async () => album('a')).entries('T');
      await saved('test:T', ['a']);

      const hub = startHub(async () => { throw new Error('iCloud is away'); });
      expect(await hub.entries('T')).toEqual(album('a'));
      expect(await hub.entries('T')).toEqual(album('a'));
    });

    it('does not use a copy more than a day old', async () => {
      await fs.writeFile(FILE, JSON.stringify({ 'test:T': { entries: album('old'), readAt: Date.now() - 24 * 60 * 60_000 - 1_000 } }));
      const read = vi.fn(async () => album('new'));

      expect(await startHub(read).entries('T')).toEqual(album('new'));
      expect(read).toHaveBeenCalledTimes(1);
    });

    it('takes an album off disk when it is gone', async () => {
      const read = vi.fn<AlbumKeeperOptions<Entry>['read']>(async () => album('a'));
      const hub = startHub(read);
      await hub.entries('T');
      await saved('test:T', ['a']);

      read.mockResolvedValue(null);
      expect(await hub.refresh('T')).toBeNull();
      await saved('test:T', null);
    });

    it('leaves another backend\'s albums alone, and reads only its own', async () => {
      const other = createAlbumKeeper<Entry>({ backend: 'other', read: async () => album('theirs'), isEntry });
      await other.entries('T');
      await saved('other:T', ['theirs']);
      await startHub(async () => album('mine')).entries('T');
      await saved('test:T', ['mine']);

      expect((await savedAlbums())['other:T'].entries).toEqual(album('theirs'));
      const read = vi.fn(async () => album('fresh'));
      expect(await startHub(read).entries('T')).toEqual(album('mine'));
    });

    it('does not rewrite the file for an album that has not changed', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const hub = startHub(async () => album('a'));
      await hub.entries('T');
      await saved('test:T', ['a']);
      const firstSave = (await savedAlbums())['test:T'].readAt;

      vi.setSystemTime(Date.now() + 60 * 60_000);
      await hub.refresh('T');
      await new Promise((resolve) => setImmediate(resolve));
      expect((await savedAlbums())['test:T'].readAt).toBe(firstSave);

      // Now and then its date is moved along, so a restart does not take it for a stale one.
      vi.setSystemTime(Date.now() + 6 * 60 * 60_000);
      await hub.refresh('T');
      await vi.waitFor(async () => expect((await savedAlbums())['test:T'].readAt).toBeGreaterThan(firstSave));
    });

    it('ignores a file it cannot make sense of, and entries that are not its own', async () => {
      await fs.writeFile(FILE, 'not json');
      expect(await startHub(async () => album('a')).entries('T')).toEqual(album('a'));

      await fs.writeFile(FILE, JSON.stringify({
        'test:T': { entries: [{ guid: 'kept' }, null, { guid: 7 }, 'junk'], readAt: Date.now() },
        'test:U': { entries: 'nope', readAt: Date.now() },
        'test:V': null,
      }));
      const hub = startHub(() => new Promise<Entry[]>(() => {}));
      expect(await hub.entries('T')).toEqual(album('kept'));
    });

    it('keeps the read working when the list cannot be saved', async () => {
      // A directory where the file should be: every write fails.
      await fs.rm(FILE, { force: true });
      await fs.mkdir(FILE);
      try {
        const hub = startHub(async () => album('a'));
        expect(await hub.entries('T')).toEqual(album('a'));
        await vi.waitFor(() => expect(warn).toHaveBeenCalled());
      } finally {
        await fs.rmdir(FILE);
      }
    });
  });
});
