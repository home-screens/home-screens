import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('@/lib/build-id', () => ({ readBuildId: vi.fn() }));

import { readBuildId } from '@/lib/build-id';
import { notesEtag } from '@/lib/notes-revision';
import { updateNotesData, writeNotesData } from '@/lib/notes-data';

let root: string;
const put = (data: unknown) => fs.writeFile(path.join(root, 'data', 'notes.json'), JSON.stringify(data));

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-notes-revision-'));
  await fs.mkdir(path.join(root, 'data'));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  vi.mocked(readBuildId).mockResolvedValue('build-1');
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe('notesEtag', () => {
  it('is a quoted tag that stays the same while nothing changes', async () => {
    await put({ notes: [] });
    const etag = await notesEtag();
    expect(etag).toMatch(/^"[0-9a-f]{24}"$/);
    expect(await notesEtag()).toBe(etag);
  });

  it('has a stable value before the board is first saved, and moves once it is', async () => {
    const before = await notesEtag();
    expect(await notesEtag()).toBe(before);
    await writeNotesData({ notes: [] });
    expect(await notesEtag()).not.toBe(before);
  });

  it('moves when the board is saved, even to the same bytes', async () => {
    await writeNotesData({ notes: [] });
    const before = await notesEtag();
    // A store write lands through a rename: a new file, whatever it holds.
    await writeNotesData({ notes: [] });
    expect(await notesEtag()).not.toBe(before);
  });

  it('stays put when an update changes nothing and so never writes', async () => {
    await put({ notes: [] });
    const before = await notesEtag();
    await updateNotesData((current) => current);
    expect(await notesEtag()).toBe(before);
  });

  it('moves with the build, which can change what the same file answers', async () => {
    await put({ notes: [] });
    const before = await notesEtag();
    vi.mocked(readBuildId).mockResolvedValue('build-2');
    expect(await notesEtag()).not.toBe(before);
  });
});
