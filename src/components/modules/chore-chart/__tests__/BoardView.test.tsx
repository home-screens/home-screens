
import type { FamilyMember } from '@/types/family';
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UNCHECK_HOLD_MS } from '@/hooks/useHoldToUncheck';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import { BoardView } from '../views/BoardView';
import type { ChoreDefinition } from '@/types/config';
import type { MemberStats } from '../types';

function wrap(children: React.ReactNode) {
  return <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>{children}</I18nProvider>;
}

function member(id: string): FamilyMember {
  return { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', id, name: `Member ${id}`, emoji: '', color: '#8b5cf6' };
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
    chore: chore(`${id}-${i}`), memberId: id, isCompleted: false, isSkipped: false, groupIds: [],
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

describe('BoardView un-ticking', () => {
  // The tests above leave their markup in the document; start from a clean one.
  beforeEach(() => { cleanup(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); cleanup(); });

  function board(isCompleted: boolean) {
    const toggleComplete = vi.fn(async () => {});
    const members = [member('solo')];
    const todayAssignments = [{ chore: chore('solo'), memberId: 'solo', isCompleted, isSkipped: false, groupIds: [] }];
    const memberStats = new Map<string, MemberStats>([
      ['solo', { total: 1, completed: isCompleted ? 1 : 0, percentage: 0, streak: 0, weeklyPoints: 0, weeklyPointsTotal: 0, rewardBalance: 0, weekAssigned: 1 }],
    ]);
    render(wrap(
      <BoardView
        config={{ view: 'board', weekStartDay: 'monday', showPoints: true, showStreaks: true, showTimeOfDay: true, allowDisplayComplete: true, accentColor: '#8b5cf6' }}
        data={{ members, todayAssignments, completionSet: new Set(), memberStats, toggleComplete }}
        width={900}
        fontSize={24}
        authoredFontSize={24}
      />,
    ));
    return { toggleComplete, card: screen.getByRole('button', { name: /Chore solo/ }) };
  }

  it('ignores a plain tap on a finished card', () => {
    const { toggleComplete, card } = board(true);

    fireEvent.pointerDown(card);
    fireEvent.pointerUp(card);
    fireEvent.click(card, { detail: 1 });

    expect(toggleComplete).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('Press and hold to un-check');
  });

  it('un-ticks on a press and hold', () => {
    const { toggleComplete, card } = board(true);

    fireEvent.pointerDown(card);
    act(() => { vi.advanceTimersByTime(UNCHECK_HOLD_MS); });

    expect(toggleComplete).toHaveBeenCalledWith('solo', 'solo');
  });

  it('still ticks an unfinished card off on a single tap', () => {
    const { toggleComplete, card } = board(false);

    fireEvent.pointerDown(card);
    fireEvent.pointerUp(card);
    fireEvent.click(card, { detail: 1 });

    expect(toggleComplete).toHaveBeenCalledWith('solo', 'solo');
  });
});
