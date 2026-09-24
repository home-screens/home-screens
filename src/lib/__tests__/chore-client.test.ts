import { describe, it, expect, vi } from 'vitest';
import type { ChoreDefinition } from '@/types/config';
import { ChoreSession, asChoreSnapshot } from '../chore-client';
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

    const first = session.save([chore('a')], false);
    const second = session.save([chore('a'), chore('b')], false);
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

    const first = session.save([chore('mine')], false);
    const second = session.save([chore('mine'), chore('mine-2')], false);

    await expect(first).resolves.toEqual({ kind: 'conflict', snapshot: theirs });
    await expect(second).resolves.toEqual({ kind: 'superseded' });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // A save made after the adoption quotes their revision.
    fetcher.mockResolvedValueOnce(ok({ chores: [chore('theirs'), chore('again')], revision: 'r3' }));
    await session.save([chore('theirs'), chore('again')], false);
    expect(bodyOf(fetcher.mock.calls[1]).revision).toBe('r2');
  });

  it('rejects on any other failure and keeps going afterwards', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(status(500, { error: 'boom' }))
      .mockResolvedValueOnce(ok({ chores: [chore('a')], revision: 'r2' }));
    const session = new ChoreSession(fetcher, { chores: [], settings: DEFAULT_CHORE_SETTINGS, revision: 'r1' });
    await expect(session.save([chore('a')], false)).rejects.toThrow('HTTP 500');
    await expect(session.save([chore('a')], false)).resolves.toMatchObject({ kind: 'saved' });
  });
});
