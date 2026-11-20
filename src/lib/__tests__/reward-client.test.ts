import { describe, expect, it, vi } from 'vitest';
import { HubUnreachableError } from '../hub-request';
import { RewardSession, adjustTickets, asRewardListSnapshot, setSavingsGoal } from '../reward-client';
import type { RewardDefinition } from '../reward-data';

const reward = (id: string) => ({ id, name: id, cost: 5, memberIds: [] }) as unknown as RewardDefinition;
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const bodyOf = (fetcher: ReturnType<typeof vi.fn>, call: number) => JSON.parse(fetcher.mock.calls[call][1].body);

describe('asRewardListSnapshot', () => {
  it('accepts only a list with a revision to quote', () => {
    expect(asRewardListSnapshot({ rewards: [], revision: 'a' })).toEqual({ rewards: [], revision: 'a' });
    expect(asRewardListSnapshot({ rewards: [] })).toBeNull();
    expect(asRewardListSnapshot(null)).toBeNull();
  });
});

describe('RewardSession', () => {
  // Sent side by side, the second save quoted the first one's revision and
  // was told somebody else had changed the list.
  it('sends two saves made a moment apart in order, the second quoting the first one\'s answer', async () => {
    const answers: Array<(res: Response) => void> = [];
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { answers.push(resolve); }));
    const session = new RewardSession(fetcher, { revision: 'r0' });
    const first = session.save([reward('a')], false, 'Not saved');
    const second = session.save([reward('a'), reward('b')], false, 'Not saved');
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(bodyOf(fetcher, 0)).toEqual({ rewards: [reward('a')], revision: 'r0' });
    answers[0](reply(200, { rewards: [reward('a')], revision: 'r1' }));
    expect((await first).kind).toBe('saved');
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(bodyOf(fetcher, 1).revision).toBe('r1');
    answers[1](reply(200, { rewards: [reward('a'), reward('b')], revision: 'r2' }));
    expect(await second).toEqual({ kind: 'saved', snapshot: { rewards: [reward('a'), reward('b')], revision: 'r2' } });
    expect(session.currentRevision).toBe('r2');
  });

  it('says an empty list is meant only when asked to', async () => {
    const fetcher = vi.fn().mockImplementation(async () => reply(200, { rewards: [], revision: 'r1' }));
    const session = new RewardSession(fetcher, { revision: 'r0' });
    await session.save([], true, 'Not saved');
    await session.save([reward('a')], false, 'Not saved');
    expect(bodyOf(fetcher, 0)).toEqual({ rewards: [], force: true, revision: 'r0' });
    expect(bodyOf(fetcher, 1)).not.toHaveProperty('force');
  });

  it('adopts the hub\'s list on a conflict and drops the save queued behind it', async () => {
    const fetcher = vi.fn().mockImplementation(async () => reply(409, { error: 'Changed', code: 'rewards.revision', reason: 'revision', rewards: [reward('theirs')], revision: 'r9' }));
    const session = new RewardSession(fetcher, { revision: 'r0' });
    const first = session.save([reward('a')], false, 'Not saved');
    const second = session.save([reward('a'), reward('b')], false, 'Not saved');
    expect(await first).toEqual({ kind: 'conflict', snapshot: { rewards: [reward('theirs')], revision: 'r9' } });
    expect(await second).toEqual({ kind: 'superseded' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(session.currentRevision).toBe('r9');
  });

  // An OK answer cut short used to read as saved with the old revision kept,
  // so the next save was refused as stale.
  it('rejects an answer that never fully arrived', async () => {
    const cut = new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"rewards":[')); c.error(new TypeError('network error')); } }), { status: 200 });
    const session = new RewardSession(vi.fn().mockResolvedValue(cut), { revision: 'r0' });
    await expect(session.save([reward('a')], false, 'Not saved')).rejects.toBeInstanceOf(HubUnreachableError);
    expect(session.currentRevision).toBe('r0');
  });
});

describe('adjustTickets', () => {
  it('sends the people, the amount and a reason when there is one', async () => {
    const fetcher = vi.fn().mockImplementation(async () => reply(200, { balances: { a: 3, b: 1 } }));
    expect(await adjustTickets(fetcher, { memberIds: ['a', 'b'], amount: 1, reason: 'Helped out' }, 'Not saved')).toEqual({ a: 3, b: 1 });
    expect(bodyOf(fetcher, 0)).toEqual({ memberIds: ['a', 'b'], amount: 1, reason: 'Helped out' });
    await adjustTickets(fetcher, { memberIds: ['a'], amount: -1 }, 'Not saved');
    expect(bodyOf(fetcher, 1)).toEqual({ memberIds: ['a'], amount: -1 });
  });

  it('rejects a refusal and an answer without balances', async () => {
    await expect(adjustTickets(vi.fn().mockResolvedValue(reply(409, { error: 'Someone was removed', code: 'family.memberRemoved' })), { memberIds: ['a'], amount: 1 }, 'Not saved'))
      .rejects.toMatchObject({ code: 'family.memberRemoved' });
    await expect(adjustTickets(vi.fn().mockResolvedValue(reply(200, {})), { memberIds: ['a'], amount: 1 }, 'Not saved')).rejects.toThrow('Not saved');
  });
});

describe('setSavingsGoal', () => {
  it('sends the pick and hands back everyone\'s goals', async () => {
    const fetcher = vi.fn().mockImplementation(async () => reply(200, { goals: { a: 'bike' } }));
    expect(await setSavingsGoal(fetcher, 'a', 'bike', 'Not saved')).toEqual({ a: 'bike' });
    expect(fetcher.mock.calls[0][0]).toBe('/api/rewards/goal');
    expect(bodyOf(fetcher, 0)).toEqual({ memberId: 'a', rewardId: 'bike' });
  });

  it('reads a cleared last goal as no goals, and rejects a refusal', async () => {
    expect(await setSavingsGoal(vi.fn().mockResolvedValue(reply(200, {})), 'a', null, 'Not saved')).toEqual({});
    await expect(setSavingsGoal(vi.fn().mockResolvedValue(reply(500, {})), 'a', 'bike', 'Not saved')).rejects.toThrow('Not saved');
  });
});
