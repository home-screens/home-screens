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
import { addIsoDays } from '@/lib/day-notes';
import { isoDateInTZ } from '@/lib/timezone';
import { DAY_NOTES_LIMITS, type DayNote } from '@/types/day-notes';

let root: string;
const notesPath = () => path.join(root, 'data', 'day-notes.json');
const seed = (notes: DayNote[]) => fs.writeFile(notesPath(), JSON.stringify({ notes }));
const saved = async () => (JSON.parse(await fs.readFile(notesPath(), 'utf-8')) as { notes: DayNote[] }).notes;
// No config.json here, so the household's day is the machine's.
const today = () => isoDateInTZ(new Date());
const get = (headers: Record<string, string> = {}) => GET(new NextRequest('http://localhost/api/day-notes', { headers }), undefined);
const postRaw = (body: string) => POST(new NextRequest('http://localhost/api/day-notes', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
}), undefined);
const post = (body: unknown) => postRaw(JSON.stringify(body));

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-day-notes-route-'));
  await fs.mkdir(path.join(root, 'data'));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe('GET /api/day-notes', () => {
  it('answers an empty list before anything is written', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notes: [] });
  });

  it('answers every kept note, past days included, in the order they were written', async () => {
    const notes = [{ id: 'a', date: '2020-01-01', text: 'Old' }, { id: 'b', date: '2099-11-04', text: 'Picture day' }];
    await seed(notes);
    expect(await (await get()).json()).toEqual({ notes });
  });

  it('is a read the wall may make with its display token', async () => {
    await get();
    expect(requireDisplayAuth).toHaveBeenCalled();
    expect(requireSession).not.toHaveBeenCalled();
  });

  it('answers with an ETag, a 304 to a caller holding it, and in full once the file changes', async () => {
    await seed([{ id: 'a', date: '2099-11-04', text: 'Picture day' }]);
    const etag = (await get()).headers.get('ETag');
    expect(etag).toMatch(/^"[0-9a-f]+"$/);
    const again = await get({ 'If-None-Match': etag! });
    expect(again.status).toBe(304);
    await new Promise((r) => setTimeout(r, 15));
    await seed([{ id: 'a', date: '2099-11-04', text: 'Picture day, wear blue' }]);
    const changed = await get({ 'If-None-Match': etag! });
    expect(changed.status).toBe(200);
    expect(changed.headers.get('ETag')).not.toBe(etag);
  });
});

describe('POST /api/day-notes', () => {
  it('writes a tidied note with a new id and answers every note and the one it made', async () => {
    const day = addIsoDays(today(), 2);
    const res = await post({ date: day, text: '  Picture   day ' });
    expect(res.status).toBe(200);
    const json = await res.json() as { notes: DayNote[]; created: DayNote };
    expect(json.created).toMatchObject({ date: day, text: 'Picture day' });
    expect(json.created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(json.notes).toEqual([json.created]);
    expect(await saved()).toEqual([json.created]);
  });

  it('takes a second and third note on the same day, and refuses a fourth', async () => {
    for (const text of ['One', 'Two', 'Three']) expect((await post({ date: today(), text })).status).toBe(200);
    const fourth = await post({ date: today(), text: 'Four' });
    expect(fourth.status).toBe(409);
    expect((await saved()).map((n) => n.text)).toEqual(['One', 'Two', 'Three']);
  });

  it('refuses a day that is over, a day that is not a day, empty words and words past the cap', async () => {
    for (const body of [
      { date: addIsoDays(today(), -1), text: 'Too late' },
      { date: '2026-02-30', text: 'No such day' },
      { date: today(), text: '   ' },
      { date: today(), text: 'a'.repeat(DAY_NOTES_LIMITS.maxTextLength + 1) },
      { date: today() },
    ]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(typeof (await res.json()).error).toBe('string');
    }
    await expect(fs.access(notesPath())).rejects.toThrow();
  });

  it('refuses a body that is not an object', async () => {
    expect((await post(['Picture day'])).status).toBe(400);
    expect((await postRaw('not json')).status).toBe(400);
  });

  it('tidies away notes long past while it writes', async () => {
    await seed([{ id: 'old', date: addIsoDays(today(), -DAY_NOTES_LIMITS.keepDays - 1), text: 'Long gone' }]);
    await post({ date: today(), text: 'Library books back' });
    expect((await saved()).map((n) => n.text)).toEqual(['Library books back']);
  });

  it('is a write only a signed-in phone may make', async () => {
    vi.mocked(requireSession).mockRejectedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    expect((await post({ date: today(), text: 'Sneaky' })).status).toBe(401);
    await expect(fs.access(notesPath())).rejects.toThrow();
  });
});
