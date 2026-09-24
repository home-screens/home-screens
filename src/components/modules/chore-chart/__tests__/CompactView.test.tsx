// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import type { FamilyMember } from '@/types/family';
import type { ChoreChartConfig, ChoreDefinition } from '@/types/config';
import { completionKey, type MemberStats } from '../types';
import { isoDateInTZ } from '@/lib/timezone';
import { UNCHECK_HOLD_MS } from '@/hooks/useHoldToUncheck';
import { CompactView } from '../views/CompactView';

const noah: FamilyMember = {
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  id: 'kid-1', name: 'Noah', emoji: '', color: '#8b5cf6',
};

function chore(points: number): ChoreDefinition {
  return {
    id: 'chore-1', name: 'Load the dishwasher', emoji: '', points, frequency: 'daily',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime', assigneeIds: ['kid-1'], rotation: 'fixed',
  };
}

const stats = new Map<string, MemberStats>([
  ['kid-1', { total: 1, completed: 0, percentage: 0, streak: 0, weeklyPoints: 0, weeklyPointsTotal: 0, rewardBalance: 0, weekAssigned: 1 }],
]);

function renderCompact(opts: { done?: boolean; points?: number; showPoints?: boolean } = {}) {
  const toggleComplete = vi.fn(async () => {});
  const c = chore(opts.points ?? 3);
  const completionSet = new Set<string>(
    opts.done ? [completionKey(c.id, noah.id, isoDateInTZ())] : [],
  );
  const config: ChoreChartConfig = {
    view: 'compact', weekStartDay: 'monday', showPoints: opts.showPoints ?? true, showStreaks: true,
    showTimeOfDay: true, allowDisplayComplete: true, accentColor: '#f59e0b',
  };
  render(
    <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>
      <CompactView
        config={config}
        data={{
          members: [noah], groups: [], chores: [c],
          todayAssignments: [{ chore: c, memberId: noah.id, isCompleted: !!opts.done, isSkipped: false, groupIds: [] }],
          completionSet, memberStats: stats, toggleComplete, today: isoDateInTZ(),
        }}
        width={600}
        fontSize={16}
      />
    </I18nProvider>,
  );
  return { toggleComplete, cell: screen.getByRole('button', { name: 'Load the dishwasher: Noah' }) };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe('un-ticking a box in the compact grid', () => {
  it('ignores a plain tap on a ticked box', () => {
    const { toggleComplete, cell } = renderCompact({ done: true });

    fireEvent.pointerDown(cell);
    fireEvent.pointerUp(cell);
    fireEvent.click(cell, { detail: 1 });

    expect(toggleComplete).not.toHaveBeenCalled();
  });

  it('puts the hint where there is room for words, on the chore row', () => {
    const { cell } = renderCompact({ done: true });

    fireEvent.pointerDown(cell);
    fireEvent.pointerUp(cell);

    expect(screen.getByRole('status').textContent).toBe('Press and hold to un-check');
  });

  it('un-ticks on a press and hold', () => {
    const { toggleComplete, cell } = renderCompact({ done: true });

    fireEvent.pointerDown(cell);
    act(() => { vi.advanceTimersByTime(UNCHECK_HOLD_MS); });

    expect(toggleComplete).toHaveBeenCalledWith('chore-1', 'kid-1');
  });

  it('still ticks an empty box on a single tap', () => {
    const { toggleComplete, cell } = renderCompact({ done: false });

    fireEvent.pointerDown(cell);
    fireEvent.pointerUp(cell);
    fireEvent.click(cell, { detail: 1 });

    expect(toggleComplete).toHaveBeenCalledWith('chore-1', 'kid-1');
  });
});

describe('what a chore is worth, in the compact grid', () => {
  it('shows the ticket value when show points is on', () => {
    renderCompact({ points: 5 });

    expect(screen.getByTestId('chore-ticket-value').textContent).toContain('5');
  });

  it('shows nothing when show points is off', () => {
    renderCompact({ points: 5, showPoints: false });

    expect(screen.queryByTestId('chore-ticket-value')).toBeNull();
  });
});
