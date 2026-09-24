// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TimetableData } from '@/types/timetables';

const state = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (url: string, init?: RequestInit) => state.request(url, init),
  isSessionExpired: () => false,
}));

import { useTimetableDraft, weekCycleLetters } from '../use-timetable-draft';

const SCHOOL = {
  id: 'school-1',
  name: 'Gymnasium',
  slots: [{ kind: 'period' as const, n: 1, start: '07:50', end: '08:35' }],
  weekCycle: { mode: 'off' as const },
  specialDays: [],
};

const SAVED: TimetableData = { schools: [SCHOOL], subjects: [], timetables: [] };

function reply(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function Harness() {
  const draft = useTimetableDraft({ loadFailed: 'load failed', saveFailed: 'save failed' });
  return (
    <div>
      <span data-testid="schools">{draft.data ? draft.data.schools.map((school) => school.name).join(',') : ''}</span>
      <span data-testid="subjects">{draft.data ? draft.data.subjects.map((subject) => subject.id).join(',') : ''}</span>
      <span data-testid="conflict">{draft.conflict ? 'conflict' : ''}</span>
      <span data-testid="save-error">{draft.saveError ?? ''}</span>
      <span data-testid="load-error">{draft.loadError ?? ''}</span>
      <button
        onClick={() =>
          draft.update((current) => ({
            ...current,
            subjects: [...current.subjects, { id: 'ma', code: 'Ma', name: 'Mathe', color: '#4f8ef7', icon: 'book' }],
          }))
        }
      >
        edit
      </button>
      <button
        onClick={() =>
          draft.update((current) => ({
            ...current,
            subjects: [...current.subjects, { id: 'de', code: 'De', name: 'Deutsch', color: '#f26363', icon: 'book' }],
          }))
        }
      >
        edit again
      </button>
      <button onClick={draft.flush}>close</button>
      <button onClick={() => void draft.flushNow()}>done</button>
    </div>
  );
}

/** Let the load promise settle without letting the debounce timer run. */
async function settle() {
  await act(async () => {});
}

const puts = () => state.request.mock.calls.filter(([, init]) => init?.method === 'PUT');

beforeEach(() => {
  vi.useFakeTimers();
  state.request.mockReset();
  state.request.mockResolvedValue(reply(200, { data: SAVED, revision: 'r1' }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useTimetableDraft', () => {
  it('loads once and waits out the debounce before saving an edit', async () => {
    render(<Harness />);
    await settle();
    expect(screen.getByTestId('schools').textContent).toBe('Gymnasium');

    fireEvent.click(screen.getByText('edit'));
    expect(puts()).toHaveLength(0);

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(puts()).toHaveLength(1);
    expect(JSON.parse(puts()[0][1].body)).toEqual({
      data: { ...SAVED, subjects: [{ id: 'ma', code: 'Ma', name: 'Mathe', color: '#4f8ef7', icon: 'book' }] },
      revision: 'r1',
    });
  });

  it('coalesces a run of edits into one save', async () => {
    render(<Harness />);
    await settle();

    fireEvent.click(screen.getByText('edit'));
    act(() => { vi.advanceTimersByTime(200); });
    fireEvent.click(screen.getByText('edit'));
    await act(async () => { vi.advanceTimersByTime(400); });

    expect(puts()).toHaveLength(1);
  });

  it('saves what is pending when the window closes, without waiting', async () => {
    render(<Harness />);
    await settle();

    fireEvent.click(screen.getByText('edit'));
    fireEvent.click(screen.getByText('close'));
    await settle();

    expect(puts()).toHaveLength(1);
  });

  it('adopts the saved document a conflict carries and says so', async () => {
    render(<Harness />);
    await settle();

    const theirs = { ...SAVED, schools: [{ ...SCHOOL, name: 'Grundschule' }] };
    state.request.mockResolvedValueOnce(reply(409, { error: 'Somebody else changed them', reason: 'revision', data: theirs, revision: 'r9' }));

    fireEvent.click(screen.getByText('edit'));
    await act(async () => { vi.advanceTimersByTime(400); });

    expect(screen.getByTestId('conflict').textContent).toBe('conflict');
    expect(screen.getByTestId('schools').textContent).toBe('Grundschule');

    // Adopting their document is not an edit of ours, so it must not bounce
    // straight back at the server.
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(puts()).toHaveLength(1);

    // The next real edit is saved against the revision that came back.
    fireEvent.click(screen.getByText('edit'));
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(puts()).toHaveLength(2);
    expect(JSON.parse(puts()[1][1].body).revision).toBe('r9');
  });

  it('waits for the save in the air rather than sending a second one against the same revision', async () => {
    render(<Harness />);
    await settle();

    // The autosave is still on its way back when Done is pressed.
    let land: (answer: Response) => void = () => {};
    state.request.mockImplementationOnce(() => new Promise<Response>((resolve) => { land = resolve; }));

    fireEvent.click(screen.getByText('edit'));
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(puts()).toHaveLength(1);

    fireEvent.click(screen.getByText('edit again'));
    fireEvent.click(screen.getByText('done'));
    await settle();

    // Two saves in the air means the second quotes a revision the first has
    // already replaced, and the conflict it comes back with takes the newer edit
    // with it.
    expect(puts()).toHaveLength(1);

    await act(async () => { land(reply(200, { data: SAVED, revision: 'r2' })); });
    await settle();

    expect(puts()).toHaveLength(2);
    const second = JSON.parse(puts()[1][1].body);
    expect(second.revision).toBe('r2');
    expect(second.data.subjects.map((subject: { id: string }) => subject.id)).toEqual(['ma', 'de']);
    expect(screen.getByTestId('conflict').textContent).toBe('');

    // Done's own save carried that edit, so the debounce it cancelled has
    // nothing left to send.
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(puts()).toHaveLength(2);
  });

  it('does not close over a conflict the save behind it inherited', async () => {
    render(<Harness />);
    await settle();

    let land: (answer: Response) => void = () => {};
    state.request.mockImplementationOnce(() => new Promise<Response>((resolve) => { land = resolve; }));

    fireEvent.click(screen.getByText('edit'));
    await act(async () => { vi.advanceTimersByTime(400); });

    const theirs = { ...SAVED, schools: [{ ...SCHOOL, name: 'Grundschule' }] };
    fireEvent.click(screen.getByText('done'));
    await settle();
    await act(async () => {
      land(reply(409, { error: 'Somebody else changed them', reason: 'revision', data: theirs, revision: 'r9' }));
    });
    await settle();

    // The waiting save has nothing of its own to send, since the draft on screen
    // is now theirs. What it must not do is report success and let the window
    // close over the banner.
    expect(screen.getByTestId('conflict').textContent).toBe('conflict');
    expect(screen.getByTestId('schools').textContent).toBe('Grundschule');
  });

  it('shows the refusal a failed save came with', async () => {
    render(<Harness />);
    await settle();

    state.request.mockResolvedValueOnce(reply(400, { error: 'Give the break at 09:25 a name' }));
    fireEvent.click(screen.getByText('edit'));
    await act(async () => { vi.advanceTimersByTime(400); });

    expect(screen.getByTestId('save-error').textContent).toBe('Give the break at 09:25 a name');
  });

  it('says so when the document cannot be loaded at all', async () => {
    state.request.mockReset();
    state.request.mockResolvedValue(reply(500, { error: 'boom' }));
    render(<Harness />);
    await settle();

    expect(screen.getByTestId('load-error').textContent).toBe('load failed');
    expect(screen.getByTestId('schools').textContent).toBe('');
  });
});

/**
 * The same hook against a store that behaves like the real one: it holds one
 * document and one revision, and refuses a save quoting a revision it has
 * already replaced. Counting requests says two saves did not overlap; this says
 * what the household ends up with, which is the thing that went wrong.
 */
describe('useTimetableDraft, against a store that refuses a stale revision', () => {
  function fakeStore() {
    let saved: TimetableData = SAVED;
    let revision = 'r1';
    const held: (() => void)[] = [];

    state.request.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method !== 'PUT') return Promise.resolve(reply(200, { data: saved, revision }));
      const sent = JSON.parse(init.body as string);
      // Held rather than answered, so a test can decide what is still in the air.
      return new Promise<Response>((resolve) => {
        held.push(() => {
          if (sent.revision !== revision) {
            resolve(reply(409, { error: 'Somebody else changed them', reason: 'revision', data: saved, revision }));
            return;
          }
          saved = sent.data;
          revision = `r${held.length + 1}`;
          resolve(reply(200, { data: saved, revision }));
        });
      });
    });

    return {
      /** Answer everything that is waiting, in the order it was sent. */
      land: async () => {
        while (held.length > 0) {
          held.shift()?.();
          await act(async () => {});
        }
      },
    };
  }

  it('keeps the edit made while an autosave was coming back', async () => {
    const store = fakeStore();
    render(<Harness />);
    await settle();

    fireEvent.click(screen.getByText('edit'));
    await act(async () => { vi.advanceTimersByTime(400); });

    // The autosave is still open when the second edit is made and Done pressed.
    fireEvent.click(screen.getByText('edit again'));
    fireEvent.click(screen.getByText('done'));
    await settle();

    await store.land();
    await act(async () => { vi.advanceTimersByTime(1000); });
    await store.land();

    expect(screen.getByTestId('subjects').textContent).toBe('ma,de');
    expect(screen.getByTestId('conflict').textContent).toBe('');
  });
});

describe('weekCycleLetters', () => {
  const PARITY = { ...SCHOOL, weekCycle: { mode: 'parity' as const, oddWeek: 'A' as const } };

  it("turns the week over at the household's midnight, not the laptop's", () => {
    // 00:30 on Monday 14 September in Berlin (ISO week 38, an even week) is
    // still Sunday of week 37 in UTC and in Chicago.
    const mondayInBerlin = new Date('2026-09-13T22:30:00Z');
    expect(weekCycleLetters(PARITY, mondayInBerlin, 'Europe/Berlin')).toEqual({ thisLetter: 'B', nextLetter: 'A' });
    expect(weekCycleLetters(PARITY, mondayInBerlin, 'America/Chicago')).toEqual({ thisLetter: 'A', nextLetter: 'B' });
  });
});
