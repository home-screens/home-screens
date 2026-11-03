// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ChoreCompletion, ChoreDefinition } from '@/types/config';

/**
 * The lists behind the phone's Today view: a tick shows at once, the hub's
 * answer replaces it, and a refusal or a hub out of reach takes it off again
 * with a word under the row.
 */

type Reply = { ok: boolean; status: number; json: () => Promise<unknown> };
const reply = (status: number, body: unknown): Reply => ({ ok: status >= 200 && status < 300, status, json: async () => body });

let read: unknown = { completions: [] };
let nextWrite: (() => Promise<Reply>) | null = null;
const writes: Array<{ url: string; body: Record<string, unknown> }> = [];

vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      writes.push({ url, body: JSON.parse(String(init.body)) });
      if (!nextWrite) throw new Error('no answer prepared');
      return nextWrite();
    }
    return reply(200, read);
  }),
  isSessionExpired: (e: unknown) => e instanceof Error && e.message === 'Session expired',
}));

const { useChoreMarks } = await import('../useChoreMarks');

const DAY = '2026-11-03';
const chores: ChoreDefinition[] = [{
  id: 'dishes', name: 'Dishes', emoji: '', points: 2, frequency: 'daily',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime', assigneeIds: ['ada'], rotation: 'fixed',
}];
const row = { choreId: 'dishes', memberId: 'ada', date: DAY };
const ticked: ChoreCompletion[] = [{ choreId: 'dishes', memberId: 'ada', date: DAY }];

const onWarning = vi.fn();
const onPoll = vi.fn();
const words = {
  failed: "That didn't save",
  refusal: vi.fn((refused: { reason: string; memberId?: string }) => (refused.reason === 'limit' ? null : `${refused.memberId} has it`)),
};

function mount() {
  return renderHook(() => useChoreMarks({
    url: '/api/chores?chores=1',
    chores,
    today: DAY,
    before: () => 'stamp',
    onPoll,
    onWarning,
    words,
  }));
}

/** A write held open until the test lets it through, to look at the screen meanwhile. */
function holdWrite(): (answer: Reply) => void {
  let release!: (answer: Reply) => void;
  nextWrite = () => new Promise<Reply>((resolve) => { release = resolve; });
  return (answer) => release(answer);
}

beforeEach(() => {
  read = { completions: [] };
  nextWrite = null;
  writes.length = 0;
  onWarning.mockClear();
  onPoll.mockClear();
  words.refusal.mockClear();
});
afterEach(cleanup);

describe('the read', () => {
  it('takes the lists and hands the rest of the answer to the surface with what it read before', async () => {
    read = { completions: ticked, grabs: [], bonusResets: {}, today: DAY, choresRevision: 'r2' };
    const { result } = mount();
    await waitFor(() => expect(result.current.completions).toEqual(ticked));
    expect(onPoll).toHaveBeenCalledWith(expect.objectContaining({ today: DAY, choresRevision: 'r2' }), 'stamp');
  });
});

describe('a tick', () => {
  it('shows at once, says which way it meant, and takes the lists the hub answers with', async () => {
    const { result } = mount();
    await act(async () => {});
    const release = holdWrite();

    let outcome: Promise<unknown>;
    act(() => { outcome = result.current.toggle(row); });
    expect(result.current.completions).toMatchObject([{ choreId: 'dishes', memberId: 'ada', date: DAY }]);
    expect(result.current.busy.has(`dishes-ada-${DAY}`)).toBe(true);
    expect(writes).toEqual([{ url: '/api/chores', body: { ...row, direction: 'complete' } }]);

    const fromHub = [{ ...ticked[0], at: '2026-11-03T10:00:00.000Z' }];
    await act(async () => { release(reply(200, { completions: fromHub, grabs: [], changed: true })); await outcome; });
    expect(result.current.completions).toEqual(fromHub);
    expect(result.current.busy.size).toBe(0);
    expect(result.current.rowNotice).toBeNull();
  });

  it('un-ticks a chore that is already done', async () => {
    read = { completions: ticked };
    const { result } = mount();
    await waitFor(() => expect(result.current.completions).toEqual(ticked));
    nextWrite = async () => reply(200, { completions: [] });

    await act(async () => { await result.current.toggle(row); });
    expect(writes[0].body).toMatchObject({ direction: 'uncomplete' });
    expect(result.current.completions).toEqual([]);
  });

  it('on a refusal, says who has it under the row and shows where the lists stand', async () => {
    const { result } = mount();
    await act(async () => {});
    const theirs = [{ choreId: 'dishes', memberId: 'bram', date: DAY }];
    nextWrite = async () => reply(409, { reason: 'grabbed', memberId: 'bram', completions: [], grabs: theirs });

    await act(async () => { await result.current.toggle(row); });
    expect(result.current.rowNotice).toEqual({ ...row, text: 'bram has it' });
    expect(result.current.completions).toEqual([]);
    expect(result.current.grabs).toEqual(theirs);
    expect(result.current.busy.size).toBe(0);
  });

  it('a refusal without lists takes the tick off again', async () => {
    const { result } = mount();
    await act(async () => {});
    nextWrite = async () => reply(409, { reason: 'taken', memberId: 'bram' });

    await act(async () => { await result.current.toggle(row); });
    expect(result.current.completions).toEqual([]);
    expect(result.current.rowNotice?.text).toBe('bram has it');
  });

  it('a quiet refusal shows the lists and says nothing', async () => {
    const { result } = mount();
    await act(async () => {});
    nextWrite = async () => reply(409, { reason: 'limit', completions: [], grabs: [] });

    await act(async () => { await result.current.toggle(row); });
    expect(result.current.rowNotice).toBeNull();
  });

  it('with the hub out of reach, takes the tick off again with a word under the row', async () => {
    const { result } = mount();
    await act(async () => {});
    nextWrite = async () => { throw new Error('Load failed'); };

    let outcome: unknown;
    await act(async () => { outcome = await result.current.toggle(row); });
    expect(outcome).toMatchObject({ ok: false, refused: false });
    expect(result.current.completions).toEqual([]);
    expect(result.current.rowNotice).toEqual({ ...row, text: "That didn't save" });
    expect(result.current.busy.size).toBe(0);
  });

  it('an expired session takes the tick off without a word: sign-in is on its way', async () => {
    const { result } = mount();
    await act(async () => {});
    nextWrite = async () => { throw new Error('Session expired'); };

    await act(async () => { await result.current.toggle(row); });
    expect(result.current.completions).toEqual([]);
    expect(result.current.rowNotice).toBeNull();
  });

  it('a tick that lands takes down the word left by one that did not', async () => {
    const { result } = mount();
    await act(async () => {});
    nextWrite = async () => { throw new Error('Load failed'); };
    await act(async () => { await result.current.toggle(row); });
    expect(result.current.rowNotice).not.toBeNull();

    nextWrite = async () => reply(200, { completions: ticked });
    await act(async () => { await result.current.toggle(row); });
    expect(result.current.rowNotice).toBeNull();
  });
});

describe('the other writes', () => {
  const grab = { kind: 'grab' as const, choreId: 'garage', memberId: 'ada', action: 'grab' as const };
  const garageRow = { choreId: 'garage', memberId: 'ada', date: DAY };

  it('shows nothing until the hub answers, then its lists', async () => {
    const { result } = mount();
    await act(async () => {});
    const release = holdWrite();

    let outcome: Promise<unknown>;
    act(() => { outcome = result.current.write(grab, garageRow); });
    expect(result.current.grabs).toEqual([]);
    expect(result.current.busy.has('bonus-garage')).toBe(true);

    const held = [{ choreId: 'garage', memberId: 'ada', date: DAY }];
    await act(async () => { release(reply(200, { completions: [], grabs: held })); await outcome; });
    expect(result.current.grabs).toEqual(held);
    expect(result.current.busy.size).toBe(0);
  });

  it('says a refusal with a reason under the row', async () => {
    const { result } = mount();
    await act(async () => {});
    nextWrite = async () => reply(409, { reason: 'grabbed', memberId: 'bram', completions: [], grabs: [] });

    await act(async () => { await result.current.write(grab, garageRow); });
    expect(result.current.rowNotice).toEqual({ ...garageRow, text: 'bram has it' });
    expect(onWarning).not.toHaveBeenCalled();
  });

  it('sends any other failure to the banner', async () => {
    const { result } = mount();
    await act(async () => {});
    nextWrite = async () => reply(500, null);
    await act(async () => { await result.current.write({ kind: 'put-back', choreId: 'garage' }, garageRow); });

    nextWrite = async () => { throw new Error('Load failed'); };
    await act(async () => { await result.current.write({ kind: 'skip', choreId: 'dishes', memberIds: ['ada'], date: DAY, skipped: true }, row); });

    expect(onWarning).toHaveBeenCalledTimes(2);
    expect(onWarning).toHaveBeenCalledWith("That didn't save");
    expect(result.current.rowNotice).toBeNull();
  });

  it('marks the person\'s own row busy for a "not today"', async () => {
    const { result } = mount();
    await act(async () => {});
    const release = holdWrite();
    let outcome: Promise<unknown>;
    act(() => { outcome = result.current.write({ kind: 'skip', choreId: 'dishes', memberIds: ['ada', 'bram'], date: DAY, skipped: true }, row); });
    expect(result.current.busy.has(`dishes-ada-${DAY}`)).toBe(true);
    await act(async () => { release(reply(200, { completions: [] })); await outcome; });
  });
});
