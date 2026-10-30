import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ScreenConfiguration } from '@/types/config';

vi.mock('@/lib/build-id', () => ({ readBuildId: vi.fn() }));
vi.mock('@/lib/config-cache', () => ({ readConfigCached: vi.fn(), invalidateConfigReadCache: vi.fn() }));
vi.mock('@/lib/plugins', () => ({ getInstalledRevision: vi.fn() }));
vi.mock('@/lib/timer-data', () => ({ readSessionRevision: vi.fn() }));
vi.mock('@/lib/chore-revisions', () => ({ choresEtag: vi.fn(), rewardsEtag: vi.fn() }));
vi.mock('@/lib/household-day', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/household-day')>(),
  householdToday: vi.fn(),
}));

import { readBuildId } from '@/lib/build-id';
import { readConfigCached } from '@/lib/config-cache';
import { getInstalledRevision } from '@/lib/plugins';
import { readSessionRevision } from '@/lib/timer-data';
import { choresEtag, rewardsEtag } from '@/lib/chore-revisions';
import { configRevision } from '@/lib/config';
import { householdToday, hubTimezone } from '@/lib/household-day';
import { wallEtag } from '@/lib/wall-config';
import { readDisplayRevisions } from '@/lib/display-revisions';
import { bumpLibraryRevision, libraryRevision } from '@/lib/library-revision';
import { bumpCalendarRevision, calendarRevision } from '@/lib/calendar-revision';
import { notesEtag } from '@/lib/notes-revision';
import { writeNotesData } from '@/lib/notes-data';
import { dayNotesEtag } from '@/lib/day-notes-revision';
import { updateDayNotesData } from '@/lib/day-notes-data';

const CONFIG = { screens: [], settings: { timezone: 'UTC' } } as unknown as ScreenConfiguration;

// The notes board's revision is a stat of data/notes.json, so each test gets
// its own data directory.
let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-display-revisions-'));
  await fs.mkdir(path.join(root, 'data'));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  vi.mocked(readBuildId).mockResolvedValue('build-1');
  vi.mocked(readConfigCached).mockResolvedValue(CONFIG);
  vi.mocked(getInstalledRevision).mockResolvedValue('plugins-1');
  vi.mocked(readSessionRevision).mockResolvedValue('timer-1');
  vi.mocked(householdToday).mockResolvedValue('2026-09-25');
  vi.mocked(choresEtag).mockImplementation(async (today) => `"chores-${today}"`);
  vi.mocked(rewardsEtag).mockImplementation(async (today) => `"rewards-${today}"`);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe('readDisplayRevisions', () => {
  it("names the config by the exact ETag a wall's config read is answered with", async () => {
    expect(await readDisplayRevisions()).toEqual({
      buildId: 'build-1',
      plugins: 'plugins-1',
      config: wallEtag(configRevision(CONFIG), hubTimezone()),
      timer: 'timer-1',
      chores: '"chores-2026-09-25"',
      rewards: '"rewards-2026-09-25"',
      notes: await notesEtag(),
      dayNotes: await dayNotesEtag(),
      library: libraryRevision(),
      calendar: calendarRevision(),
    });
  });

  it('names the notes board by the ETag its read answers with, and a new one once the board is saved', async () => {
    const before = await readDisplayRevisions();
    expect(before.notes).toMatch(/^"[0-9a-f]+"$/);
    await writeNotesData({ notes: [] });
    const after = await readDisplayRevisions();
    expect(after.notes).toBe(await notesEtag());
    expect(after.notes).not.toBe(before.notes);
    expect({ ...after, notes: undefined }).toEqual({ ...before, notes: undefined });
  });

  it('names the day notes by the ETag their read answers with, and a new one once a note is saved', async () => {
    const before = await readDisplayRevisions();
    expect(before.dayNotes).toMatch(/^"[0-9a-f]+"$/);
    await updateDayNotesData(() => ({ notes: [{ id: 'd1', date: '2099-11-04', text: 'Picture day' }] }));
    const after = await readDisplayRevisions();
    expect(after.dayNotes).toBe(await dayNotesEtag());
    expect(after.dayNotes).not.toBe(before.dayNotes);
    expect({ ...after, dayNotes: undefined }).toEqual({ ...before, dayNotes: undefined });
  });

  it('leaves out only the notes and day notes when their folder cannot be looked at', async () => {
    // A file where the data folder should be: stat answers ENOTDIR, not ENOENT.
    await fs.rm(path.join(root, 'data'), { recursive: true });
    await fs.writeFile(path.join(root, 'data'), '');

    const revisions = await readDisplayRevisions();

    expect(revisions.notes).toBeUndefined();
    expect(revisions.dayNotes).toBeUndefined();
    expect(revisions).toMatchObject({ buildId: 'build-1', chores: '"chores-2026-09-25"', rewards: '"rewards-2026-09-25"' });
  });

  it('names a new library revision once an upload, delete or move bumps it', async () => {
    const before = (await readDisplayRevisions()).library;
    bumpLibraryRevision();
    const after = (await readDisplayRevisions()).library;
    expect(after).toBeDefined();
    expect(after).not.toBe(before);
  });

  it('names a new calendar revision once a Google Calendar sign-in bumps it, and leaves the library alone', async () => {
    const before = await readDisplayRevisions();
    bumpCalendarRevision();
    const after = await readDisplayRevisions();
    expect(after.calendar).toBeDefined();
    expect(after.calendar).not.toBe(before.calendar);
    expect(after.library).toBe(before.library);
  });

  it("names the chores and rewards by the ETags their reads answer with on the household's day", async () => {
    vi.mocked(householdToday).mockResolvedValue('2026-09-26');

    const revisions = await readDisplayRevisions();

    expect(choresEtag).toHaveBeenCalledWith('2026-09-26');
    expect(rewardsEtag).toHaveBeenCalledWith('2026-09-26');
    expect(revisions).toMatchObject({ chores: '"chores-2026-09-26"', rewards: '"rewards-2026-09-26"' });
  });

  it('leaves out only the field it could not work out', async () => {
    vi.mocked(readConfigCached).mockRejectedValue(new Error('config.json is corrupt'));
    vi.mocked(readSessionRevision).mockRejectedValue(new Error('unreadable'));
    vi.mocked(choresEtag).mockRejectedValue(new Error('EACCES'));

    const revisions = await readDisplayRevisions();

    expect(revisions.config).toBeUndefined();
    expect(revisions.timer).toBeUndefined();
    expect(revisions.chores).toBeUndefined();
    expect(revisions).toMatchObject({ buildId: 'build-1', plugins: 'plugins-1', rewards: '"rewards-2026-09-25"' });
  });
});
