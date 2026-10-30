// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

const translate = (key: string) => key;
vi.mock('@/i18n', () => ({ useTranslate: () => translate }));
const showToast = vi.fn();
vi.mock('../../remote-toast', () => ({ showToast: (...args: unknown[]) => showToast(...args) }));

import { useDayNotesData } from '../useDayNotesData';
import type { DayNote } from '@/types/day-notes';

const TODAY = '2026-10-30';
const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
const refused = (status: number, error: string) => ({ ok: false, status, json: async () => ({ error }) });

/** A hand-held answer: the test decides when the hub replies. */
function deferred() {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

function writes(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .filter(([, opts]) => (opts as RequestInit | undefined)?.method)
    .map(([url, opts]) => ({ method: (opts as RequestInit).method, url, body: (opts as RequestInit).body && JSON.parse((opts as RequestInit).body as string) }));
}

async function loaded(fetchMock: ReturnType<typeof vi.fn>, notes: DayNote[] = []) {
  fetchMock.mockResolvedValueOnce(ok({ notes }));
  vi.stubGlobal('fetch', fetchMock);
  const view = renderHook(() => useDayNotesData());
  await waitFor(() => expect(view.result.current.loaded).toBe(true));
  return view;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useDayNotesData', () => {
  it('shows a new note at once and sends a change to it under the id the hub gave it', async () => {
    const fetchMock = vi.fn();
    const { result } = await loaded(fetchMock);
    const post = deferred();
    fetchMock.mockReturnValueOnce(post.promise);

    let added!: Promise<boolean>;
    act(() => { added = result.current.add('2026-10-31', 'Picture day', TODAY); });
    const temp = result.current.notes[0];
    expect(temp).toMatchObject({ date: '2026-10-31', text: 'Picture day' });
    expect(result.current.resolveId(temp.id)).toBe(temp.id);

    // Changed before the hub has answered the add: queued behind it.
    const real = { id: 'srv-1', date: '2026-10-31', text: 'Picture day' };
    fetchMock.mockResolvedValueOnce(ok({ notes: [{ ...real, text: 'Picture day, wear blue' }] }));
    let changed!: Promise<boolean>;
    act(() => { changed = result.current.update(temp.id, 'Picture day, wear blue', TODAY); });
    expect(result.current.notes.map((n) => n.text)).toEqual(['Picture day, wear blue']);

    await act(async () => {
      post.resolve(ok({ notes: [real], created: real }));
      expect(await added).toBe(true);
      expect(await changed).toBe(true);
    });

    expect(result.current.resolveId(temp.id)).toBe('srv-1');
    expect(writes(fetchMock)).toEqual([
      { method: 'POST', url: '/api/day-notes', body: { date: '2026-10-31', text: 'Picture day' } },
      { method: 'PATCH', url: '/api/day-notes/srv-1', body: { text: 'Picture day, wear blue' } },
    ]);
    expect(result.current.notes).toEqual([{ ...real, text: 'Picture day, wear blue' }]);
  });

  it('refuses a fourth note on a day before asking the hub', async () => {
    const fetchMock = vi.fn();
    const day = [1, 2, 3].map((n) => ({ id: `n${n}`, date: TODAY, text: `Note ${n}` }));
    const { result } = await loaded(fetchMock, day);

    let saved!: Promise<boolean>;
    act(() => { saved = result.current.add(TODAY, 'One more', TODAY); });
    expect(await saved).toBe(false);
    expect(writes(fetchMock)).toEqual([]);
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/3 notes/), 'error');
    expect(result.current.notes).toHaveLength(3);
  });

  it('puts a note back and shows the hub\'s words when a remove is refused', async () => {
    const fetchMock = vi.fn();
    const note = { id: 'n1', date: TODAY, text: 'Library books' };
    const { result } = await loaded(fetchMock, [note]);
    fetchMock
      .mockResolvedValueOnce(refused(500, 'Disk full'))
      .mockResolvedValueOnce(ok({ notes: [note] }));

    let removed!: Promise<boolean>;
    act(() => { removed = result.current.remove('n1'); });
    expect(result.current.notes).toEqual([]);
    await act(async () => { expect(await removed).toBe(false); });

    expect(showToast).toHaveBeenCalledWith('Disk full', 'error');
    await waitFor(() => expect(result.current.notes).toEqual([note]));
  });
});
