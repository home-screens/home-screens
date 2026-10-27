// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render as renderUI, screen, within } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import { I18nProvider } from '@/i18n/provider';
import { createNote, deleteNote, repost, takeDown, updateNote } from '@/lib/notes-actions';
import { NotesError } from '@/lib/notes-errors';
import { displayCache } from '@/lib/display-cache';
import { notesUrl } from '@/lib/fetch-keys';
import { useConfirmStore } from '@/stores/confirm-store';
import type { FamilyMember } from '@/types/family';
import type { Note, NotesData } from '@/types/notes';

const state = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (url: string, init?: RequestInit) => state.request(url, init),
  isSessionExpired: () => false,
}));

const family = vi.hoisted(() => ({ members: [] as FamilyMember[] }));
vi.mock('@/hooks/useFamilyData', () => ({
  useFamilyData: () => ({ members: family.members, groups: [], revision: 'f1', loading: false, loaded: true, error: null, refresh: vi.fn() }),
}));

import NotesBoardModal from '../NotesBoardModal';

const NOW = new Date('2026-10-26T15:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function person(id: string, name: string, color: string): FamilyMember {
  return { id, name, color, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };
}

function note(id: string, text: string, fields: Partial<Note> & { postedHoursAgo: number; expiresInHours: number | null }): Note {
  const { postedHoursAgo, expiresInHours, ...rest } = fields;
  const posted = new Date(NOW.getTime() - postedHoursAgo * HOUR).toISOString();
  return {
    id,
    text,
    pinned: false,
    important: false,
    life: '1d',
    createdAt: posted,
    updatedAt: posted,
    expiresAt: expiresInHours === null ? null : new Date(NOW.getTime() + expiresInHours * HOUR).toISOString(),
    ...rest,
  };
}

function seedBoard(): NotesData {
  return {
    notes: [
      note('plain', 'Pizza is in the fridge', { postedHoursAgo: 1, expiresInHours: 23 }),
      note('pinned', 'Grandma visits on Friday', { authorId: 'sam', pinned: true, life: 'keep', postedHoursAgo: 3, expiresInHours: null }),
      note('important', 'Dentist at four today', { authorId: 'riley', important: true, life: '3d', postedHoursAgo: 2, expiresInHours: 70 }),
      note('old', 'Library books are due', { authorId: 'sam', postedHoursAgo: 30, expiresInHours: -6 }),
    ],
  };
}

// A hub in miniature: the real board actions over an in-memory file, so the
// modal is checked against what the routes would actually answer.
let board: NotesData;
let refuseNext: string | null;
let writes: Array<{ method: string; url: string; body?: Record<string, unknown> }>;

function reply(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function fakeHub(url: string, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? 'GET';
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined;
  if (method === 'GET') return Promise.resolve(reply(200, { notes: board.notes }));
  writes.push({ method, url, body });
  if (refuseNext) {
    const error = refuseNext;
    refuseNext = null;
    return Promise.resolve(reply(409, { error }));
  }
  const now = new Date();
  try {
    if (method === 'POST' && url === '/api/notes') {
      const result = createNote(board, body as never, now);
      board = result.data;
      return Promise.resolve(reply(200, { notes: board.notes, created: result.note }));
    }
    const id = decodeURIComponent(url.split('/').pop() ?? '');
    if (method === 'DELETE') board = deleteNote(board, id);
    else if (body?.action === 'take-down') board = takeDown(board, id, now);
    else if (body?.action === 'repost') board = repost(board, id, now);
    else board = updateNote(board, id, body as never, now);
    return Promise.resolve(reply(200, { notes: board.notes }));
  } catch (e) {
    const status = e instanceof NotesError ? e.status : 500;
    return Promise.resolve(reply(status, { error: (e as Error).message }));
  }
}

/** jsdom's localStorage is non-functional under this setup; stub an in-memory one. */
function makeLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  } as Storage;
}

function render() {
  return renderUI(<NotesBoardModal onClose={() => {}} />, {
    wrapper: ({ children }) => (
      <I18nProvider locale="en-US" blob={{ core, editor }}>
        {children}
      </I18nProvider>
    ),
  });
}

async function settle() {
  for (let i = 0; i < 6; i++) await act(async () => {});
}

function rows() {
  return screen.queryAllByTestId('notes-modal-row');
}

function rowFor(text: string) {
  const row = rows().find((r) => (within(r).getByTestId('notes-modal-row-text') as HTMLTextAreaElement).value === text);
  if (!row) throw new Error(`no row for "${text}"`);
  return row;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  family.members = [person('sam', 'Sam', '#f472b6'), person('riley', 'Riley', '#60a5fa')];
  board = seedBoard();
  refuseNext = null;
  writes = [];
  state.request.mockReset();
  state.request.mockImplementation(fakeHub);
  vi.stubGlobal('localStorage', makeLocalStorage());
  displayCache.clear();
});

afterEach(() => {
  cleanup();
  useConfirmStore.setState({ open: false, resolve: null });
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('NotesBoardModal', () => {
  it('lists the notes on the wall in wall order and counts the gone ones', async () => {
    render();
    await settle();

    const texts = rows().map((r) => (within(r).getByTestId('notes-modal-row-text') as HTMLTextAreaElement).value);
    expect(texts).toEqual(['Grandma visits on Friday', 'Pizza is in the fridge', 'Dentist at four today']);
    expect(screen.getByText('3 on the wall · 1 gone')).toBeTruthy();

    const pinned = rowFor('Grandma visits on Friday');
    expect(within(pinned).getByTestId('notes-modal-row-pin').getAttribute('aria-pressed')).toBe('true');
    expect((within(pinned).getByTestId('notes-modal-row-author') as HTMLSelectElement).value).toBe('sam');
    // A kept note's picker already reads "Keep", so no time left beside it.
    expect((within(pinned).getByTestId('notes-modal-row-life') as HTMLSelectElement).value).toBe('keep');
    expect(within(pinned).getByTestId('notes-modal-row-left').textContent).toBe('');
    expect(within(rowFor('Pizza is in the fridge')).getByTestId('notes-modal-row-left').textContent).toBe('23 h left');
    expect((within(rowFor('Pizza is in the fridge')).getByTestId('notes-modal-row-author') as HTMLSelectElement).value).toBe('');
    expect(screen.queryByTestId('notes-modal-empty')).toBeNull();
  });

  it('posts a note with its author, time, pin and flag, then clears the form', async () => {
    render();
    await settle();

    const post = screen.getByTestId('notes-modal-post') as HTMLButtonElement;
    expect(post.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('notes-modal-text'), { target: { value: '  Soccer moved to Saturday  ' } });
    expect(screen.getByText('28 / 500')).toBeTruthy();
    fireEvent.change(screen.getByTestId('notes-modal-author'), { target: { value: 'riley' } });
    fireEvent.change(screen.getByTestId('notes-modal-life'), { target: { value: '3d' } });
    fireEvent.click(within(screen.getByTestId('notes-modal-pin')).getByRole('switch'));
    fireEvent.click(post);
    await settle();

    expect(writes).toEqual([{
      method: 'POST',
      url: '/api/notes',
      body: { text: 'Soccer moved to Saturday', life: '3d', pinned: true, important: false, authorId: 'riley' },
    }]);
    expect((screen.getByTestId('notes-modal-text') as HTMLTextAreaElement).value).toBe('');
    expect(within(screen.getByTestId('notes-modal-pin')).getByRole('switch').getAttribute('aria-checked')).toBe('false');
    // The author sticks, here and for the next time the modal opens.
    expect((screen.getByTestId('notes-modal-author') as HTMLSelectElement).value).toBe('riley');
    expect(window.localStorage.getItem('hs-editor-notes-author')).toBe('riley');

    // Pinned and newest, so it leads the wall.
    const first = rows()[0];
    expect((within(first).getByTestId('notes-modal-row-text') as HTMLTextAreaElement).value).toBe('Soccer moved to Saturday');
    expect(within(first).getByTestId('notes-modal-row-left').textContent).toBe('3 days left');

    // The canvas preview is handed the live board with the click.
    const cached = displayCache.peek<{ notes: Note[] }>(notesUrl());
    expect(cached?.data.notes.map((n) => n.text)).toContain('Soccer moved to Saturday');
    expect(cached?.data.notes.map((n) => n.text)).not.toContain('Library books are due');
  });

  it('posts on Ctrl+Enter and never posts a blank note', async () => {
    render();
    await settle();

    const text = screen.getByTestId('notes-modal-text');
    fireEvent.change(text, { target: { value: '   ' } });
    fireEvent.keyDown(text, { key: 'Enter', ctrlKey: true });
    await settle();
    expect(writes).toEqual([]);

    fireEvent.change(text, { target: { value: 'Bins out tonight' } });
    fireEvent.keyDown(text, { key: 'Enter', metaKey: true });
    await settle();
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toMatchObject({ text: 'Bins out tonight', life: '1d' });
    expect(writes[0].body).not.toHaveProperty('authorId');
  });

  it('saves a real text edit once, and a click through an untouched row saves nothing', async () => {
    render();
    await settle();

    const untouched = within(rowFor('Dentist at four today')).getByTestId('notes-modal-row-text');
    fireEvent.focus(untouched);
    fireEvent.blur(untouched);
    await act(async () => { vi.advanceTimersByTime(1000); });
    await settle();
    expect(writes).toEqual([]);

    const field = within(rowFor('Pizza is in the fridge')).getByTestId('notes-modal-row-text');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'Pizza and salad are in the fridge' } });
    fireEvent.blur(field);
    // Leaving the field keeps the new words; it does not snap back to the
    // copy the hub held before the save was answered.
    expect((field as HTMLTextAreaElement).value).toBe('Pizza and salad are in the fridge');
    await settle();
    await act(async () => { vi.advanceTimersByTime(1000); });
    await settle();

    expect(writes).toEqual([{ method: 'PATCH', url: '/api/notes/plain', body: { text: 'Pizza and salad are in the fridge' } }]);
    expect(board.notes.find((n) => n.id === 'plain')?.text).toBe('Pizza and salad are in the fridge');
  });

  it('pins, flags, changes the author and restarts the time from a row', async () => {
    render();
    await settle();

    const row = rowFor('Pizza is in the fridge');
    fireEvent.click(within(row).getByTestId('notes-modal-row-important'));
    await settle();
    fireEvent.change(within(rowFor('Pizza is in the fridge')).getByTestId('notes-modal-row-author'), { target: { value: 'sam' } });
    await settle();
    fireEvent.change(within(rowFor('Pizza is in the fridge')).getByTestId('notes-modal-row-life'), { target: { value: '12h' } });
    await settle();

    expect(writes.map((w) => w.body)).toEqual([{ important: true }, { authorId: 'sam' }, { life: '12h' }]);
    const after = rowFor('Pizza is in the fridge');
    expect(within(after).getByTestId('notes-modal-row-important').getAttribute('aria-pressed')).toBe('true');
    expect((within(after).getByTestId('notes-modal-row-author') as HTMLSelectElement).value).toBe('sam');
    // Counted from now, not from when it was posted an hour ago.
    expect(within(after).getByTestId('notes-modal-row-left').textContent).toBe('12 h left');

    fireEvent.change(within(after).getByTestId('notes-modal-row-author'), { target: { value: '' } });
    await settle();
    expect(writes.at(-1)?.body).toEqual({ authorId: null });
    expect(board.notes.find((n) => n.id === 'plain')?.authorId).toBeUndefined();
  });

  it('sends a pin and an unpin in the order they were clicked, even when the hub is slow', async () => {
    // Every write waits until released, so two quick clicks are both queued
    // before the first answer; a hub that answered them out of order would
    // otherwise be left holding the first click.
    const released: Array<() => void> = [];
    state.request.mockImplementation((url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') return fakeHub(url, init);
      return new Promise<Response>((resolve) => { released.push(() => { void fakeHub(url, init).then(resolve); }); });
    });
    render();
    await settle();

    const pin = () => within(rowFor('Pizza is in the fridge')).getByTestId('notes-modal-row-pin');
    fireEvent.click(pin());
    await settle();
    fireEvent.click(pin());
    await settle();
    // Only the first write has gone out; the second waits its turn.
    expect(writes.map((w) => w.body)).toEqual([]);
    released.shift()?.();
    await settle();
    expect(writes.map((w) => w.body)).toEqual([{ pinned: true }]);
    released.shift()?.();
    await settle();
    expect(writes.map((w) => w.body)).toEqual([{ pinned: true }, { pinned: false }]);
    expect(board.notes.find((n) => n.id === 'plain')?.pinned).toBe(false);
  });

  it('keeps a revert typed while the first edit is still saving', async () => {
    const released: Array<() => void> = [];
    state.request.mockImplementation((url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') return fakeHub(url, init);
      return new Promise<Response>((resolve) => { released.push(() => { void fakeHub(url, init).then(resolve); }); });
    });
    render();
    await settle();

    // The row keeps what was typed, so after the first edit it is found by its new words.
    const field = (text: string) => within(rowFor(text)).getByTestId('notes-modal-row-text');
    fireEvent.focus(field('Pizza is in the fridge'));
    fireEvent.change(field('Pizza is in the fridge'), { target: { value: 'Pizza is gone' } });
    fireEvent.blur(field('Pizza is gone'));
    await act(async () => { vi.advanceTimersByTime(1000); });
    await settle();
    // Change of heart before the hub has answered: back to the original words.
    fireEvent.focus(field('Pizza is gone'));
    fireEvent.change(field('Pizza is gone'), { target: { value: 'Pizza is in the fridge' } });
    fireEvent.blur(field('Pizza is in the fridge'));
    await act(async () => { vi.advanceTimersByTime(1000); });
    await settle();

    while (released.length) { released.shift()?.(); await settle(); }
    expect(writes.map((w) => w.body)).toEqual([{ text: 'Pizza is gone' }, { text: 'Pizza is in the fridge' }]);
    expect(board.notes.find((n) => n.id === 'plain')?.text).toBe('Pizza is in the fridge');
  });

  it('takes a note down into Gone and posts it again', async () => {
    render();
    await settle();

    fireEvent.click(within(rowFor('Dentist at four today')).getByTestId('notes-modal-take-down'));
    await settle();
    expect(writes).toEqual([{ method: 'PATCH', url: '/api/notes/important', body: { action: 'take-down' } }]);
    expect(rows()).toHaveLength(2);
    expect(screen.getByText('2 on the wall · 2 gone')).toBeTruthy();

    const toggle = screen.getByTestId('notes-modal-gone-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryAllByTestId('notes-modal-gone-row')).toHaveLength(0);
    fireEvent.click(toggle);
    const goneRows = screen.getAllByTestId('notes-modal-gone-row');
    expect(goneRows.map((r) => r.getAttribute('data-note-id'))).toEqual(['important', 'old']);

    fireEvent.click(within(goneRows[0]).getByTestId('notes-modal-repost'));
    await settle();
    expect(writes.at(-1)).toEqual({ method: 'PATCH', url: '/api/notes/important', body: { action: 'repost' } });
    expect(rows()).toHaveLength(3);
    expect(screen.getAllByTestId('notes-modal-gone-row').map((r) => r.getAttribute('data-note-id'))).toEqual(['old']);
  });

  it('deletes a gone note only after the confirm says yes', async () => {
    render();
    await settle();
    fireEvent.click(screen.getByTestId('notes-modal-gone-toggle'));

    fireEvent.click(screen.getByTestId('notes-modal-delete'));
    await settle();
    expect(useConfirmStore.getState().options.title).toBe('Delete note');
    act(() => useConfirmStore.getState().respond(false));
    await settle();
    expect(writes).toEqual([]);

    fireEvent.click(screen.getByTestId('notes-modal-delete'));
    await settle();
    act(() => useConfirmStore.getState().respond(true));
    await settle();
    expect(writes).toEqual([{ method: 'DELETE', url: '/api/notes/old' }]);
    expect(board.notes.map((n) => n.id)).not.toContain('old');
    // The last gone note went, so the folded group goes too.
    expect(screen.queryByTestId('notes-modal-gone-toggle')).toBeNull();
  });

  it('says what the hub refused, keeps the typed note and takes the board back from the hub', async () => {
    render();
    await settle();

    refuseNext = 'The board is full: 200 notes. Take some down first.';
    fireEvent.change(screen.getByTestId('notes-modal-text'), { target: { value: 'One more' } });
    fireEvent.click(screen.getByTestId('notes-modal-post'));
    await settle();

    expect(screen.getByRole('alert').textContent).toBe('The board is full: 200 notes. Take some down first.');
    expect((screen.getByTestId('notes-modal-text') as HTMLTextAreaElement).value).toBe('One more');
    // The refused write is followed by a fresh read of the whole board.
    expect(state.request.mock.calls.filter(([, init]) => !init?.method)).toHaveLength(2);

    // An optimistic pin the hub refuses is put back.
    refuseNext = 'Something went wrong';
    fireEvent.click(within(rowFor('Pizza is in the fridge')).getByTestId('notes-modal-row-pin'));
    expect(within(rowFor('Pizza is in the fridge')).getByTestId('notes-modal-row-pin').getAttribute('aria-pressed')).toBe('true');
    await settle();
    expect(within(rowFor('Pizza is in the fridge')).getByTestId('notes-modal-row-pin').getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the empty line when nothing is on the wall, and a plain error when the board cannot load', async () => {
    board = { notes: [] };
    render();
    await settle();
    expect(screen.getByTestId('notes-modal-empty').textContent).toContain('Nothing on the wall right now');
    expect(screen.getByText('Nothing on the wall · 0 gone')).toBeTruthy();
    cleanup();

    state.request.mockImplementation(() => Promise.resolve(reply(500, {})));
    render();
    await settle();
    expect(screen.getByRole('alert').textContent).toBe("Couldn't load the notes. Try closing and opening this again.");
    expect(screen.queryByTestId('notes-modal-text')).toBeNull();
  });
});
