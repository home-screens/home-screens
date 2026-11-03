import { describe, it, expect, vi } from 'vitest';
import type { ChoreDefinition } from '@/types/config';
import { ChoreSession, asChoreSnapshot, choreMarksOf, postChoreMarks, postChoreToggle } from '../chore-client';
import { DEFAULT_CHORE_SETTINGS } from '../chore-bonus';

const chore = (id: string) => ({ id, name: id, assigneeIds: [] }) as unknown as ChoreDefinition;
const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json }) as unknown as Response;
const status = (code: number, json: unknown) => ({ ok: false, status: code, json: async () => json }) as unknown as Response;
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);

describe('asChoreSnapshot', () => {
  it('accepts only a list with a revision to quote', () => {
    expect(asChoreSnapshot({ chores: [], settings: DEFAULT_CHORE_SETTINGS, revision: 'r1' })).toEqual({ chores: [], settings: DEFAULT_CHORE_SETTINGS, revision: 'r1' });
    expect(asChoreSnapshot({})).toBeNull();
    expect(asChoreSnapshot({ chores: [] })).toBeNull();
    expect(asChoreSnapshot({ chores: 'no', revision: 'r1' })).toBeNull();
  });
});

describe('ChoreSession', () => {
  /* Two edits inside one save's round trip. Sent together they would quote
   * the same revision, the second would conflict, and its newer list would be
   * replaced by the first save's answer. */
  it('sends saves in order, each quoting the revision the previous one was answered with', async () => {
    let release!: (value: Response) => void;
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }))
      .mockImplementationOnce(async (_url: string, init: RequestInit) =>
        ok({ chores: JSON.parse(init.body as string).chores, revision: 'r3' }));
    const session = new ChoreSession(fetcher, { chores: [], settings: DEFAULT_CHORE_SETTINGS, revision: 'r1' });

    const first = session.save([chore('a')], false, 'Could not save');
    const second = session.save([chore('a'), chore('b')], false, 'Could not save');
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    release(ok({ chores: [chore('a')], revision: 'r2' }));
    await expect(first).resolves.toMatchObject({ kind: 'saved', snapshot: { revision: 'r2' } });
    await expect(second).resolves.toMatchObject({ kind: 'saved', snapshot: { revision: 'r3' } });
    expect(fetcher.mock.calls.map(bodyOf).map((b) => b.revision)).toEqual(['r1', 'r2']);
    expect(bodyOf(fetcher.mock.calls[1]).chores).toHaveLength(2);
  });

  it('reports a conflict with the adopted list and drops saves queued behind it', async () => {
    const theirs = { chores: [chore('theirs')], settings: DEFAULT_CHORE_SETTINGS, revision: 'r2' };
    const fetcher = vi.fn().mockResolvedValue(status(409, { reason: 'revision', error: 'Somebody else changed the chores.', ...theirs }));
    const session = new ChoreSession(fetcher, { chores: [], settings: DEFAULT_CHORE_SETTINGS, revision: 'r1' });

    const first = session.save([chore('mine')], false, 'Could not save');
    const second = session.save([chore('mine'), chore('mine-2')], false, 'Could not save');

    await expect(first).resolves.toEqual({ kind: 'conflict', snapshot: theirs });
    await expect(second).resolves.toEqual({ kind: 'superseded' });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // A save made after the adoption quotes their revision.
    fetcher.mockResolvedValueOnce(ok({ chores: [chore('theirs'), chore('again')], revision: 'r3' }));
    await session.save([chore('theirs'), chore('again')], false, 'Could not save');
    expect(bodyOf(fetcher.mock.calls[1]).revision).toBe('r2');
  });

  it('rejects on any other failure and keeps going afterwards', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(status(500, null))
      .mockResolvedValueOnce(ok({ chores: [chore('a')], revision: 'r2' }));
    const session = new ChoreSession(fetcher, { chores: [], settings: DEFAULT_CHORE_SETTINGS, revision: 'r1' });
    await expect(session.save([chore('a')], false, 'Could not save')).rejects.toThrow('Could not save');
    await expect(session.save([chore('a')], false, 'Could not save')).resolves.toMatchObject({ kind: 'saved' });
  });

  // A phone holding an old roster was told only that the save failed, and
  // kept retrying a save the hub would never take.
  it("rejects a refusal with the hub's own words", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(status(409, { error: 'Someone in this selection was removed. Refresh and choose again.', reason: 'member' }));
    const session = new ChoreSession(fetcher, { chores: [], settings: DEFAULT_CHORE_SETTINGS, revision: 'r1' });
    await expect(session.save([chore('a')], false, 'Could not save')).rejects.toThrow('Someone in this selection was removed');
  });
});

describe('postChoreToggle', () => {
  const request = { choreId: 'dishes', memberId: 'ada', date: '2026-11-03', direction: 'complete' as const };
  const ticked = [{ choreId: 'dishes', memberId: 'ada', date: '2026-11-03' }];

  it('sends the tick to the chores route and hands back the lists the hub answered with', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(ok({ completions: ticked, grabs: [], bonusResets: {}, changed: true, rewards: { balances: { ada: 2 } } }));
    const outcome = await postChoreToggle(fetcher, request);
    expect(fetcher.mock.calls[0][0]).toBe('/api/chores');
    expect((fetcher.mock.calls[0][1] as RequestInit).method).toBe('POST');
    expect(bodyOf(fetcher.mock.calls[0])).toEqual(request);
    expect(outcome).toMatchObject({ ok: true, changed: true, answer: { completions: ticked, rewards: { balances: { ada: 2 } } } });
  });

  it('says when the hub had nothing to do', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(ok({ completions: ticked, changed: false }));
    expect(await postChoreToggle(fetcher, request)).toMatchObject({ ok: true, changed: false });
  });

  it('hands back a refusal with its reason, who got there first and where the lists stand', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(status(409, { error: 'Bram has it', reason: 'grabbed', memberId: 'bram', completions: [], grabs: [{ choreId: 'dishes', memberId: 'bram', date: '2026-11-03' }] }));
    expect(await postChoreToggle(fetcher, request)).toEqual({
      ok: false, refused: true, refusal: 'grabbed', memberId: 'bram',
      marks: { completions: [], grabs: [{ choreId: 'dishes', memberId: 'bram', date: '2026-11-03' }] },
    });
  });

  it('a refusal without lists carries none, so the screen goes back to what it had', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(status(409, { reason: 'limit' }));
    expect(await postChoreToggle(fetcher, request)).toEqual({ ok: false, refused: true, refusal: 'limit', memberId: undefined, marks: null });
  });

  it('a hub out of reach is not a refusal, and what the fetcher threw comes along', async () => {
    const lost = new Error('Session expired');
    const fetcher = vi.fn().mockRejectedValueOnce(lost);
    expect(await postChoreToggle(fetcher, request)).toEqual({ ok: false, refused: false, error: lost });
  });

  it('any other error answer counts as not saved', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(status(500, null));
    expect(await postChoreToggle(fetcher, request)).toEqual({ ok: false, refused: false });
  });

  it('an answer with no lists in it counts as not saved rather than as empty lists', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(ok({ changed: true }));
    expect(await postChoreToggle(fetcher, request)).toEqual({ ok: false, refused: false });
  });
});

describe('postChoreMarks', () => {
  it('sends each write to its own route with the kind left out of the body', async () => {
    const fetcher = vi.fn().mockResolvedValue(ok({ completions: [], grabs: [] }));
    await postChoreMarks(fetcher, { kind: 'grab', choreId: 'garage', memberId: 'ada', action: 'grab' });
    await postChoreMarks(fetcher, { kind: 'skip', choreId: 'dishes', memberIds: ['ada', 'bram'], date: '2026-11-03', skipped: true });
    await postChoreMarks(fetcher, { kind: 'put-back', choreId: 'garage' });
    expect(fetcher.mock.calls.map((c) => c[0])).toEqual(['/api/chores/grab', '/api/chores/skip', '/api/chores/put-back']);
    expect(fetcher.mock.calls.map(bodyOf)).toEqual([
      { choreId: 'garage', memberId: 'ada', action: 'grab' },
      { choreId: 'dishes', memberIds: ['ada', 'bram'], date: '2026-11-03', skipped: true },
      { choreId: 'garage' },
    ]);
  });

  it('answers like a tick: the lists on success, the refusal on a 409', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(ok({ completions: [], grabs: [{ choreId: 'garage', memberId: 'ada', date: '2026-11-03' }] }))
      .mockResolvedValueOnce(status(409, { reason: 'grabbed', memberId: 'bram', completions: [], grabs: [] }));
    const write = { kind: 'grab' as const, choreId: 'garage', memberId: 'ada', action: 'grab' as const };
    expect(await postChoreMarks(fetcher, write)).toMatchObject({ ok: true, answer: { grabs: [{ memberId: 'ada' }] } });
    expect(await postChoreMarks(fetcher, write)).toMatchObject({ ok: false, refused: true, refusal: 'grabbed', memberId: 'bram', marks: { completions: [], grabs: [] } });
  });
});

describe('choreMarksOf', () => {
  it('keeps only the lists, and only when there are completions to show', () => {
    expect(choreMarksOf({ completions: [], grabs: [], bonusResets: { garage: 'x' }, rewards: {}, changed: true })).toEqual({ completions: [], grabs: [], bonusResets: { garage: 'x' } });
    expect(choreMarksOf({ completions: [] })).toEqual({ completions: [] });
    expect(choreMarksOf({ grabs: [] })).toBeNull();
    expect(choreMarksOf(null)).toBeNull();
  });
});
