import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
  // A phone or the editor unless a test says the wall is asking.
  hasEditorSession: vi.fn(async () => true),
}));
vi.mock('@/lib/config', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/config')>()),
  readConfig: vi.fn(),
}));

import { GET, POST } from '../route';
import { hasEditorSession, requireDisplayAuth, requireSession } from '@/lib/auth';
import { readConfig } from '@/lib/config';
import { WALL_DRAWING_CAP } from '@/lib/note-drawing';
import { isLive } from '@/lib/notes-rules';
import { resetWallAdded, wallMayUndo } from '@/lib/wall-added';
import { resetMadeRoom, takeMadeRoom } from '@/lib/notes-made-room';
import type { ScreenConfiguration } from '@/types/config';
import { NOTES_LIMITS, type Note, type NoteDrawing, type NotesData } from '@/types/notes';

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

const HOUSE: NoteDrawing = { lines: [{ c: 'ink', w: 0, p: [100, 600, 100, 300, 400, 300, 400, 600] }, { c: 'red', w: 1, p: [80, 310, 250, 120, 420, 310] }] };

function configWith(...modules: Array<{ type: string; config: Record<string, unknown>; enabled?: boolean }>): ScreenConfiguration {
  return {
    version: 21,
    settings: {},
    screens: [{ id: 's', name: 'S', modules: modules.map((m, i) => ({ id: `m${i}`, position: { x: 0, y: 0 }, size: { w: 1, h: 1 }, style: {}, ...m })) }],
  } as unknown as ScreenConfiguration;
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
  // A Notes card with drawing on, unless a test says otherwise.
  vi.mocked(readConfig).mockResolvedValue(configWith({ type: 'notes', config: { view: 'board', wallDraw: true } }));
  resetMadeRoom();
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
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Someone in this selection was removed. Refresh and choose again.', code: 'family.memberRemoved', reason: 'member' });
    await expect(fs.access(notesPath())).rejects.toThrow();
  });

  it('refuses an author that is not an id', async () => {
    const res = await post({ text: 'x', authorId: 7 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'The author must be a family member.', code: 'notes.badAuthor' });
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

  it("refuses an empty note with a code and the server's own words, and writes nothing", async () => {
    const res = await post({ text: '   ' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Write something first.', code: 'notes.textRequired' });
    await expect(fs.access(notesPath())).rejects.toThrow();
  });

  it('refuses a bad life or flag with its reason', async () => {
    expect(await (await post({ text: 'x', life: 'forever' })).json()).toEqual({ error: 'Pick how long the note should stay.', code: 'notes.badLife' });
    expect(await (await post({ text: 'x', pinned: 'yes' })).json()).toEqual({ error: 'Pinned and important must be on or off.', code: 'notes.badRequest' });
  });

  it('refuses a full board of live notes with 409', async () => {
    await seed({ notes: Array.from({ length: NOTES_LIMITS.maxNotes }, (_, i) => note(`n${i}`)) });
    const res = await post({ text: 'One too many' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'The board is full: 200 notes. Take some down first.', code: 'notes.boardFull', params: { max: 200 } });
    expect((await saved()).notes).toHaveLength(NOTES_LIMITS.maxNotes);
  });

  it('needs the display guard at least', async () => {
    vi.mocked(requireDisplayAuth).mockRejectedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    const res = await post({ text: 'From nowhere' });
    expect(res.status).toBe(401);
    await expect(fs.access(notesPath())).rejects.toThrow();
  });

  it('posts a drawing in place of words for a signed-in person', async () => {
    const res = await post({ drawing: HOUSE, authorId: 'mom', pinned: true, life: 'keep' });
    expect(res.status).toBe(200);
    expect((await res.json()).created).toMatchObject({ text: '', drawing: HOUSE, authorId: 'mom', pinned: true, life: 'keep' });
  });

  it('keeps the cap of drawings for a signed-in caller too, as on a hub with no password', async () => {
    await seed({ notes: Array.from({ length: WALL_DRAWING_CAP }, (_, i) => note(`d${i}`, { text: '', drawing: HOUSE, createdAt: fromNow(-(i + 1) * HOUR) })) });
    expect((await post({ drawing: HOUSE })).status).toBe(200);
    const now = new Date();
    const live = (await saved()).notes.filter((n) => isLive(n, now));
    expect(live).toHaveLength(WALL_DRAWING_CAP);
    expect(live.map((n) => n.id)).not.toContain(`d${WALL_DRAWING_CAP - 1}`);
    // The answer says one came down, and the hub remembers which for the Undo.
    const again = await (await post({ drawing: HOUSE })).json();
    expect(again.madeRoom).toBe(1);
    expect(takeMadeRoom(again.created.id).map((t) => t.id)).toEqual([`d${WALL_DRAWING_CAP - 2}`]);
    // Typed notes never take a drawing down.
    expect((await post({ text: 'Words' })).status).toBe(200);
    expect((await saved()).notes.filter((n) => isLive(n, new Date()))).toHaveLength(WALL_DRAWING_CAP + 1);
  });

  it('takes a drawing from nobody while every Notes card has drawing off, password or not', async () => {
    vi.mocked(readConfig).mockResolvedValue(configWith({ type: 'notes', config: { view: 'board' } }));
    const res = await post({ drawing: HOUSE });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'notes.wallDrawOff' });
    // Words are not a drawing: the phone still posts.
    expect((await post({ text: 'Words' })).status).toBe(200);
  });

  it('refuses words and a drawing together, and a drawing that is not one', async () => {
    expect(await (await post({ text: 'Hello', drawing: HOUSE })).json()).toMatchObject({ code: 'notes.badRequest' });
    for (const drawing of [{}, { lines: [] }, { lines: [{ c: 'gold', w: 0, p: [1, 1] }] }, { lines: [{ c: 'ink', w: 0, p: [1, 9999] }] }]) {
      const res = await post({ drawing });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'That drawing could not be saved.', code: 'notes.badDrawing' });
    }
    await expect(fs.access(notesPath())).rejects.toThrow();
  });
});

describe('POST /api/notes from a wall', () => {
  const noSession = () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  beforeEach(() => {
    resetWallAdded();
    vi.mocked(hasEditorSession).mockResolvedValue(false);
    vi.mocked(requireSession).mockRejectedValue(noSession());
    vi.mocked(readConfig).mockResolvedValue(configWith({ type: 'notes', config: { view: 'board', wallDraw: true } }));
  });
  afterEach(() => {
    vi.mocked(hasEditorSession).mockResolvedValue(true);
    vi.mocked(requireSession).mockResolvedValue(undefined);
  });

  it('posts a drawing with who drew it and how long it stays, and remembers it for Undo', async () => {
    const res = await post({ drawing: HOUSE, authorId: 'dad', life: '3d' });
    expect(res.status).toBe(200);
    const { created } = await res.json();
    expect(created).toMatchObject({ text: '', drawing: HOUSE, authorId: 'dad', life: '3d', pinned: false, important: false });
    expect(wallMayUndo(created.id)).toBe(true);
  });

  it('takes no words, pin, important or "keep" from a wall', async () => {
    for (const body of [{ text: 'From the wall' }, { drawing: HOUSE, text: '' }, { drawing: HOUSE, pinned: true }, { drawing: HOUSE, important: true }]) {
      expect((await post(body)).status).toBe(401);
    }
    const kept = await post({ drawing: HOUSE, life: 'keep' });
    expect(kept.status).toBe(400);
    expect(await kept.json()).toMatchObject({ code: 'notes.badLife' });
    await expect(fs.access(notesPath())).rejects.toThrow();
  });

  it('refuses while no Notes card on a wall offers drawing', async () => {
    for (const config of [
      configWith(),
      configWith({ type: 'notes', config: { view: 'board' } }),
      configWith({ type: 'notes', config: { view: 'ticker', wallDraw: true } }),
      configWith({ type: 'notes', config: { view: 'board', wallDraw: true }, enabled: false }),
    ]) {
      vi.mocked(readConfig).mockResolvedValue(config);
      const res = await post({ drawing: HOUSE });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'Drawing on the wall is turned off', code: 'notes.wallDrawOff' });
    }
    await expect(fs.access(notesPath())).rejects.toThrow();
  });

  it('takes down the oldest drawing that is not pinned once the wall has its fill', async () => {
    const drawn = (id: string, hoursAgo: number, overrides: Partial<Note> = {}) => note(id, { text: '', drawing: HOUSE, createdAt: fromNow(-hoursAgo * HOUR), ...overrides });
    await seed({ notes: [
      drawn('oldest-pinned', 20, { pinned: true }),
      drawn('oldest', 19),
      ...Array.from({ length: WALL_DRAWING_CAP - 2 }, (_, i) => drawn(`d${i}`, i + 1)),
      note('words', { createdAt: fromNow(-22 * HOUR) }),
    ] });
    const res = await post({ drawing: HOUSE });
    expect(res.status).toBe(200);
    const now = new Date();
    const live = (await saved()).notes.filter((n) => isLive(n, now));
    expect(live.filter((n) => n.drawing)).toHaveLength(WALL_DRAWING_CAP);
    expect(live.map((n) => n.id)).not.toContain('oldest');
    // Pinned drawings and typed notes are never the ones to go.
    expect(live.map((n) => n.id)).toEqual(expect.arrayContaining(['oldest-pinned', 'words']));
    // Taken down, not deleted: the phone can put it back.
    expect((await saved()).notes.map((n) => n.id)).toContain('oldest');
  });
});
