// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import { BoardView } from '../views/BoardView';
import type { ChoreMember, ChoreDefinition } from '@/types/config';
import type { MemberStats } from '../types';

function wrap(children: React.ReactNode) {
  return <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>{children}</I18nProvider>;
}

function member(id: string): ChoreMember {
  return { id, name: `Member ${id}`, emoji: '', color: '#8b5cf6' };
}

function chore(id: string): ChoreDefinition {
  return {
    id, name: `Chore ${id}`, emoji: '', points: 1, frequency: 'daily',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime', assigneeIds: [id], rotation: 'fixed',
  };
}

/**
 * A member with `count` chores assigned today — the "heavy day" that shrinks
 * ChoreChartModule's fitted font size (see fitChoreFontSize in ../layout.ts).
 */
function heavyAssignments(id: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    chore: chore(`${id}-${i}`), memberId: id, isCompleted: false,
  }));
}

describe('BoardView row wrapping', () => {
  it('wraps columns to multiple rows against the authored font size, not the fitted one', () => {
    // 6 members in a 500px-wide card — the module's default size. One member
    // has a heavy day, which is what drives ChoreChartModule's fitted
    // fontSize down to a fraction of the authored 24px ceiling.
    const members = ['a', 'b', 'c', 'd', 'e', 'f'].map(member);
    const todayAssignments = [
      ...heavyAssignments('a', 13),
      ...['b', 'c', 'd', 'e', 'f'].flatMap((id) => heavyAssignments(id, 2)),
    ];
    const memberStats = new Map<string, MemberStats>(
      members.map((m) => [m.id, { total: 2, completed: 0, percentage: 0, streak: 0, weeklyPoints: 0, weeklyPointsTotal: 0, rewardBalance: 0, weekAssigned: 2 }]),
    );

    const { container } = render(wrap(
      <BoardView
        config={{ view: 'board', weekStartDay: 'monday', showPoints: true, showStreaks: true, showTimeOfDay: true, allowDisplayComplete: true, accentColor: '#8b5cf6' }}
        data={{ members, todayAssignments, completionSet: new Set(), memberStats, toggleComplete: async () => {} }}
        width={500}
        fontSize={9}
        authoredFontSize={24}
      />,
    ));

    // fitPerRow(500, 6 * 24, 8, 6) = 3 → balanceRows gives 2 rows of 3.
    // Before the fix this read fitPerRow(500, 6 * 9, 8, 6) = 6 → 1 row of 6,
    // squeezing every member's column to ~83px.
    const grid = container.querySelector('[style*="grid-template-rows"]');
    expect(grid).not.toBeNull();
    expect(grid!.getAttribute('style')).toMatch(/grid-template-rows:\s*repeat\(2,/);

    // Every member's name still renders in full — nothing got dropped.
    for (const m of members) {
      expect(container.textContent).toContain(m.name);
    }
  });

  it('keeps everything on one row when the box is wide enough for the authored size', () => {
    const members = ['a', 'b', 'c'].map(member);
    const todayAssignments = members.flatMap((m) => heavyAssignments(m.id, 1));
    const memberStats = new Map<string, MemberStats>(
      members.map((m) => [m.id, { total: 1, completed: 0, percentage: 0, streak: 0, weeklyPoints: 0, weeklyPointsTotal: 0, rewardBalance: 0, weekAssigned: 1 }]),
    );

    const { container } = render(wrap(
      <BoardView
        config={{ view: 'board', weekStartDay: 'monday', showPoints: true, showStreaks: true, showTimeOfDay: true, allowDisplayComplete: true, accentColor: '#8b5cf6' }}
        data={{ members, todayAssignments, completionSet: new Set(), memberStats, toggleComplete: async () => {} }}
        width={900}
        fontSize={24}
        authoredFontSize={24}
      />,
    ));

    const grid = container.querySelector('[style*="grid-template-rows"]');
    expect(grid!.getAttribute('style')).toMatch(/grid-template-rows:\s*repeat\(1,/);
  });
});
