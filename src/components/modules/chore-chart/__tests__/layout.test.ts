import { describe, it, expect } from 'vitest';
import { balanceRows, fitPerRow, partitionMembers, weekMembers } from '../layout';
import type { MemberStats } from '../types';
import type { ChoreMember } from '@/types/config';

function stats(total: number, weekAssigned: number): MemberStats {
  return { total, completed: 0, percentage: 0, streak: 0, weeklyPoints: 0, weeklyPointsTotal: 0, rewardBalance: 0, weekAssigned };
}

const member = (id: string): ChoreMember => ({ id, name: id, emoji: '', color: '#fff' });

describe('balanceRows', () => {
  it('keeps everything on one row when it fits', () => {
    expect(balanceRows([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
    expect(balanceRows([1, 2], 5)).toEqual([[1, 2]]);
  });

  it('spreads a remainder across rows instead of leaving a lone trailing item', () => {
    expect(balanceRows([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5], [6, 7]]);
    expect(balanceRows([1, 2, 3, 4], 3)).toEqual([[1, 2], [3, 4]]);
    expect(balanceRows([1, 2, 3, 4, 5], 4)).toEqual([[1, 2, 3], [4, 5]]);
  });

  it('splits evenly when the count divides', () => {
    expect(balanceRows([1, 2, 3, 4, 5, 6], 3)).toEqual([[1, 2, 3], [4, 5, 6]]);
  });

  it('never returns an empty row and tolerates a zero or fractional limit', () => {
    expect(balanceRows([], 3)).toEqual([]);
    expect(balanceRows([1, 2], 0)).toEqual([[1], [2]]);
    expect(balanceRows([1, 2, 3], 2.9)).toEqual([[1, 2], [3]]);
  });
});

describe('fitPerRow', () => {
  it('counts how many items fit with gaps between them', () => {
    // 468px wide, 144px items, 8px gaps: 3 fit (3*144 + 2*8 = 448), 4 do not.
    expect(fitPerRow(468, 144, 8, 6)).toBe(3);
    expect(fitPerRow(900, 144, 8, 6)).toBe(5);
  });

  it('never exceeds the item count and never drops below one', () => {
    expect(fitPerRow(2000, 144, 8, 2)).toBe(2);
    expect(fitPerRow(100, 144, 8, 6)).toBe(1);
  });

  it('fits everything on one row while the width is unmeasured', () => {
    expect(fitPerRow(0, 144, 8, 6)).toBe(6);
  });
});

describe('partitionMembers', () => {
  const m = new Map<string, MemberStats>([
    ['kid', stats(3, 12)],
    ['rest', stats(0, 4)],
    ['parent', stats(0, 0)],
  ]);
  const members = [member('parent'), member('kid'), member('rest'), member('unknown')];

  it('splits members into active, day off, and idle', () => {
    const { active, dayOff, idle } = partitionMembers(members, m);
    expect(active.map((x) => x.id)).toEqual(['kid']);
    expect(dayOff.map((x) => x.id)).toEqual(['rest']);
    expect(idle.map((x) => x.id)).toEqual(['parent', 'unknown']);
  });

  it('keeps the household order within each group', () => {
    const { idle } = partitionMembers([member('unknown'), member('parent')], m);
    expect(idle.map((x) => x.id)).toEqual(['unknown', 'parent']);
  });

  it('charts everyone with chores this week, in order', () => {
    expect(weekMembers(members, m).map((x) => x.id)).toEqual(['kid', 'rest']);
  });
});
