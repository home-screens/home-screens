import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { DAY_NOTES_FILE, readDayNotesData, updateDayNotesData } from '../day-notes-data';
import { addDayNote, addIsoDays } from '../day-notes';
import { isoDateInTZ } from '../timezone';
import { DAY_NOTES_LIMITS } from '@/types/day-notes';

// data/day-notes.json resolves against process.cwd(): each test gets its own.
let tmpDir: string;
let origCwd: () => string;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-day-notes-data-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
});
afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

const file = () => path.join(tmpDir, DAY_NOTES_FILE);
const seed = async (data: unknown) => {
  await fs.mkdir(path.dirname(file()), { recursive: true });
  await fs.writeFile(file(), JSON.stringify(data));
};
// No config.json in the sandbox, so the household's day is the machine's.
const today = () => isoDateInTZ(new Date());

describe('day notes store', () => {
  it('reads an empty list before anything is written, without creating the file', async () => {
    expect(await readDayNotesData()).toEqual({ notes: [] });
    await expect(fs.access(file())).rejects.toThrow();
  });

  it('writes through a mutator handed the household day', async () => {
    let seen = '';
    await updateDayNotesData((data, day) => {
      seen = day;
      return addDayNote(data, { id: 'n1', date: day, text: 'Library books back' }, day);
    });
    expect(seen).toBe(today());
    expect(JSON.parse(await fs.readFile(file(), 'utf-8'))).toEqual({ notes: [{ id: 'n1', date: today(), text: 'Library books back' }] });
  });

  it('tidies away notes long past on the next write, and only then', async () => {
    const old = addIsoDays(today(), -DAY_NOTES_LIMITS.keepDays - 1);
    await seed({ notes: [{ id: 'old', date: old, text: 'Long gone' }, { id: 'now', date: today(), text: 'Today' }] });
    expect((await readDayNotesData()).notes.map((n) => n.id)).toEqual(['old', 'now']);
    const after = await updateDayNotesData((data) => data);
    expect(after.notes.map((n) => n.id)).toEqual(['now']);
    expect(JSON.parse(await fs.readFile(file(), 'utf-8')).notes.map((n: { id: string }) => n.id)).toEqual(['now']);
  });

  it('skips the disk when nothing changed', async () => {
    await seed({ notes: [{ id: 'now', date: today(), text: 'Today' }] });
    const before = (await fs.stat(file())).mtimeMs;
    await new Promise((r) => setTimeout(r, 15));
    await updateDayNotesData((data) => data);
    expect((await fs.stat(file())).mtimeMs).toBe(before);
  });

  it('refuses to read over a corrupt file rather than starting empty', async () => {
    await fs.mkdir(path.dirname(file()), { recursive: true });
    await fs.writeFile(file(), '{ not json');
    await expect(readDayNotesData()).rejects.toThrow();
  });
});
