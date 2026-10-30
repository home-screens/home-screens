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
import { addIsoDays } from '@/lib/day-notes';
import { isoDateInTZ } from '@/lib/timezone';
import { DAY_NOTES_LIMITS, type DayNote } from '@/types/day-notes';

let root: string;
const notesPath = () => path.join(root, 'data', 'day-notes.json');
const seed = (notes: DayNote[]) => fs.writeFile(notesPath(), JSON.stringify({ notes }));
const saved = async () => (JSON.parse(await fs.readFile(notesPath(), 'utf-8')) as { notes: DayNote[] }).notes;
const today = () => isoDateInTZ(new Date());
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const patch = (id: string, body: unknown) => PATCH(new NextRequest(`http://localhost/api/day-notes/${id}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), ctx(id));
const del = (id: string) => DELETE(new NextRequest(`http://localhost/api/day-notes/${id}`, { method: 'DELETE' }), ctx(id));

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-day-notes-id-route-'));
  await fs.mkdir(path.join(root, 'data'));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe('PATCH /api/day-notes/[id]', () => {
  it('changes one note and leaves the others on that day alone', async () => {
    const day = addIsoDays(today(), 1);
    await seed([{ id: 'a', date: day, text: 'Pajama day' }, { id: 'b', date: day, text: 'Library books' }]);
    const res = await patch('a', { text: 'Pajama day, wear red' });
    expect(res.status).toBe(200);
    expect((await res.json()).notes.map((n: DayNote) => n.text)).toEqual(['Pajama day, wear red', 'Library books']);
  });

  it('removes the note when its words are emptied', async () => {
    await seed([{ id: 'a', date: today(), text: 'Pajama day' }]);
    expect((await (await patch('a', { text: ' ' })).json()).notes).toEqual([]);
  });

  it('answers 404 for a note that is gone, and 400 for words past the cap or a note on a day that is over', async () => {
    await seed([{ id: 'past', date: addIsoDays(today(), -1), text: 'Yesterday' }, { id: 'a', date: today(), text: 'Today' }]);
    expect((await patch('nope', { text: 'x' })).status).toBe(404);
    expect((await patch('a', { text: 'a'.repeat(DAY_NOTES_LIMITS.maxTextLength + 1) })).status).toBe(400);
    expect((await patch('past', { text: 'Changed' })).status).toBe(400);
  });

  it('is a write only a signed-in phone may make', async () => {
    await seed([{ id: 'a', date: today(), text: 'Today' }]);
    vi.mocked(requireSession).mockRejectedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    expect((await patch('a', { text: 'Sneaky' })).status).toBe(401);
    expect((await saved())[0].text).toBe('Today');
  });
});

describe('DELETE /api/day-notes/[id]', () => {
  it('removes one note and keeps the rest', async () => {
    await seed([{ id: 'a', date: today(), text: 'One' }, { id: 'b', date: today(), text: 'Two' }]);
    const res = await del('a');
    expect(res.status).toBe(200);
    expect((await res.json()).notes.map((n: DayNote) => n.id)).toEqual(['b']);
  });

  it('answers the notes unchanged for a note already gone, so a retried tap is harmless', async () => {
    await seed([{ id: 'a', date: today(), text: 'One' }]);
    expect((await (await del('gone')).json()).notes.map((n: DayNote) => n.id)).toEqual(['a']);
  });

  it('is a write only a signed-in phone may make', async () => {
    await seed([{ id: 'a', date: today(), text: 'One' }]);
    vi.mocked(requireSession).mockRejectedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    expect((await del('a')).status).toBe(401);
    expect(await saved()).toHaveLength(1);
  });
});
