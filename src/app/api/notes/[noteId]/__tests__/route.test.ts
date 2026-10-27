import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

import { DELETE, PATCH } from '../route';
import { requireSession } from '@/lib/auth';
import { isGone, isLive } from '@/lib/notes-rules';
import type { Note, NotesData } from '@/types/notes';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
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
const ctx = (noteId: string) => ({ params: Promise.resolve({ noteId }) });
const member = (id: string, name: string) => ({ id, name, color: '#60a5fa', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' });
const seedFamily = () => fs.writeFile(path.join(root, 'data', 'family.json'), JSON.stringify({ members: [member('mom', 'Mom'), member('dad', 'Dad')], migrated: true }));

const patch = (id: string, body: unknown) => PATCH(new NextRequest(`http://localhost/api/notes/${id}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}), ctx(id));
const remove = (id: string) => DELETE(new NextRequest(`http://localhost/api/notes/${id}`, { method: 'DELETE' }), ctx(id));

const byId = (notes: Note[], id: string) => notes.find((n) => n.id === id)!;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-notes-id-route-'));
  await fs.mkdir(path.join(root, 'data'));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  await seedFamily();
  await seed({ notes: [note('a', { authorId: 'dad' }), note('b'), note('gone', { life: '3d', expiresAt: fromNow(-HOUR), createdAt: fromNow(-4 * DAY) })] });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe('PATCH /api/notes/[noteId]', () => {
  it('changes the fields it is given and answers the whole board', async () => {
    const res = await patch('a', { text: ' Pizza tonight ', pinned: true, authorId: null });
    expect(res.status).toBe(200);
    const { notes } = await res.json();
    expect(notes.map((n: Note) => n.id)).toEqual(['a', 'b', 'gone']);
    const a = byId(notes, 'a');
    expect(a).toMatchObject({ text: 'Pizza tonight', pinned: true });
    expect('authorId' in a).toBe(false);
    expect(byId((await saved()).notes, 'a')).toEqual(a);
  });

  it('sets an author who is in the family', async () => {
    const res = await patch('b', { authorId: 'mom' });
    expect(res.status).toBe(200);
    expect(byId((await res.json()).notes, 'b').authorId).toBe('mom');
  });

  it('refuses an author who is not in the family, and writes nothing', async () => {
    const raw = await fs.readFile(notesPath(), 'utf-8');
    const res = await patch('a', { authorId: 'stranger', text: 'Changed' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'That person is not in the family.' });
    expect(await fs.readFile(notesPath(), 'utf-8')).toBe(raw);
  });

  it('clears the author with an empty string as well as null', async () => {
    const res = await patch('a', { authorId: '' });
    expect(res.status).toBe(200);
    expect('authorId' in byId((await res.json()).notes, 'a')).toBe(false);
  });

  it('counts a new life from now', async () => {
    const before = Date.now();
    const { notes } = await (await patch('b', { life: '7d' })).json();
    const expires = Date.parse(byId(notes, 'b').expiresAt!);
    expect(expires).toBeGreaterThanOrEqual(before + 7 * DAY);
    expect(expires).toBeLessThanOrEqual(Date.now() + 7 * DAY);
  });

  it('takes a note down, keeping it for the Gone group', async () => {
    const res = await patch('a', { action: 'take-down' });
    expect(res.status).toBe(200);
    const a = byId((await res.json()).notes, 'a');
    expect(isGone(a, new Date())).toBe(true);
    expect(isGone(byId((await saved()).notes, 'a'), new Date())).toBe(true);
  });

  it('leaves the file alone when taking down a note that is already gone', async () => {
    const raw = await fs.readFile(notesPath(), 'utf-8');
    const res = await patch('gone', { action: 'take-down' });
    expect(res.status).toBe(200);
    expect(await fs.readFile(notesPath(), 'utf-8')).toBe(raw);
  });

  it('reposts a gone note as if posted now, with the life it had', async () => {
    const before = Date.now();
    const res = await patch('gone', { action: 'repost' });
    expect(res.status).toBe(200);
    const g = byId((await res.json()).notes, 'gone');
    expect(isLive(g, new Date())).toBe(true);
    expect(Date.parse(g.createdAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(g.expiresAt!) - Date.parse(g.createdAt)).toBe(3 * DAY);
  });

  it('refuses an action it does not know, and writes nothing', async () => {
    const raw = await fs.readFile(notesPath(), 'utf-8');
    const res = await patch('a', { action: 'shred' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown action' });
    expect(await fs.readFile(notesPath(), 'utf-8')).toBe(raw);
  });

  it('answers 404 for a note that is not there', async () => {
    for (const body of [{ text: 'x' }, { action: 'take-down' }, { action: 'repost' }]) {
      const res = await patch('missing', body);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'That note is no longer here.' });
    }
  });

  it("refuses a bad field with the server's own words", async () => {
    const res = await patch('a', { text: '' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Write something first.' });
  });

  it('refuses a body that is not an object', async () => {
    const res = await patch('a', ['take-down']);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Expected an object' });
  });

  it('needs a signed-in session', async () => {
    vi.mocked(requireSession).mockRejectedValueOnce(new Response(null, { status: 401 }));
    expect((await patch('a', { action: 'take-down' })).status).toBe(401);
    expect(isLive(byId((await saved()).notes, 'a'), new Date())).toBe(true);
  });
});

describe('DELETE /api/notes/[noteId]', () => {
  it('removes the note for good and answers the rest of the board', async () => {
    const res = await remove('b');
    expect(res.status).toBe(200);
    expect((await res.json()).notes.map((n: Note) => n.id)).toEqual(['a', 'gone']);
    expect((await saved()).notes.map((n) => n.id)).toEqual(['a', 'gone']);
  });

  it('answers 404 for a note that is not there', async () => {
    const res = await remove('missing');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'That note is no longer here.' });
  });

  it('needs a signed-in session', async () => {
    vi.mocked(requireSession).mockRejectedValueOnce(new Response(null, { status: 401 }));
    expect((await remove('a')).status).toBe(401);
    expect((await saved()).notes).toHaveLength(3);
  });
});
