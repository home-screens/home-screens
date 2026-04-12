import { describe, it, expect } from 'vitest';
import type { RewardDefinition } from '@/lib/reward-data';

// Duplicate of the filter logic from RewardsStoreView for testability
function filterRewards(
  rewards: RewardDefinition[],
  selectedMemberId: string | null,
): RewardDefinition[] {
  return rewards.filter((r) => {
    if (!r.enabled) return false;
    if (r.memberIds.length === 0) return true;
    return selectedMemberId ? r.memberIds.includes(selectedMemberId) : true;
  });
}

function canAfford(balance: number, cost: number): boolean {
  return balance >= cost;
}

const REWARDS: RewardDefinition[] = [
  { id: 'r1', name: 'Ice Cream', emoji: '🍦', cost: 30, description: '', memberIds: [], enabled: true },
  { id: 'r2', name: 'Movie Night', emoji: '🎬', cost: 50, description: '', memberIds: ['m1', 'm2'], enabled: true },
  { id: 'r3', name: 'Disabled Reward', emoji: '❌', cost: 10, description: '', memberIds: [], enabled: false },
  { id: 'r4', name: 'Teen Only', emoji: '📱', cost: 40, description: '', memberIds: ['m3'], enabled: true },
];

describe('Rewards Store filtering', () => {
  it('hides disabled rewards', () => {
    const visible = filterRewards(REWARDS, 'm1');
    expect(visible.find((r) => r.id === 'r3')).toBeUndefined();
  });

  it('shows rewards with empty memberIds to everyone', () => {
    const visible = filterRewards(REWARDS, 'm1');
    expect(visible.find((r) => r.id === 'r1')).toBeDefined();
  });

  it('shows rewards when member is in memberIds', () => {
    const visible = filterRewards(REWARDS, 'm1');
    expect(visible.find((r) => r.id === 'r2')).toBeDefined();
  });

  it('hides rewards when member is NOT in memberIds', () => {
    const visible = filterRewards(REWARDS, 'm1');
    expect(visible.find((r) => r.id === 'r4')).toBeUndefined();
  });

  it('shows all non-disabled rewards when no member selected', () => {
    const visible = filterRewards(REWARDS, null);
    expect(visible).toHaveLength(3); // r1, r2, r4 (r3 disabled)
  });
});

describe('Rewards Store affordability', () => {
  it('can afford when balance equals cost', () => {
    expect(canAfford(30, 30)).toBe(true);
  });

  it('can afford when balance exceeds cost', () => {
    expect(canAfford(100, 30)).toBe(true);
  });

  it('cannot afford when balance is below cost', () => {
    expect(canAfford(20, 30)).toBe(false);
  });

  it('cannot afford with zero balance', () => {
    expect(canAfford(0, 30)).toBe(false);
  });
});
