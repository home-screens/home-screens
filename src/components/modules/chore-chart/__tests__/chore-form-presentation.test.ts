import { describe, it, expect } from 'vitest';
import type { ChoreDefinition } from '@/types/config';
import type { TranslateFn } from '@/i18n';
import {
  buildChoreSummaryLine,
  getChoreValidationHintKind,
} from '../chore-form-presentation';

// Translate stub that echoes the key plus any vars in a predictable shape so
// assertions can verify both the chosen key and the param plumbing without
// pulling in the real provider.
const fakeT: TranslateFn = (key, vars) => {
  if (!vars) return `[${key}]`;
  const parts = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',');
  return `[${key} ${parts}]`;
};
const fakeTModules: TranslateFn = (key) => `M:${key}`;

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
      tModules: fakeTModules,
    });
    expect(out).toBe(
      '[choreChartModal.choreSummary.daily] · M:chore-chart.timeOfDay.morning · [choreChartModal.choreSummary.ticketCountPlural count=2]',
    );
  });

  it('routes weekly frequency through the choreSummary.weekly key', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ frequency: 'weekly', points: 3, timeOfDay: 'afternoon' }),
      t: fakeT,
      tModules: fakeTModules,
    });
    expect(out).toContain('[choreChartModal.choreSummary.weekly]');
    expect(out).toContain('M:chore-chart.timeOfDay.afternoon');
  });

  it('routes biweekly frequency through the choreSummary.biweekly key', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ frequency: 'biweekly', points: 4 }),
      t: fakeT,
      tModules: fakeTModules,
    });
    expect(out).toContain('[choreChartModal.choreSummary.biweekly]');
  });

  it('uses the dated `once` key when specificDate is set', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ frequency: 'once', specificDate: '2026-06-01', points: 1 }),
      t: fakeT,
      tModules: fakeTModules,
    });
    expect(out).toBe(
      '[choreChartModal.choreSummary.once date=2026-06-01] · M:chore-chart.timeOfDay.morning · [choreChartModal.choreSummary.ticketCountSingular count=1]',
    );
  });

  it('uses the dateless `onceNoDate` key when specificDate is missing', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ frequency: 'once', specificDate: undefined, points: 5 }),
      t: fakeT,
      tModules: fakeTModules,
    });
    expect(out).toContain('[choreChartModal.choreSummary.onceNoDate]');
  });

  it('singularizes the ticket count when points === 1', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ points: 1 }),
      t: fakeT,
      tModules: fakeTModules,
    });
    expect(out).toContain('[choreChartModal.choreSummary.ticketCountSingular count=1]');
  });

  it('pluralizes the ticket count when points !== 1', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ points: 7 }),
      t: fakeT,
      tModules: fakeTModules,
    });
    expect(out).toContain('[choreChartModal.choreSummary.ticketCountPlural count=7]');
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
      }),
    ).toBeNull();
  });
});
