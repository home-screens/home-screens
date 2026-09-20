import { describe, expect, it } from 'vitest';
import type { RewardRedemption } from '@/lib/reward-data';
import { sortRewardRedemptions } from '../views/RewardHistoryView';

describe('reward history', () => {
  it('sorts redemptions newest first', () => {
    const redemptions: RewardRedemption[] = [
      {
        id: '1',
        rewardId: 'reward-1',
        rewardName: 'Soda',
        memberId: 'member-1',
        memberName: 'Member One',
        cost: 1,
        redeemedAt: '2026-09-20T01:00:00Z',
      },
      {
        id: '2',
        rewardId: 'reward-2',
        rewardName: 'High Five',
        memberId: 'member-2',
        memberName: 'Member Two',
        cost: 1,
        redeemedAt: '2026-09-20T03:00:00Z',
      },
      {
        id: '3',
        rewardId: 'reward-3',
        rewardName: 'Energy Drink',
        memberId: 'member-2',
        memberName: 'Member Two',
        cost: 7,
        redeemedAt: '2026-09-20T02:00:00Z',
      },
    ];

    expect(sortRewardRedemptions(redemptions).map((r) => r.id)).toEqual([
      '2',
      '3',
      '1',
    ]);
  });

  it('does not mutate the original redemption array', () => {
    const redemptions: RewardRedemption[] = [
      {
        id: 'old',
        rewardId: 'reward-1',
        rewardName: 'Soda',
        memberId: 'member-1',
        memberName: 'Member One',
        cost: 1,
        redeemedAt: '2026-09-20T01:00:00Z',
      },
      {
        id: 'new',
        rewardId: 'reward-2',
        rewardName: 'High Five',
        memberId: 'member-2',
        memberName: 'Member Two',
        cost: 1,
        redeemedAt: '2026-09-20T02:00:00Z',
      },
    ];

    sortRewardRedemptions(redemptions);

    expect(redemptions.map((r) => r.id)).toEqual(['old', 'new']);
  });
});
