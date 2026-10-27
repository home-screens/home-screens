import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { authorProblem, notesWrite } from '../notes-api';
import { NotesError } from '../notes-errors';
import type { Note, NotesData } from '@/types/notes';

let root: string;
const notesPath = () => path.join(root, 'data', 'notes.json');
const familyPath = () => path.join(root, 'data', 'family.json');
const member = (id: string, name: string) => ({ id, name, color: '#60a5fa', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' });

function note(id: string): Note {
  return {
    id,
    text: `Note ${id}`,
    pinned: false,
    important: false,
    life: 'keep',
    createdAt: '2026-10-20T15:00:00.000Z',
    updatedAt: '2026-10-20T15:00:00.000Z',
    expiresAt: null,
  };
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-notes-api-'));
  await fs.mkdir(path.join(root, 'data'));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  await fs.writeFile(familyPath(), JSON.stringify({ members: [member('mom', 'Mom')], migrated: true }));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe('authorProblem', () => {
  it('lets a current family member through', async () => {
    expect(await authorProblem('mom')).toBeNull();
  });

  it('lets nobody through as nobody, without asking the family', async () => {
    // With no family file to read, any lookup would find no one.
    await fs.rm(familyPath());
    expect(await authorProblem(undefined)).toBeNull();
    expect(await authorProblem(null)).toBeNull();
    expect(await authorProblem('')).toBeNull();
  });

  it('refuses someone who is not in the family', async () => {
    const res = await authorProblem('stranger');
    expect(res?.status).toBe(400);
    expect(await res!.json()).toEqual({ error: 'That person is not in the family.' });
  });

  it('refuses an author that is not an id', async () => {
    for (const value of [7, true, { id: 'mom' }, ['mom']]) {
      const res = await authorProblem(value);
      expect(res?.status).toBe(400);
      expect(await res!.json()).toEqual({ error: 'The author must be a family member.' });
    }
  });
});

describe('notesWrite', () => {
  it('answers every note after the write, plus the extra fields read once it landed', async () => {
    let made: string | undefined;
    const res = await notesWrite(
      (data) => {
        made = 'n2';
        return { notes: [...data.notes, note('n1'), note('n2')] };
      },
      () => ({ created: made }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notes: [note('n1'), note('n2')], created: 'n2' });
    expect((JSON.parse(await fs.readFile(notesPath(), 'utf-8')) as NotesData).notes).toHaveLength(2);
  });

  it("turns a NotesError into its status and the error's own words", async () => {
    const res = await notesWrite(() => { throw new NotesError(409, 'The board is full: 200 notes. Take some down first.'); });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'The board is full: 200 notes. Take some down first.' });
  });

  it('lets any other failure through to the route wrapper', async () => {
    await expect(notesWrite(() => { throw new Error('disk on fire'); })).rejects.toThrow('disk on fire');
  });
});
