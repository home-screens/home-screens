import { describe, it, expect } from 'vitest';
import type { RewardDefinition, RewardRedemption } from '../reward-data';
import {
  isRewardEligibleFor,
  isRewardOfferedTo,
  canAffordReward,
  ticketsStillNeeded,
  ticketsAfterRedeeming,
  sortRedemptionsNewestFirst,
  resolveSavingsGoal,
  goalProgress,
  goalsWithout,
  classifyRedeemAnswer,
  requestRedemption,
  ALREADY_GOT_WINDOW_MS,
} from '../reward-rules';

const reward = (overrides: Partial<RewardDefinition> = {}): RewardDefinition =>
  ({ id: 'r-1', name: 'Movie night', cost: 10, enabled: true, memberIds: [], ...overrides }) as RewardDefinition;

describe('isRewardEligibleFor', () => {
  it('offers an unrestricted reward to everyone, including nobody in particular', () => {
    expect(isRewardEligibleFor(reward(), 'kid-1')).toBe(true);
    expect(isRewardEligibleFor(reward(), null)).toBe(true);
  });

  it('offers a restricted reward only to the people named', () => {
    const restricted = reward({ memberIds: ['kid-1'] });
    expect(isRewardEligibleFor(restricted, 'kid-1')).toBe(true);
    expect(isRewardEligibleFor(restricted, 'kid-2')).toBe(false);
  });

  /* The wall's store starts with nobody picked. A restricted reward must not
   * show up before somebody says who they are. */
  it('withholds a restricted reward while nobody is selected', () => {
    expect(isRewardEligibleFor(reward({ memberIds: ['kid-1'] }), null)).toBe(false);
  });
});

describe('isRewardOfferedTo', () => {
  it('needs the reward switched on as well as meant for them', () => {
    expect(isRewardOfferedTo(reward(), 'kid-1')).toBe(true);
    expect(isRewardOfferedTo(reward({ enabled: false }), 'kid-1')).toBe(false);
    expect(isRewardOfferedTo(reward({ memberIds: ['kid-2'] }), 'kid-1')).toBe(false);
  });
});

describe('canAffordReward', () => {
  it('counts an exact balance as enough', () => {
    expect(canAffordReward(10, reward({ cost: 10 }))).toBe(true);
    expect(canAffordReward(9, reward({ cost: 10 }))).toBe(false);
    expect(canAffordReward(11, reward({ cost: 10 }))).toBe(true);
  });

  it('handles a member with no balance recorded yet', () => {
    expect(canAffordReward(0, reward({ cost: 1 }))).toBe(false);
    expect(canAffordReward(0, reward({ cost: 0 }))).toBe(true);
  });
});

describe('ticket counts', () => {
  it('says how many more are needed, never a negative number', () => {
    expect(ticketsStillNeeded(4, reward({ cost: 10 }))).toBe(6);
    expect(ticketsStillNeeded(12, reward({ cost: 10 }))).toBe(0);
  });

  it('says what would be left over, never a negative number', () => {
    expect(ticketsAfterRedeeming(12, reward({ cost: 10 }))).toBe(2);
    expect(ticketsAfterRedeeming(4, reward({ cost: 10 }))).toBe(0);
  });
});

describe('sortRedemptionsNewestFirst', () => {
  const redemption = (id: string, redeemedAt: string): RewardRedemption =>
    ({ id, rewardId: 'r-1', rewardName: 'Movie night', memberId: 'kid-1', memberName: 'Kid', cost: 1, redeemedAt });

  it('puts the newest redemption first', () => {
    const list = [
      redemption('1', '2026-09-20T01:00:00Z'),
      redemption('2', '2026-09-20T03:00:00Z'),
      redemption('3', '2026-09-20T02:00:00Z'),
    ];
    expect(sortRedemptionsNewestFirst(list).map((r) => r.id)).toEqual(['2', '3', '1']);
  });

  it('leaves the list it was given alone', () => {
    const list = [redemption('old', '2026-09-20T01:00:00Z'), redemption('new', '2026-09-20T02:00:00Z')];
    sortRedemptionsNewestFirst(list);
    expect(list.map((r) => r.id)).toEqual(['old', 'new']);
  });

  it('sorts a row with an unreadable timestamp last instead of scrambling the rest', () => {
    const list = [
      redemption('bad', 'not a date'),
      redemption('1', '2026-09-20T01:00:00Z'),
      redemption('2', '2026-09-20T03:00:00Z'),
    ];
    expect(sortRedemptionsNewestFirst(list).map((r) => r.id)).toEqual(['2', '1', 'bad']);
  });
});

describe('savings goal', () => {
  const movie: RewardDefinition = { id: 'movie', name: 'Movie', emoji: '', cost: 10, description: '', memberIds: [], enabled: true };
  const mine: RewardDefinition = { id: 'mine', name: 'Mine', emoji: '', cost: 4, description: '', memberIds: ['kid'], enabled: true };
  const off: RewardDefinition = { id: 'off', name: 'Off', emoji: '', cost: 4, description: '', memberIds: [], enabled: false };
  const rewards = [movie, mine, off];

  it('resolves to the reward while it is still one the person could redeem', () => {
    expect(resolveSavingsGoal({ rewards, goals: { kid: 'movie' } }, 'kid')).toBe(movie);
    expect(resolveSavingsGoal({ rewards, goals: { kid: 'mine' } }, 'kid')).toBe(mine);
  });

  it('is no goal when the reward is gone, switched off, someone else\'s, or never picked', () => {
    expect(resolveSavingsGoal({ rewards, goals: { kid: 'vanished' } }, 'kid')).toBeNull();
    expect(resolveSavingsGoal({ rewards, goals: { kid: 'off' } }, 'kid')).toBeNull();
    expect(resolveSavingsGoal({ rewards, goals: { other: 'mine' } }, 'other')).toBeNull();
    expect(resolveSavingsGoal({ rewards }, 'kid')).toBeNull();
  });

  it('measures progress for the bar, capped at full', () => {
    expect(goalProgress(4, movie)).toEqual({ have: 4, cost: 10, stillNeeded: 6, fraction: 0.4, reached: false });
    expect(goalProgress(12, movie)).toEqual({ have: 12, cost: 10, stillNeeded: 0, fraction: 1, reached: true });
    expect(goalProgress(-3, movie)).toEqual({ have: 0, cost: 10, stillNeeded: 13, fraction: 0, reached: false });
    expect(goalProgress(0, { ...movie, cost: 0 })).toEqual({ have: 0, cost: 0, stillNeeded: 0, fraction: 1, reached: true });
  });

  it('drops the goals a predicate picks out and hands back the same object when none match', () => {
    const goals = { kid: 'movie', other: 'mine' };
    expect(goalsWithout(goals, (_m, rewardId) => rewardId === 'mine')).toEqual({ kid: 'movie' });
    expect(goalsWithout(goals, () => false)).toBe(goals);
    expect(goalsWithout(undefined, () => true)).toBeUndefined();
  });
});

describe('classifyRedeemAnswer', () => {
  const NOW = Date.parse('2026-11-03T18:00:00Z');
  const redemption = (overrides: Partial<RewardRedemption> = {}): RewardRedemption =>
    ({ id: 'x-1', rewardId: 'r-1', rewardName: 'Movie night', memberId: 'kid-1', memberName: 'Ada', cost: 10, redeemedAt: new Date(NOW - 60_000).toISOString(), ...overrides }) as RewardRedemption;
  const classify = (status: number, body: Parameters<typeof classifyRedeemAnswer>[0]['body'] = null, recentRedemptions?: RewardRedemption[]) =>
    classifyRedeemAnswer({ status, body, recentRedemptions, rewardId: 'r-1', memberId: 'kid-1', now: NOW });

  it('reads a 2xx as redeemed', () => {
    expect(classify(200, { balances: {} })).toBe('redeemed');
  });

  it('reads a moved balance as "moved", and as "already got it" when this reward was just redeemed for this person', () => {
    expect(classify(409, { reason: 'balance', redemptions: [] })).toBe('moved');
    expect(classify(409, { reason: 'balance', redemptions: [redemption()] })).toBe('alreadyGot');
  });

  it('reads a 400 as "not enough", and as "already got it" with a fresh redemption of this reward', () => {
    expect(classify(400)).toBe('notEnough');
    expect(classify(400, null, [redemption()])).toBe('alreadyGot');
  });

  it('counts only this person, this reward, and the last ten minutes as "already got it"', () => {
    expect(classify(400, null, [redemption({ memberId: 'kid-2' })])).toBe('notEnough');
    expect(classify(400, null, [redemption({ rewardId: 'r-2' })])).toBe('notEnough');
    expect(classify(400, null, [redemption({ redeemedAt: new Date(NOW - ALREADY_GOT_WINDOW_MS - 1).toISOString() })])).toBe('notEnough');
    expect(classify(400, null, [redemption({ redeemedAt: new Date(NOW - ALREADY_GOT_WINDOW_MS + 1).toISOString() })])).toBe('alreadyGot');
  });

  it('reads a missing, switched-off or not-for-you reward as "not offered"', () => {
    expect(classify(404)).toBe('notOffered');
    expect(classify(403)).toBe('notOffered');
  });

  it('reads a 409 without the balance reason as the person being removed', () => {
    expect(classify(409, { reason: 'member' })).toBe('removed');
    expect(classify(409)).toBe('removed');
  });

  it('reads anything else as a plain failure', () => {
    expect(classify(500, { balances: {} })).toBe('failed');
    expect(classify(502)).toBe('failed');
  });
});

describe('requestRedemption', () => {
  const NOW = Date.parse('2026-11-03T18:00:00Z');
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fetchWith = (answers: Record<string, Response>) => {
    const calls: { url: string; method: string; body?: string }[] = [];
    const fetchFn = async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
      const key = `${init?.method ?? 'GET'} ${url}`;
      const res = answers[key];
      if (!res) throw new Error(`unexpected ${key}`);
      return res;
    };
    return { fetchFn, calls };
  };

  it('posts the reward, the person and the quoted balance, and hands back the hub numbers on a yes', async () => {
    const numbers = { balances: { 'kid-1': 2 }, redemptions: [], goals: {} };
    const { fetchFn, calls } = fetchWith({ 'POST /api/rewards': json(200, numbers) });
    const result = await requestRedemption(fetchFn, { rewardId: 'r-1', memberId: 'kid-1', expectedBalance: 12, now: NOW });
    expect(result).toEqual({ outcome: 'redeemed', numbers });
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].body!)).toEqual({ rewardId: 'r-1', memberId: 'kid-1', expectedBalance: 12 });
  });

  it('leaves the quoted balance out when the sheet had none', async () => {
    const { fetchFn, calls } = fetchWith({ 'POST /api/rewards': json(200, { balances: {} }) });
    await requestRedemption(fetchFn, { rewardId: 'r-1', memberId: 'kid-1', now: NOW });
    expect(JSON.parse(calls[0].body!)).toEqual({ rewardId: 'r-1', memberId: 'kid-1' });
  });

  it('takes the hub numbers with a moved refusal and never reads again', async () => {
    const refused = { error: 'The tickets changed', reason: 'balance', balances: { 'kid-1': 1 }, redemptions: [], goals: {} };
    const { fetchFn, calls } = fetchWith({ 'POST /api/rewards': json(409, refused) });
    const result = await requestRedemption(fetchFn, { rewardId: 'r-1', memberId: 'kid-1', expectedBalance: 12, now: NOW });
    expect(result.outcome).toBe('moved');
    expect(result.numbers).toEqual({ balances: { 'kid-1': 1 }, redemptions: [], goals: {} });
    expect(calls).toHaveLength(1);
  });

  it('reads the recent redemptions after a 400 and tells "already got it" from "not enough"', async () => {
    const recent = { id: 'x', rewardId: 'r-1', rewardName: 'Movie night', memberId: 'kid-1', memberName: 'Ada', cost: 10, redeemedAt: new Date(NOW - 5_000).toISOString() };
    const { fetchFn, calls } = fetchWith({
      'POST /api/rewards': json(400, { error: 'Insufficient point balance' }),
      'GET /api/rewards': json(200, { rewards: [], balances: {}, redemptions: [recent] }),
    });
    const result = await requestRedemption(fetchFn, { rewardId: 'r-1', memberId: 'kid-1', expectedBalance: 12, now: NOW });
    expect(result).toEqual({ outcome: 'alreadyGot', numbers: null });
    expect(calls.map((c) => c.method)).toEqual(['POST', 'GET']);

    const plain = fetchWith({
      'POST /api/rewards': json(400, { error: 'Insufficient point balance' }),
      'GET /api/rewards': json(200, { rewards: [], balances: {}, redemptions: [] }),
    });
    expect((await requestRedemption(plain.fetchFn, { rewardId: 'r-1', memberId: 'kid-1', now: NOW })).outcome).toBe('notEnough');
  });

  it('still says "not enough" when the follow-up read fails', async () => {
    const { fetchFn } = fetchWith({ 'POST /api/rewards': json(400, {}), 'GET /api/rewards': json(500, { error: 'nope' }) });
    expect((await requestRedemption(fetchFn, { rewardId: 'r-1', memberId: 'kid-1', now: NOW })).outcome).toBe('notEnough');
  });

  it('names the other refusals without carrying numbers, and lets a dropped connection reject', async () => {
    for (const [status, outcome] of [[404, 'notOffered'], [403, 'notOffered'], [409, 'removed'], [500, 'failed']] as const) {
      const { fetchFn, calls } = fetchWith({ 'POST /api/rewards': json(status, { error: 'developer words' }) });
      expect(await requestRedemption(fetchFn, { rewardId: 'r-1', memberId: 'kid-1', now: NOW })).toEqual({ outcome, numbers: null });
      expect(calls).toHaveLength(1);
    }
    const dropped = async () => { throw new TypeError('Load failed'); };
    await expect(requestRedemption(dropped, { rewardId: 'r-1', memberId: 'kid-1', now: NOW })).rejects.toThrow('Load failed');
  });
});
