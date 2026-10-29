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
