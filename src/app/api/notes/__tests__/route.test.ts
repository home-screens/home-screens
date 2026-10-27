import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

import { GET, POST } from '../route';
import { requireDisplayAuth, requireSession } from '@/lib/auth';
import { NOTES_LIMITS, type Note, type NotesData } from '@/types/notes';

const HOUR = 60 * 60 * 1000;
const fromNow = (ms: number) => new Date(Date.now() + ms).toISOString();

function note(id: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    text: `Note ${id}`,
    pinned: false,
    important: false,
    life: '1d',
    createdAt: fromNow(-HOUR),
    updatedAt: fromNow(-HOUR),
    expiresAt: fromNow(23 * HOUR),
    ...overrides,
  };
}

let root: string;
const notesPath = () => path.join(root, 'data', 'notes.json');
const seed = (data: NotesData) => fs.writeFile(notesPath(), JSON.stringify(data));
const saved = async () => JSON.parse(await fs.readFile(notesPath(), 'utf-8')) as NotesData;
const member = (id: string, name: string) => ({ id, name, color: '#60a5fa', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' });
const seedFamily = () => fs.writeFile(path.join(root, 'data', 'family.json'), JSON.stringify({ members: [member('mom', 'Mom'), member('dad', 'Dad')], migrated: true }));

const get = (query = '', headers: Record<string, string> = {}) => GET(new NextRequest(`http://localhost/api/notes${query}`, { headers }), undefined);
const postRaw = (body: string) => POST(new NextRequest('http://localhost/api/notes', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body,
}), undefined);
const post = (body: unknown) => postRaw(JSON.stringify(body));

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-notes-route-'));
  await fs.mkdir(path.join(root, 'data'));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  await seedFamily();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe('GET /api/notes', () => {
  it('answers an empty board before anything is posted', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notes: [] });
  });

  it('answers every note, live and gone', async () => {
    const board = { notes: [note('live'), note('gone', { expiresAt: fromNow(-HOUR) }), note('keep', { life: 'keep', expiresAt: null })] };
    await seed(board);
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(board);
  });

  it('answers only the notes on the wall right now with ?live=1', async () => {
    await seed({ notes: [note('live'), note('gone', { expiresAt: fromNow(-HOUR) }), note('keep', { life: 'keep', expiresAt: null })] });
    const res = await get('?live=1');
    expect((await res.json()).notes.map((n: Note) => n.id)).toEqual(['live', 'keep']);
  });

  it('is a read the wall may make with its display token', async () => {
    await get();
    expect(requireDisplayAuth).toHaveBeenCalled();
    expect(requireSession).not.toHaveBeenCalled();
  });

  it('answers with the board ETag, and a 304 to a caller that already holds it', async () => {
    await seed({ notes: [note('a')] });
    const first = await get();
    const etag = first.headers.get('ETag');
    expect(etag).toMatch(/^"[0-9a-f]+"$/);
    expect(first.headers.get('Cache-Control')).toBe('no-cache');

    const again = await get('', { 'If-None-Match': etag! });
    expect(again.status).toBe(304);
    expect(again.headers.get('ETag')).toBe(etag);
    expect(await again.text()).toBe('');
  });

  it('answers in full to a caller holding an older ETag', async () => {
    await seed({ notes: [note('a')] });
    const before = (await get()).headers.get('ETag')!;
    expect((await post({ text: 'Pizza tonight' })).status).toBe(200);
    const res = await get('', { 'If-None-Match': before });
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).not.toBe(before);
    expect((await res.json()).notes).toHaveLength(2);
  });
});

describe('POST /api/notes', () => {
  it('posts a note and answers the whole board plus the note it made', async () => {
    await seed({ notes: [note('a')] });
    const res = await post({ text: '  Dentist at 3:40 ', authorId: 'mom', important: true, life: '12h' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toMatchObject({ text: 'Dentist at 3:40', authorId: 'mom', important: true, pinned: false, life: '12h' });
    expect(body.notes.map((n: Note) => n.id)).toEqual(['a', body.created.id]);
    expect((await saved()).notes.at(-1)).toEqual(body.created);
  });

  it('refuses an author who is not in the family, and writes nothing', async () => {
    const res = await post({ text: 'Who wrote this?', authorId: 'stranger' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'That person is not in the family.' });
    await expect(fs.access(notesPath())).rejects.toThrow();
  });

  it('refuses an author that is not an id', async () => {
    const res = await post({ text: 'x', authorId: 7 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'The author must be a family member.' });
  });

  it('posts as nobody when the author is null, empty or left out', async () => {
    for (const body of [{ text: 'a', authorId: null }, { text: 'b', authorId: '' }, { text: 'c' }]) {
      const res = await post(body);
      expect(res.status).toBe(200);
      expect('authorId' in (await res.json()).created).toBe(false);
    }
    expect((await saved()).notes).toHaveLength(3);
  });

  it('refuses a body that is not an object', async () => {
    for (const body of [['Dentist'], 'Dentist', null]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Expected an object' });
    }
  });

  it('refuses a body that is not JSON', async () => {
    const res = await postRaw('{text:');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' });
  });

  it("refuses an empty note with the server's own words, and writes nothing", async () => {
    const res = await post({ text: '   ' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Write something first.' });
    await expect(fs.access(notesPath())).rejects.toThrow();
  });

  it('refuses a bad life or flag with its reason', async () => {
    expect(await (await post({ text: 'x', life: 'forever' })).json()).toEqual({ error: 'Pick how long the note should stay.' });
    expect(await (await post({ text: 'x', pinned: 'yes' })).json()).toEqual({ error: 'Pinned and important must be on or off.' });
  });

  it('refuses a full board of live notes with 409', async () => {
    await seed({ notes: Array.from({ length: NOTES_LIMITS.maxNotes }, (_, i) => note(`n${i}`)) });
    const res = await post({ text: 'One too many' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'The board is full: 200 notes. Take some down first.' });
    expect((await saved()).notes).toHaveLength(NOTES_LIMITS.maxNotes);
  });

  it('needs a signed-in session, never a wall token', async () => {
    vi.mocked(requireSession).mockRejectedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    const res = await post({ text: 'From the wall' });
    expect(res.status).toBe(401);
    await expect(fs.access(notesPath())).rejects.toThrow();
  });
});
