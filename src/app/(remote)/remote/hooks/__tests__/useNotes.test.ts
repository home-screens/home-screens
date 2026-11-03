// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createNote, deleteNote, takeDown, updateNote } from '@/lib/notes-actions';
import { NotesError } from '@/lib/notes-errors';
import { refusalBody } from '@/lib/refusal';
import type { Note, NotesData } from '@/types/notes';

// A dictionary in miniature: one refusal in German, everything else its key.
const translate = (key: string, vars?: Record<string, string | number>) =>
  key === 'refusals.notes.boardFull' ? `Die Pinnwand ist voll: ${vars?.max} Notizen.` : key;
vi.mock('@/i18n', () => ({ useTranslate: () => translate }));
const showToast = vi.fn();
vi.mock('../../remote-toast', () => ({ showToast: (...args: unknown[]) => showToast(...args) }));

import { useNotes } from '../useNotes';

const NOW = new Date('2026-11-03T12:00:00.000Z');

function note(id: string, text: string, fields: Partial<Note> = {}): Note {
  const posted = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();
  return {
    id, text, pinned: false, important: false, life: '1d', createdAt: posted, updatedAt: posted,
    expiresAt: new Date(NOW.getTime() + 23 * 60 * 60 * 1000).toISOString(), ...fields,
  };
}

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** A hub in miniature: the real board actions over an in-memory file. */
let board: NotesData;
let refuseNext: Record<string, unknown> | null;
let writes: Array<{ method: string; url: string; body?: Record<string, unknown> }>;
/** When set, every write waits here until released, in order. */
let held: Array<() => void> | null;

function answer(url: string, method: string, body: Record<string, unknown> | undefined) {
  if (refuseNext) {
    const refusal = refuseNext;
    refuseNext = null;
    return reply(409, refusal);
  }
  const now = new Date();
  try {
    if (method === 'POST') {
      const result = createNote(board, body as never, now);
      board = result.data;
      return reply(200, { notes: board.notes, created: result.note });
    }
    const id = decodeURIComponent(url.split('/').pop() ?? '');
    if (method === 'DELETE') board = deleteNote(board, id);
    else if (body?.action === 'take-down') board = takeDown(board, id, now);
    else board = updateNote(board, id, body as never, now);
    return reply(200, { notes: board.notes });
  } catch (e) {
    return reply(e instanceof NotesError ? e.status : 500, e instanceof NotesError ? refusalBody(e) : { error: (e as Error).message });
  }
}

function fakeHub(url: string, init?: RequestInit) {
  const method = init?.method ?? 'GET';
  if (method === 'GET') return Promise.resolve(reply(200, { notes: board.notes }));
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined;
  writes.push({ method, url, body });
  if (held) return new Promise((resolve) => { held!.push(() => resolve(answer(url, method, body))); });
  return Promise.resolve(answer(url, method, body));
}

async function mounted() {
  const view = renderHook(() => useNotes());
  await waitFor(() => expect(view.result.current.loaded).toBe(true));
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(fakeHub));
  board = { notes: [note('plain', 'Pizza is in the fridge'), note('pinned', 'Grandma visits', { pinned: true })] };
  refuseNext = null;
  writes = [];
  held = null;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useNotes', () => {
  it('loads every note and keeps the clock moving with each change', async () => {
    const { result } = await mounted();
    expect(result.current.notes.map((n) => n.id)).toEqual(['plain', 'pinned']);
    const before = result.current.now;
    await act(async () => { result.current.takeDown('plain'); });
    await waitFor(() => expect(result.current.now).not.toBe(before));
    expect(writes).toEqual([{ method: 'PATCH', url: '/api/notes/plain', body: { action: 'take-down' } }]);
    expect(board.notes.find((n) => n.id === 'plain')?.expiresAt).not.toBeNull();
  });

  it('shows a posted note at once and sends a change to it under the id the hub gave it', async () => {
    const { result } = await mounted();
    held = [];
    let posted!: Promise<boolean>;
    act(() => { posted = result.current.post({ text: 'Soccer moved', life: '1d', pinned: false, important: false }); });
    const temp = result.current.notes.find((n) => n.text === 'Soccer moved');
    expect(temp?.id.startsWith('tmp-')).toBe(true);
    expect(result.current.findNote(temp!.id)?.text).toBe('Soccer moved');
    // The post goes out on its own; the hub holds it.
    await act(async () => {});
    expect(writes).toHaveLength(1);

    // Pinned before the hub has answered the post: queued behind it.
    act(() => { result.current.update(temp!.id, { pinned: true }); });
    expect(result.current.notes.find((n) => n.text === 'Soccer moved')?.pinned).toBe(true);
    await act(async () => {});
    expect(writes).toHaveLength(1);

    await act(async () => { held!.shift()?.(); });
    await act(async () => { expect(await posted).toBe(true); });
    await waitFor(() => expect(writes).toHaveLength(2));
    const real = board.notes.find((n) => n.text === 'Soccer moved')!;
    expect(writes[1]).toEqual({ method: 'PATCH', url: `/api/notes/${real.id}`, body: { pinned: true } });
    await act(async () => { held!.shift()?.(); });
    await waitFor(() => expect(result.current.notes.find((n) => n.id === real.id)?.pinned).toBe(true));
    // The sheet opened on the temp id still finds the note.
    expect(result.current.findNote(temp!.id)?.id).toBe(real.id);
  });

  it('refuses a blank note before asking the hub', async () => {
    const { result } = await mounted();
    let posted!: Promise<boolean>;
    act(() => { posted = result.current.post({ text: '   ', life: '1d', pinned: false, important: false }); });
    expect(await posted).toBe(false);
    expect(writes).toEqual([]);
    expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error');
    expect(result.current.notes).toHaveLength(2);
  });

  it('puts a change back, shows the refusal in the family\'s language and reads the board again when a write is refused', async () => {
    const { result } = await mounted();
    refuseNext = { error: 'The board is full: 200 notes. Take some down first.', code: 'notes.boardFull', params: { max: 200 } };
    act(() => { result.current.remove('plain'); });
    expect(result.current.notes.map((n) => n.id)).toEqual(['pinned']);
    // The hub's English never reaches the toast: the code does, phrased here.
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Die Pinnwand ist voll: 200 Notizen.', 'error'));
    expect(showToast).not.toHaveBeenCalledWith('The board is full: 200 notes. Take some down first.', 'error');
    await waitFor(() => expect(result.current.notes.map((n) => n.id)).toEqual(['plain', 'pinned']));
    const reads = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([, init]) => !(init as RequestInit | undefined)?.method);
    expect(reads).toHaveLength(2);
  });

  it('keeps a pending change on top of a poll that answered without it', async () => {
    vi.useFakeTimers();
    try {
      const view = renderHook(() => useNotes());
      await act(async () => {});
      expect(view.result.current.loaded).toBe(true);
      held = [];
      act(() => { view.result.current.update('plain', { important: true }); });
      expect(view.result.current.notes.find((n) => n.id === 'plain')?.important).toBe(true);
      // The poll fires while the write is out; its copy does not have the flag.
      await act(async () => { vi.advanceTimersByTime(5_000); });
      expect(view.result.current.notes.find((n) => n.id === 'plain')?.important).toBe(true);
      await act(async () => { held!.shift()?.(); });
      expect(view.result.current.notes.find((n) => n.id === 'plain')?.important).toBe(true);
      expect(board.notes.find((n) => n.id === 'plain')?.important).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
