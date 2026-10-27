import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { NOTES_FILE, NotesError as ReexportedNotesError, readNotesData, sweepGone, updateNotesData, validateNotesData, writeNotesData } from '../notes-data';
import { NotesError } from '../notes-errors';
import { NOTES_GONE_KEEP_MS, type Note, type NotesData } from '@/types/notes';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// data/notes.json resolves against process.cwd(), so each test gets its own
// tmp cwd and a fresh, empty data directory.
let tmpDir: string;
let origCwd: () => string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-notes-data-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

const file = () => path.join(tmpDir, NOTES_FILE);

async function seedRaw(contents: string): Promise<void> {
  await fs.mkdir(path.dirname(file()), { recursive: true });
  await fs.writeFile(file(), contents);
}

const seed = (data: unknown) => seedRaw(JSON.stringify(data));

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function note(id: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    text: `Note ${id}`,
    pinned: false,
    important: false,
    life: '1d',
    createdAt: '2026-10-20T15:00:00.000Z',
    updatedAt: '2026-10-20T15:00:00.000Z',
    expiresAt: '2026-10-21T15:00:00.000Z',
    ...overrides,
  };
}

/** An expiry relative to the real clock, for the store's own `new Date()`. */
const fromNow = (ms: number) => new Date(Date.now() + ms).toISOString();

describe('validateNotesData', () => {
  it('accepts a sound board', () => {
    expect(validateNotesData({ notes: [] })).toBeNull();
    expect(validateNotesData({ notes: [note('a', { authorId: 'mom' }), note('b', { life: 'keep', expiresAt: null })] })).toBeNull();
    expect(validateNotesData({ notes: Array.from({ length: 200 }, (_, i) => note(`n${i}`)) })).toBeNull();
    expect(validateNotesData({ notes: [note('a', { text: 'x'.repeat(500) })] })).toBeNull();
  });

  it.each<[string, unknown, string]>([
    ['null', null, 'Notes must be an object with a notes array'],
    ['an array', [note('a')], 'Notes must be an object with a notes array'],
    ['a string', 'notes', 'Notes must be an object with a notes array'],
    ['no notes array', { notes: { a: note('a') } }, 'Notes must be an object with a notes array'],
    ['too many notes', { notes: Array.from({ length: 201 }, (_, i) => note(`n${i}`)) }, 'Notes: at most 200 notes'],
    ['a note that is not an object', { notes: [note('a'), null] }, 'Note 2 must be an object'],
    ['a note that is an array', { notes: [[]] }, 'Note 1 must be an object'],
    ['a missing id', { notes: [{ ...note('a'), id: undefined }] }, 'Note 1 is missing its id'],
    ['an empty id', { notes: [note('')] }, 'Note 1 is missing its id'],
    ['a repeated id', { notes: [note('a'), note('b'), note('a')] }, 'Note 3 repeats the id of another note'],
    ['blank text', { notes: [note('a', { text: '   ' })] }, 'Note 1 is missing its text'],
    ['text that is not a string', { notes: [{ ...note('a'), text: 12 }] }, 'Note 1 is missing its text'],
    ['overlong text', { notes: [note('a', { text: 'x'.repeat(501) })] }, 'Note 1: text is longer than 500 characters'],
    ['an empty author', { notes: [note('a', { authorId: '' })] }, 'Note 1: authorId must be an id'],
    ['a null author', { notes: [{ ...note('a'), authorId: null }] }, 'Note 1: authorId must be an id'],
    ['a pinned that is not a boolean', { notes: [{ ...note('a'), pinned: 'yes' }] }, 'Note 1: pinned must be true or false'],
    ['a missing important', { notes: [{ ...note('a'), important: undefined }] }, 'Note 1: important must be true or false'],
    ['an unknown life', { notes: [{ ...note('a'), life: '2w' }] }, 'Note 1: life must be one of 12h, 1d, 3d, 7d, keep'],
    ['a missing createdAt', { notes: [{ ...note('a'), createdAt: undefined }] }, 'Note 1 is missing createdAt'],
    ['an unreadable updatedAt', { notes: [note('a', { updatedAt: 'yesterday-ish' })] }, 'Note 1 is missing updatedAt'],
    ['a missing expiresAt', { notes: [{ ...note('a'), expiresAt: undefined }] }, 'Note 1: expiresAt must be a timestamp or null'],
    ['an unreadable expiresAt', { notes: [note('a', { expiresAt: 'soon' })] }, 'Note 1: expiresAt must be a timestamp or null'],
  ])('refuses %s with a plain reason', (_label, doc, message) => {
    expect(validateNotesData(doc)).toBe(message);
  });
});

describe('NotesError', () => {
  it('is the same class whether imported from the store or its own file', () => {
    expect(ReexportedNotesError).toBe(NotesError);
    const error = new NotesError(409, 'The board is full.');
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'NotesError', status: 409, message: 'The board is full.' });
  });
});

describe('sweepGone', () => {
  const now = new Date('2026-10-20T15:00:00.000Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it('hands back the same board when nothing is old enough to drop', () => {
    const data: NotesData = { notes: [note('live'), note('keep', { expiresAt: null }), note('gone', { expiresAt: ago(DAY) }), note('edge', { expiresAt: ago(NOTES_GONE_KEEP_MS) })] };
    expect(sweepGone(data, now)).toBe(data);
  });

  it('drops only the notes gone for longer than the keep window', () => {
    const data: NotesData = { notes: [note('old', { expiresAt: ago(NOTES_GONE_KEEP_MS + 1) }), note('gone', { expiresAt: ago(DAY) }), note('keep', { expiresAt: null })] };
    const swept = sweepGone(data, now);
    expect(swept).not.toBe(data);
    expect(swept.notes.map((n) => n.id)).toEqual(['gone', 'keep']);
    expect(data.notes).toHaveLength(3);
  });
});

describe('readNotesData', () => {
  it('gives an empty board when the file does not exist yet, and does not create it', async () => {
    expect(await readNotesData()).toEqual({ notes: [] });
    expect(await exists(file())).toBe(false);
  });

  it('hands out a fresh empty board each time', async () => {
    const first = await readNotesData();
    first.notes.push(note('leak'));
    expect(await readNotesData()).toEqual({ notes: [] });
  });

  it('reads the saved board, gone notes included, without sweeping or writing', async () => {
    const raw = JSON.stringify({ notes: [note('old', { expiresAt: fromNow(-NOTES_GONE_KEEP_MS - DAY) }), note('live', { expiresAt: fromNow(DAY) })] });
    await seedRaw(raw);
    const data = await readNotesData();
    expect(data.notes.map((n) => n.id)).toEqual(['old', 'live']);
    expect(await fs.readFile(file(), 'utf-8')).toBe(raw);
  });

  it('throws on a corrupt file instead of handing back an empty board', async () => {
    await seedRaw('{"notes": [');
    await expect(readNotesData()).rejects.toThrow();
  });
});

describe('writeNotesData', () => {
  it('writes the whole board, which the next read returns', async () => {
    const data: NotesData = { notes: [note('a', { authorId: 'mom' }), note('b', { life: 'keep', expiresAt: null })] };
    await writeNotesData(data);
    expect(await readNotesData()).toEqual(data);
  });
});

describe('updateNotesData', () => {
  it('sweeps before the mutator sees the board', async () => {
    await seed({ notes: [note('old', { expiresAt: fromNow(-NOTES_GONE_KEEP_MS - HOUR) }), note('gone', { expiresAt: fromNow(-HOUR) }), note('live', { expiresAt: fromNow(HOUR) })] });
    let seen: string[] = [];
    const result = await updateNotesData((current) => {
      seen = current.notes.map((n) => n.id);
      return { notes: [...current.notes, note('new')] };
    });
    expect(seen).toEqual(['gone', 'live']);
    expect(result.notes.map((n) => n.id)).toEqual(['gone', 'live', 'new']);
    expect((await readNotesData()).notes.map((n) => n.id)).toEqual(['gone', 'live', 'new']);
  });

  it('keeps the previous board beside the new one', async () => {
    const raw = JSON.stringify({ notes: [note('a', { expiresAt: fromNow(DAY) })] });
    await seedRaw(raw);
    await updateNotesData((current) => ({ notes: [...current.notes, note('b')] }));
    expect(await fs.readFile(`${file()}.bak`, 'utf-8')).toBe(raw);
  });

  it('skips the disk when the mutator hands back its input and nothing was swept', async () => {
    const raw = JSON.stringify({ notes: [note('live', { expiresAt: fromNow(DAY) }), note('gone', { expiresAt: fromNow(-DAY) })] });
    await seedRaw(raw);
    const before = await fs.stat(file());
    const result = await updateNotesData((current) => current);
    expect(result.notes.map((n) => n.id)).toEqual(['live', 'gone']);
    // Compact on disk still: the store writes indented JSON, so any write would show.
    expect(await fs.readFile(file(), 'utf-8')).toBe(raw);
    expect((await fs.stat(file())).ino).toBe(before.ino);
    expect(await exists(`${file()}.bak`)).toBe(false);
  });

  it('does not create the file for a no-op on an empty board', async () => {
    expect(await updateNotesData((current) => current)).toEqual({ notes: [] });
    expect(await exists(file())).toBe(false);
  });

  it('writes when the sweep alone changed the board', async () => {
    await seed({ notes: [note('old', { expiresAt: fromNow(-NOTES_GONE_KEEP_MS - HOUR) }), note('live', { expiresAt: fromNow(DAY) })] });
    const result = await updateNotesData((current) => current);
    expect(result.notes.map((n) => n.id)).toEqual(['live']);
    const onDisk = JSON.parse(await fs.readFile(file(), 'utf-8')) as NotesData;
    expect(onDisk.notes.map((n) => n.id)).toEqual(['live']);
  });

  it('leaves the file alone when the mutator refuses', async () => {
    const raw = JSON.stringify({ notes: [note('old', { expiresAt: fromNow(-NOTES_GONE_KEEP_MS - HOUR) }), note('live', { expiresAt: fromNow(DAY) })] });
    await seedRaw(raw);
    await expect(updateNotesData(() => { throw new NotesError(404, 'That note is no longer here.'); })).rejects.toMatchObject({ status: 404, message: 'That note is no longer here.' });
    expect(await fs.readFile(file(), 'utf-8')).toBe(raw);
  });

  it('runs one update after another, so neither loses the other', async () => {
    await seed({ notes: [] });
    await Promise.all([
      updateNotesData((current) => ({ notes: [...current.notes, note('a')] })),
      updateNotesData((current) => ({ notes: [...current.notes, note('b')] })),
    ]);
    expect((await readNotesData()).notes.map((n) => n.id).sort()).toEqual(['a', 'b']);
  });

  it('refuses to overwrite a corrupt board', async () => {
    await seedRaw('not json');
    await expect(updateNotesData((current) => ({ notes: [...current.notes, note('a')] }))).rejects.toThrow();
    expect(await fs.readFile(file(), 'utf-8')).toBe('not json');
  });
});
