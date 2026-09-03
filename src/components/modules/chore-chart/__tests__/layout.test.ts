import { describe, it, expect } from 'vitest';
import { balanceRows, choreTapSize, fitChoreFontSize, fitPerRow, partitionMembers, weekMembers } from '../layout';
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

describe('fitChoreFontSize', () => {
  const day = { width: 476, height: 626, requested: 24, rows: 10, sections: 4, view: 'today' };

  it('shrinks a busy day to fit its own default card', () => {
    // Ten chores at the module's 24px default need ~780px of rows; the card
    // is 650. Before this the last three were cut off mid-row.
    const fitted = fitChoreFontSize(day);
    expect(fitted).toBeLessThan(24);
    expect(fitted * (day.rows * 2.6 + day.sections * 1.9 + 3.7)).toBeLessThanOrEqual(day.height);
  });

  it('leaves a light day at the size the household asked for', () => {
    expect(fitChoreFontSize({ ...day, rows: 3, sections: 2 })).toBe(24);
  });

  it('never exceeds the module font size, however big the box', () => {
    expect(fitChoreFontSize({ ...day, width: 4000, height: 4000, rows: 1, sections: 1 })).toBe(24);
  });

  it('stops shrinking at a readable floor rather than vanishing', () => {
    expect(fitChoreFontSize({ ...day, height: 120, rows: 30, sections: 4 })).toBe(11);
  });

  it('keeps the authored size until the box has been measured', () => {
    expect(fitChoreFontSize({ ...day, width: 0, height: 0 })).toBe(24);
  });

  it('leaves room for compact\'s member header and totals legend', () => {
    // Compact draws shorter rows than the list views but carries far more
    // chrome, so the fit has to budget for the chrome, not just the rows.
    const compact = fitChoreFontSize({ ...day, view: 'compact', sections: 0 });
    expect(compact * (day.rows * 1.9 + 9)).toBeLessThanOrEqual(day.height);
  });
});

describe('choreTapSize', () => {
  it('keeps a fingertip target while the type allows one', () => {
    expect(choreTapSize(24)).toBe(38);
  });

  it('shrinks with the type rather than pushing chores off the bottom', () => {
    expect(choreTapSize(16)).toBeLessThan(38);
  });

  it('never goes below a size a child can hit', () => {
    expect(choreTapSize(11)).toBe(24);
  });
});

