import { describe, it, expect } from 'vitest';
import type { ChoreDefinition } from '@/types/config';
import type { TranslateFn } from '@/i18n';
import {
  buildChoreAssigneeLine,
  buildChoreSummaryLine,
  defaultChoreDays,
  finalizeChoreAssignment,
  getChoreRotationSummaryKey,
  getChoreValidationHintKind,
  scheduleDaysCovered,
} from '../chore-form-presentation';

/** Sunday-first weekday names, the shape `getLocalizedDayNames(locale, 'short')` returns. */
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Translate stub that echoes the key plus any vars in a predictable shape so
// assertions can verify both the chosen key and the param plumbing without
// pulling in the real provider.
const fakeT: TranslateFn = (key, vars) => {
  if (!vars) return `[${key}]`;
  const parts = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',');
  return `[${key} ${parts}]`;
};

function makeChore(overrides: Partial<ChoreDefinition>): ChoreDefinition {
  return {
    id: 'c1',
    name: 'Test',
    emoji: '✨',
    points: 2,
    frequency: 'daily',
    daysOfWeek: [],
    timeOfDay: 'morning',
    assigneeIds: [],
    rotation: 'fixed',
    ...overrides,
  };
}

describe('buildChoreSummaryLine', () => {
  it('routes daily frequency through the choreSummary.daily key', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ frequency: 'daily', points: 2 }),
      t: fakeT,
      dayNames: DAY_NAMES,
      locale: 'en-US',
    });
    expect(out).toBe(
      '[chore-chart.choreSummary.daily] · [chore-chart.timeOfDay.morning] · [chore-chart.choreSummary.ticketCountPlural count=2]',
    );
  });

  it('routes weekly frequency through the choreSummary.weekly key', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ frequency: 'weekly', points: 3, timeOfDay: 'afternoon' }),
      t: fakeT,
      dayNames: DAY_NAMES,
      locale: 'en-US',
    });
    expect(out).toContain('[chore-chart.choreSummary.weekly]');
    expect(out).toContain('[chore-chart.timeOfDay.afternoon]');
  });

  it('routes biweekly frequency through the choreSummary.biweekly key', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ frequency: 'biweekly', points: 4 }),
      t: fakeT,
      dayNames: DAY_NAMES,
      locale: 'en-US',
    });
    expect(out).toContain('[chore-chart.choreSummary.biweekly]');
  });

  it('uses the dated `once` key when specificDate is set', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ frequency: 'once', specificDate: '2026-06-01', points: 1 }),
      t: fakeT,
      dayNames: DAY_NAMES,
      locale: 'en-US',
    });
    expect(out).toBe(
      '[chore-chart.choreSummary.once date=Mon, Jun 1] · [chore-chart.timeOfDay.morning] · [chore-chart.choreSummary.ticketCountSingular count=1]',
    );
  });

  it('writes the one-time date in the formatting locale, the same day in any zone', () => {
    const chore = makeChore({ frequency: 'once', specificDate: '2026-09-25' });
    expect(buildChoreSummaryLine({ chore, t: fakeT, dayNames: DAY_NAMES, locale: 'en-US' })).toContain('date=Fri, Sep 25]');
    expect(buildChoreSummaryLine({ chore, t: fakeT, dayNames: DAY_NAMES, locale: 'de-DE' })).toContain('date=Fr., 25. Sept.]');
  });

  it('uses the dateless `onceNoDate` key when specificDate is missing', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ frequency: 'once', specificDate: undefined, points: 5 }),
      t: fakeT,
      dayNames: DAY_NAMES,
      locale: 'en-US',
    });
    expect(out).toContain('[chore-chart.choreSummary.onceNoDate]');
  });

  it('singularizes the ticket count when points === 1', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ points: 1 }),
      t: fakeT,
      dayNames: DAY_NAMES,
      locale: 'en-US',
    });
    expect(out).toContain('[chore-chart.choreSummary.ticketCountSingular count=1]');
  });

  it('pluralizes the ticket count when points !== 1', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ points: 7 }),
      t: fakeT,
      dayNames: DAY_NAMES,
      locale: 'en-US',
    });
    expect(out).toContain('[chore-chart.choreSummary.ticketCountPlural count=7]');
  });
});

describe('the days a chore starts with', () => {
  it('fills in every day for a daily chore', () => {
    expect(defaultChoreDays('daily')).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('starts weekly and every-other-week empty, so a tap turns a day on instead of off', () => {
    expect(defaultChoreDays('weekly')).toEqual([]);
    expect(defaultChoreDays('biweekly')).toEqual([]);
  });

  it('starts a one-time chore empty, since it carries a date instead of days', () => {
    expect(defaultChoreDays('once')).toEqual([]);
  });
});

describe('buildChoreSummaryLine, the days', () => {
  it('names the days a weekly chore runs on', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ frequency: 'weekly', daysOfWeek: [2, 5] }),
      t: fakeT,
      dayNames: DAY_NAMES,
      locale: 'en-US',
    });
    expect(out).toBe(
      '[chore-chart.choreSummary.weekly] · Tue, Fri · [chore-chart.timeOfDay.morning] · [chore-chart.choreSummary.ticketCountPlural count=2]',
    );
  });

  it('takes the weekday names from the locale rather than spelling them out', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ frequency: 'weekly', daysOfWeek: [1] }),
      t: fakeT,
      dayNames: ['Son', 'Mon', 'Die', 'Mit', 'Don', 'Fre', 'Sam'],
      locale: 'de-DE',
    });
    expect(out).toContain('Mon');
    expect(out).not.toContain('Tue');
  });

  it('puts the days in week order however they were tapped', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ frequency: 'weekly', daysOfWeek: [5, 0, 2] }),
      t: fakeT,
      dayNames: DAY_NAMES,
      locale: 'en-US',
    });
    expect(out).toContain('Sun, Tue, Fri');
  });

  it('leaves the days out of a chore that runs every day', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ frequency: 'daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }),
      t: fakeT,
      dayNames: DAY_NAMES,
      locale: 'en-US',
    });
    expect(out).toBe(
      '[chore-chart.choreSummary.daily] · [chore-chart.timeOfDay.morning] · [chore-chart.choreSummary.ticketCountPlural count=2]',
    );
  });

  it('names the days of a daily chore that does not run every day', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ frequency: 'daily', daysOfWeek: [1, 2, 3, 4, 5] }),
      t: fakeT,
      dayNames: DAY_NAMES,
      locale: 'en-US',
    });
    expect(out).toContain('Mon, Tue, Wed, Thu, Fri');
  });

  it('leaves the days out of a one-time chore, which shows its date', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ frequency: 'once', specificDate: '2026-06-01', daysOfWeek: [2] }),
      t: fakeT,
      dayNames: DAY_NAMES,
      locale: 'en-US',
    });
    expect(out).not.toContain('Tue');
  });
});

describe('getChoreValidationHintKind', () => {
  it('returns `enterName` when name is blank', () => {
    expect(
      getChoreValidationHintKind({
        name: '',
        rotation: 'fixed',
        scheduleHasAssignment: false,
        assigneeIdsLength: 1,
        assigneeGroupIdsLength: 0,
        hasGroups: false,
        familyReady: true,
        frequency: 'daily',
        daysOfWeekLength: 7,
      }),
    ).toBe('enterName');
  });

  it('returns `enterName` when name is whitespace only', () => {
    expect(
      getChoreValidationHintKind({
        name: '   ',
        rotation: 'fixed',
        scheduleHasAssignment: true,
        assigneeIdsLength: 2,
        assigneeGroupIdsLength: 0,
        hasGroups: false,
        familyReady: true,
        frequency: 'daily',
        daysOfWeekLength: 7,
      }),
    ).toBe('enterName');
  });

  it('returns `addPersonToSchedule` when rotation is schedule and no member is scheduled', () => {
    expect(
      getChoreValidationHintKind({
        name: 'Sweep',
        rotation: 'schedule',
        scheduleHasAssignment: false,
        assigneeIdsLength: 0,
        assigneeGroupIdsLength: 0,
        hasGroups: false,
        familyReady: true,
        frequency: 'daily',
        daysOfWeekLength: 7,
      }),
    ).toBe('addPersonToSchedule');
  });

  it('returns `addPersonToSchedule` even when assigneeIds is non-empty (schedule rotation ignores assigneeIds)', () => {
    expect(
      getChoreValidationHintKind({
        name: 'Sweep',
        rotation: 'schedule',
        scheduleHasAssignment: false,
        assigneeIdsLength: 3,
        assigneeGroupIdsLength: 0,
        hasGroups: false,
        familyReady: true,
        frequency: 'daily',
        daysOfWeekLength: 7,
      }),
    ).toBe('addPersonToSchedule');
  });

  it('returns `selectAtLeastOnePerson` when rotation is not schedule and no assignees are picked', () => {
    expect(
      getChoreValidationHintKind({
        name: 'Sweep',
        rotation: 'fixed',
        scheduleHasAssignment: false,
        assigneeIdsLength: 0,
        assigneeGroupIdsLength: 0,
        hasGroups: false,
        familyReady: true,
        frequency: 'daily',
        daysOfWeekLength: 7,
      }),
    ).toBe('selectAtLeastOnePerson');
  });

  it('returns null for a valid fixed-rotation chore', () => {
    expect(
      getChoreValidationHintKind({
        name: 'Sweep',
        rotation: 'fixed',
        scheduleHasAssignment: false,
        assigneeIdsLength: 1,
        assigneeGroupIdsLength: 0,
        hasGroups: false,
        familyReady: true,
        frequency: 'daily',
        daysOfWeekLength: 7,
      }),
    ).toBeNull();
  });

  it('returns null for a valid scheduled chore', () => {
    expect(
      getChoreValidationHintKind({
        name: 'Sweep',
        rotation: 'schedule',
        scheduleHasAssignment: true,
        assigneeIdsLength: 0,
        assigneeGroupIdsLength: 0,
        hasGroups: false,
        familyReady: true,
        frequency: 'daily',
        daysOfWeekLength: 7,
      }),
    ).toBeNull();
  });
});

describe('getChoreValidationHintKind, the days row', () => {
  const base = {
    name: 'Sweep',
    rotation: 'fixed' as const,
    scheduleHasAssignment: true,
    assigneeIdsLength: 1,
    assigneeGroupIdsLength: 0,
    hasGroups: false,
    familyReady: true,
  };

  it('asks for a day when a recurring chore has none, so it cannot be saved with an empty days row', () => {
    expect(getChoreValidationHintKind({ ...base, frequency: 'weekly', daysOfWeekLength: 0 })).toBe('selectAtLeastOneDay');
    expect(getChoreValidationHintKind({ ...base, frequency: 'biweekly', daysOfWeekLength: 0 })).toBe('selectAtLeastOneDay');
    expect(getChoreValidationHintKind({ ...base, frequency: 'daily', daysOfWeekLength: 0 })).toBe('selectAtLeastOneDay');
  });

  it('is happy once one day is on', () => {
    expect(getChoreValidationHintKind({ ...base, frequency: 'weekly', daysOfWeekLength: 1 })).toBeNull();
  });

  it('never asks a one-time chore for days, since it carries a date', () => {
    expect(getChoreValidationHintKind({ ...base, frequency: 'once', daysOfWeekLength: 0 })).toBeNull();
  });

  it('leaves the day question to the grid when the chore is on a schedule', () => {
    expect(getChoreValidationHintKind({ ...base, rotation: 'schedule', frequency: 'weekly', daysOfWeekLength: 0 })).toBeNull();
  });

  it('asks who does the chore before it asks which days', () => {
    expect(getChoreValidationHintKind({ ...base, assigneeIdsLength: 0, frequency: 'weekly', daysOfWeekLength: 0 })).toBe('selectAtLeastOnePerson');
  });
});

describe('chores handed to a group', () => {
  const stamp = '2026-01-01T00:00:00.000Z';
  const kids = { id: 'kids', name: 'Kids', memberIds: ['ann', 'ben', 'cal'], createdAt: stamp, updatedAt: stamp };
  const solo = { id: 'solo', name: 'Just Ann', memberIds: ['ann'], createdAt: stamp, updatedAt: stamp };
  const members = ['ann', 'ben', 'cal'].map((id) => ({ id, name: id.toUpperCase(), color: '#000000', createdAt: stamp, updatedAt: stamp }));
  const base = { rotation: 'rotate-weekly' as const, schedule: {}, groupSchedule: {}, assigneeIds: [], assigneeGroupIds: ['kids'], groups: [kids, solo] };

  it('accepts a group with no people picked, and asks for a person or group when there is neither', () => {
    const args = { name: 'Dishes', rotation: 'fixed' as const, scheduleHasAssignment: true, assigneeIdsLength: 0, familyReady: true, frequency: 'daily' as const, daysOfWeekLength: 7 };
    expect(getChoreValidationHintKind({ ...args, assigneeIdsLength: 1, assigneeGroupIdsLength: 0, hasGroups: false, familyReady: false })).toBe('familyNotReady');
    expect(getChoreValidationHintKind({ ...args, assigneeGroupIdsLength: 1, hasGroups: true })).toBeNull();
    expect(getChoreValidationHintKind({ ...args, assigneeGroupIdsLength: 0, hasGroups: true })).toBe('selectAtLeastOnePersonOrGroup');
    expect(getChoreValidationHintKind({ ...args, assigneeGroupIdsLength: 0, hasGroups: false })).toBe('selectAtLeastOnePerson');
  });

  it('keeps a chosen rotation for one group of several people', () => {
    expect(finalizeChoreAssignment(base)).toEqual({ assigneeIds: [], assigneeGroupIds: ['kids'], rotation: 'rotate-weekly' });
  });

  it('keeps a chosen rotation for a group of one, since the group can grow', () => {
    expect(finalizeChoreAssignment({ ...base, assigneeGroupIds: ['solo'] }).rotation).toBe('rotate-weekly');
  });

  it('still falls back to fixed for one person picked directly', () => {
    expect(finalizeChoreAssignment({ ...base, assigneeIds: ['ann'], assigneeGroupIds: [] }).rotation).toBe('fixed');
  });

  it('saves a schedule from its rows, never from the ticked groups, and no group field when none has a row', () => {
    const scheduled = finalizeChoreAssignment({ ...base, rotation: 'schedule', schedule: { ann: [1], ben: [] } });
    expect(scheduled).toEqual({ assigneeIds: ['ann'], rotation: 'schedule', schedule: { ann: [1] } });
    expect(finalizeChoreAssignment({ ...base, assigneeIds: ['ann', 'ben'], assigneeGroupIds: [] })).toEqual({ assigneeIds: ['ann', 'ben'], rotation: 'rotate-weekly' });
  });

  it('saves a group row as the group, and drops a row with no days', () => {
    const scheduled = finalizeChoreAssignment({ ...base, assigneeGroupIds: [], rotation: 'schedule', schedule: { cal: [6] }, groupSchedule: { kids: [1, 3], solo: [] } });
    expect(scheduled).toEqual({ assigneeIds: ['cal'], assigneeGroupIds: ['kids'], rotation: 'schedule', schedule: { cal: [6] }, groupSchedule: { kids: [1, 3] } });
    expect(scheduleDaysCovered({ cal: [6] }, { kids: [3, 1] })).toEqual([1, 3, 6]);
  });

  it('keeps a schedule made of one group row and nobody else', () => {
    const scheduled = finalizeChoreAssignment({ ...base, assigneeGroupIds: [], rotation: 'schedule', groupSchedule: { solo: [2] } });
    expect(scheduled).toEqual({ assigneeIds: [], assigneeGroupIds: ['solo'], rotation: 'schedule', schedule: {}, groupSchedule: { solo: [2] } });
  });

  it('asks for a person or group on an empty schedule only when the household has groups', () => {
    const args = { name: 'Dishes', rotation: 'schedule' as const, scheduleHasAssignment: false, assigneeIdsLength: 0, assigneeGroupIdsLength: 0, familyReady: true, frequency: 'daily' as const, daysOfWeekLength: 7 };
    expect(getChoreValidationHintKind({ ...args, hasGroups: true })).toBe('addPersonOrGroupToSchedule');
    expect(getChoreValidationHintKind({ ...args, hasGroups: false })).toBe('addPersonToSchedule');
  });

  it('names groups before people in a chore row and leaves out a removed group', () => {
    const chore = { assigneeIds: ['cal'], assigneeGroupIds: ['kids', 'gone'] } as ChoreDefinition;
    expect(buildChoreAssigneeLine({ chore, members, groups: [kids], unknownLabel: '?', nobodyLabel: 'Nobody yet' })).toBe('Kids, CAL');
    const empty = { assigneeIds: [] } as unknown as ChoreDefinition;
    expect(buildChoreAssigneeLine({ chore: empty, members, groups: [kids], unknownLabel: '?', nobodyLabel: 'Nobody yet' })).toBe('Nobody yet');
  });

  it('shows the rotation suffix from the expanded count', () => {
    const chore = { assigneeIds: [], assigneeGroupIds: ['kids'], rotation: 'rotate-daily' } as unknown as ChoreDefinition;
    expect(getChoreRotationSummaryKey(chore, [kids])).toBe('chore-chart.choreSummary.rotationDaily');
    expect(getChoreRotationSummaryKey({ ...chore, assigneeGroupIds: ['solo'] }, [solo])).toBeNull();
  });
});
