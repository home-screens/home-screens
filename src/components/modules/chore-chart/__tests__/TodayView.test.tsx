// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import enUSCore from '@/translations/en-US/core.json';
import type { FamilyGroup, FamilyMember } from '@/types/family';
import type { ChoreChartConfig, ChoreDefinition } from '@/types/config';
import type { MemberStats, ResolvedAssignment } from '../types';
import { UNCHECK_HOLD_MS } from '@/hooks/useHoldToUncheck';
import { TodayView } from '../views/TodayView';

function wrap(children: React.ReactNode) {
  return (
    <I18nProvider locale="en-US" blob={{ modules: enUSModules, core: enUSCore }}>
      {children}
    </I18nProvider>
  );
}

const stamp = '2026-01-01T00:00:00.000Z';

function person(id: string, name: string, color: string): FamilyMember {
  return { createdAt: stamp, updatedAt: stamp, id, name, emoji: '', color };
}

const noah = person('kid-1', 'Noah', '#8b5cf6');
const mia = person('kid-2', 'Mia', '#f472b6');
const liam = person('kid-3', 'Liam', '#4ade80');

function chore(points: number): ChoreDefinition {
  return {
    id: 'chore-1', name: 'Load the dishwasher', emoji: '', points, frequency: 'daily',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime', assigneeIds: ['kid-1'], rotation: 'fixed',
  };
}

function statsFor(ids: string[]) {
  return new Map<string, MemberStats>(ids.map((id) => [id, {
    total: 1, completed: 0, percentage: 0, streak: 0,
    weeklyPoints: 0, weeklyPointsTotal: 0, rewardBalance: 0, weekAssigned: 1,
  }]));
}

function config(overrides: Partial<ChoreChartConfig> = {}): ChoreChartConfig {
  return {
    view: 'today', weekStartDay: 'monday', showPoints: true, showStreaks: true,
    showTimeOfDay: true, allowDisplayComplete: true, accentColor: '#8b5cf6', ...overrides,
  };
}

function renderView(opts: {
  members?: FamilyMember[];
  assignments: ResolvedAssignment[];
  groups?: FamilyGroup[];
  cfg?: Partial<ChoreChartConfig>;
}) {
  const toggleComplete = vi.fn(async () => {});
  const members = opts.members ?? [noah];
  render(wrap(
    <TodayView
      config={config(opts.cfg)}
      data={{
        members,
        groups: opts.groups ?? [],
        todayAssignments: opts.assignments,
        memberStats: statsFor(members.map((m) => m.id)),
        toggleComplete,
      }}
      fontSize={16}
    />,
  ));
  return { toggleComplete };
}

/** One chore, one person: the dot that carries the whole interaction. */
function renderOne(opts: { isCompleted?: boolean; points?: number; cfg?: Partial<ChoreChartConfig> } = {}) {
  const { toggleComplete } = renderView({
    assignments: [{
      chore: chore(opts.points ?? 3), memberId: 'kid-1', isCompleted: opts.isCompleted ?? false, isSkipped: false, groupIds: [],
    }],
    cfg: opts.cfg,
  });
  return { toggleComplete, dot: screen.getByRole('button', { name: /Load the dishwasher for Noah/ }) };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe('one row per chore, one dot per person', () => {
  it('draws a chore shared by three kids as a single row with three dots', () => {
    const shared = chore(1);
    renderView({
      members: [noah, mia, liam],
      assignments: ['kid-1', 'kid-2', 'kid-3'].map((memberId) => ({
        chore: shared, memberId, isCompleted: false, isSkipped: false, groupIds: [],
      })),
    });

    expect(screen.getAllByText('Load the dishwasher')).toHaveLength(1);
    expect(screen.getAllByTestId('chore-assignee-dot')).toHaveLength(3);
  });

  it('names the person on each dot, so a wall says whose chore it is without a pointer', () => {
    const shared = chore(1);
    renderView({
      members: [noah, mia, liam],
      assignments: ['kid-1', 'kid-2', 'kid-3'].map((memberId) => ({
        chore: shared, memberId, isCompleted: false, isSkipped: false, groupIds: [],
      })),
    });

    const dots = screen.getAllByTestId('chore-assignee-dot');
    expect(dots.map((d) => d.textContent)).toEqual(['N', 'M', 'L']);
    expect(dots.map((d) => d.getAttribute('aria-label'))).toEqual([
      'Complete Load the dishwasher for Noah',
      'Complete Load the dishwasher for Mia',
      'Complete Load the dishwasher for Liam',
    ]);
  });

  it('keeps dots in household order whoever has finished, so a dot never moves under a finger', () => {
    const shared = chore(1);
    renderView({
      members: [noah, mia, liam],
      assignments: [
        { chore: shared, memberId: 'kid-2', isCompleted: true, isSkipped: false, groupIds: [] },
        { chore: shared, memberId: 'kid-3', isCompleted: false, isSkipped: false, groupIds: [] },
        { chore: shared, memberId: 'kid-1', isCompleted: false, isSkipped: false, groupIds: [] },
      ],
    });

    expect(screen.getAllByTestId('chore-assignee-dot').map((d) => d.getAttribute('title')))
      .toEqual(['Noah', 'Mia', 'Liam']);
  });

  it('ticks only the person whose dot was tapped', () => {
    const shared = chore(1);
    const { toggleComplete } = renderView({
      members: [noah, mia, liam],
      assignments: ['kid-1', 'kid-2', 'kid-3'].map((memberId) => ({
        chore: shared, memberId, isCompleted: false, isSkipped: false, groupIds: [],
      })),
    });

    const mias = screen.getByRole('button', { name: /for Mia/ });
    fireEvent.pointerDown(mias);
    fireEvent.pointerUp(mias);
    fireEvent.click(mias, { detail: 1 });

    expect(toggleComplete).toHaveBeenCalledWith('chore-1', 'kid-2');
    expect(toggleComplete).toHaveBeenCalledTimes(1);
  });

  it('puts a group chore in one labelled pill', () => {
    const kids: FamilyGroup = { id: 'kids', name: 'Kids', memberIds: ['kid-1', 'kid-2', 'kid-3'], createdAt: stamp, updatedAt: stamp };
    const shared = { ...chore(1), assigneeIds: [], assigneeGroupIds: ['kids'] };
    renderView({
      members: [noah, mia, liam],
      groups: [kids],
      assignments: ['kid-1', 'kid-2', 'kid-3'].map((memberId) => ({
        chore: shared, memberId, isCompleted: false, isSkipped: false, groupIds: ['kids'],
      })),
    });

    expect(screen.getByText('Kids')).toBeTruthy();
    expect(screen.getAllByTestId('chore-assignee-dot')).toHaveLength(3);
  });
});

describe('un-ticking a finished chore on the wall', () => {
  it('ignores a plain tap so a passer-by cannot undo finished work', () => {
    const { toggleComplete, dot } = renderOne({ isCompleted: true });

    fireEvent.pointerDown(dot);
    fireEvent.pointerUp(dot);
    fireEvent.click(dot, { detail: 1 });

    expect(toggleComplete).not.toHaveBeenCalled();
  });

  it('says what to do instead after that tap', () => {
    const { dot } = renderOne({ isCompleted: true });

    fireEvent.pointerDown(dot);
    fireEvent.pointerUp(dot);

    expect(screen.getByRole('status').textContent).toBe('Press and hold to un-check');
  });

  it('un-ticks on a press and hold', () => {
    const { toggleComplete, dot } = renderOne({ isCompleted: true });

    fireEvent.pointerDown(dot);
    act(() => { vi.advanceTimersByTime(UNCHECK_HOLD_MS); });

    expect(toggleComplete).toHaveBeenCalledWith('chore-1', 'kid-1');
    expect(toggleComplete).toHaveBeenCalledTimes(1);

    // The click that trails a finished hold must not tick it straight back on.
    fireEvent.pointerUp(dot);
    fireEvent.click(dot, { detail: 1 });
    expect(toggleComplete).toHaveBeenCalledTimes(1);
  });

  it('still ticks an unfinished chore off on a single tap', () => {
    const { toggleComplete, dot } = renderOne({ isCompleted: false });

    fireEvent.pointerDown(dot);
    fireEvent.pointerUp(dot);
    fireEvent.click(dot, { detail: 1 });

    expect(toggleComplete).toHaveBeenCalledWith('chore-1', 'kid-1');
  });

  it('lets a keyboard un-tick without a hold, since a key cannot be held', () => {
    const { toggleComplete, dot } = renderOne({ isCompleted: true });

    // Enter and Space arrive as a click with detail 0.
    fireEvent.click(dot, { detail: 0 });

    expect(toggleComplete).toHaveBeenCalledWith('chore-1', 'kid-1');
  });

  it('holds per person, so one finished dot on a shared chore does not guard the others', () => {
    const shared = chore(1);
    const { toggleComplete } = renderView({
      members: [noah, mia],
      assignments: [
        { chore: shared, memberId: 'kid-1', isCompleted: true, isSkipped: false, groupIds: [] },
        { chore: shared, memberId: 'kid-2', isCompleted: false, isSkipped: false, groupIds: [] },
      ],
    });

    const mias = screen.getByRole('button', { name: /for Mia/ });
    fireEvent.pointerDown(mias);
    fireEvent.pointerUp(mias);
    fireEvent.click(mias, { detail: 1 });

    expect(toggleComplete).toHaveBeenCalledWith('chore-1', 'kid-2');
  });
});

/**
 * Two fingers on a hallway wall. Both dots are finished, so both take a hold
 * to un-tick, and the two presses overlap.
 */
function renderTwoFinished() {
  const named = (id: string, name: string): ChoreDefinition => ({ ...chore(3), id, name });
  const { toggleComplete } = renderView({
    assignments: [
      { chore: named('chore-a', 'Feed the cat'), memberId: 'kid-1', isCompleted: true, isSkipped: false, groupIds: [] },
      { chore: named('chore-b', 'Water the plants'), memberId: 'kid-1', isCompleted: true, isSkipped: false, groupIds: [] },
    ],
  });
  return {
    toggleComplete,
    dotA: screen.getByRole('button', { name: /Feed the cat/ }),
    dotB: screen.getByRole('button', { name: /Water the plants/ }),
  };
}

describe('two fingers on the wall at once', () => {
  it('does not un-tick the dot the second finger landed on', () => {
    const { toggleComplete, dotA, dotB } = renderTwoFinished();

    // A held for 600ms, then a second finger touches B.
    fireEvent.pointerDown(dotA, { pointerId: 1 });
    act(() => { vi.advanceTimersByTime(600); });
    fireEvent.pointerDown(dotB, { pointerId: 2 });
    act(() => { vi.advanceTimersByTime(100); });

    expect(toggleComplete).not.toHaveBeenCalledWith('chore-b', 'kid-1');
  });

  it('finishes the hold on the dot the first finger actually held', () => {
    const { toggleComplete, dotA, dotB } = renderTwoFinished();

    fireEvent.pointerDown(dotA, { pointerId: 1 });
    act(() => { vi.advanceTimersByTime(600); });
    fireEvent.pointerDown(dotB, { pointerId: 2 });
    act(() => { vi.advanceTimersByTime(UNCHECK_HOLD_MS); });

    expect(toggleComplete).toHaveBeenCalledWith('chore-a', 'kid-1');
    expect(toggleComplete).toHaveBeenCalledTimes(1);
  });

  it('gives the second finger no credit for time it did not hold', () => {
    const { toggleComplete, dotA, dotB } = renderTwoFinished();

    // A holds almost to the line, then lifts; B presses and lifts straight
    // after. B borrowed nothing, so nothing is un-ticked.
    fireEvent.pointerDown(dotA, { pointerId: 1 });
    act(() => { vi.advanceTimersByTime(690); });
    fireEvent.pointerUp(dotA, { pointerId: 1 });
    fireEvent.pointerDown(dotB, { pointerId: 2 });
    act(() => { vi.advanceTimersByTime(50); });
    fireEvent.pointerUp(dotB, { pointerId: 2 });

    expect(toggleComplete).not.toHaveBeenCalled();
  });

  it('lets the second finger hold for itself once the first is done', () => {
    const { toggleComplete, dotA, dotB } = renderTwoFinished();

    fireEvent.pointerDown(dotA, { pointerId: 1 });
    act(() => { vi.advanceTimersByTime(UNCHECK_HOLD_MS); });
    fireEvent.pointerUp(dotA, { pointerId: 1 });
    expect(toggleComplete).toHaveBeenCalledWith('chore-a', 'kid-1');

    fireEvent.pointerDown(dotB, { pointerId: 2 });
    act(() => { vi.advanceTimersByTime(UNCHECK_HOLD_MS); });

    expect(toggleComplete).toHaveBeenCalledWith('chore-b', 'kid-1');
  });

  it('tells the second finger why its press did nothing', () => {
    const { dotA, dotB } = renderTwoFinished();

    fireEvent.pointerDown(dotA, { pointerId: 1 });
    act(() => { vi.advanceTimersByTime(300); });
    fireEvent.pointerDown(dotB, { pointerId: 2 });
    fireEvent.pointerUp(dotB, { pointerId: 2 });

    expect(screen.getByRole('status').textContent).toBe('Press and hold to un-check');
  });
});

describe('what a chore is worth', () => {
  it('shows the ticket value when show points is on', () => {
    renderOne({ points: 3 });

    expect(screen.getByTestId('chore-ticket-value').textContent).toContain('3');
  });

  it('shows nothing when show points is off', () => {
    renderOne({ points: 3, cfg: { showPoints: false } });

    expect(screen.queryByTestId('chore-ticket-value')).toBeNull();
  });

  it('shows nothing for a chore worth no tickets', () => {
    renderOne({ points: 0 });

    expect(screen.queryByTestId('chore-ticket-value')).toBeNull();
  });

  it('shows one ticket value for a chore five kids share, not five', () => {
    const shared = chore(2);
    renderView({
      members: [noah, mia, liam],
      assignments: ['kid-1', 'kid-2', 'kid-3'].map((memberId) => ({
        chore: shared, memberId, isCompleted: false, isSkipped: false, groupIds: [],
      })),
    });

    expect(screen.getAllByTestId('chore-ticket-value')).toHaveLength(1);
  });
});

describe('a wall that cannot be tapped', () => {
  it('still shows who has the chore and who has finished', () => {
    const shared = chore(1);
    renderView({
      members: [noah, mia],
      cfg: { allowDisplayComplete: false },
      assignments: [
        { chore: shared, memberId: 'kid-1', isCompleted: true, isSkipped: false, groupIds: [] },
        { chore: shared, memberId: 'kid-2', isCompleted: false, isSkipped: false, groupIds: [] },
      ],
    });

    expect(screen.getAllByTestId('chore-assignee-dot')).toHaveLength(2);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('TodayView bonus chores', () => {
  const windows = {
    ...chore(3), id: 'windows', name: 'Wash the windows',
    bonus: { claim: 'each' as const, comesBack: 'weekly' as const },
  };
  const car = {
    ...chore(5), id: 'car', name: 'Wash the car',
    bonus: { claim: 'first' as const, comesBack: 'weekly' as const },
  };

  function renderBonus() {
    render(wrap(
      <TodayView
        config={config()}
        data={{
          members: [noah, mia],
          groups: [],
          todayAssignments: [],
          memberStats: statsFor([noah.id, mia.id]),
          toggleComplete: vi.fn(async () => {}),
          today: '2026-09-23',
          todayBonus: [
            { chore: windows, eligibleIds: [noah.id, mia.id], doneIds: [mia.id], doneOn: { [mia.id]: '2026-09-22' }, roundIsToday: false, waiting: false },
            { chore: car, eligibleIds: [noah.id], grab: { status: 'done', memberId: noah.id, date: '2026-09-21' }, doneIds: [], doneOn: {}, roundIsToday: false, waiting: false },
          ],
        }}
        fontSize={16}
      />,
    ));
  }

  it('leaves a dot done on another day this week out of reach, and keeps today\'s open one', () => {
    renderBonus();
    expect(screen.queryByRole('button', { name: /Wash the windows for Mia/ })).toBeNull();
    expect(screen.getByRole('img', { name: 'Mia did it Tuesday' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Wash the windows for Noah/ })).toBeTruthy();
  });

  it('says which day an earlier finish was', () => {
    renderBonus();
    expect(screen.getByText('Noah did it Monday')).toBeTruthy();
  });
});
