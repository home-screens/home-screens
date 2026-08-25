import { describe, it, expect } from 'vitest';
import { buildExtrasIndex, hasExtras, EMPTY_EXTRAS } from '@/lib/calendar-extras';
import type { ChoreDefinition, ChoreMember } from '@/types/config';

const members: ChoreMember[] = [
  { id: 'm1', name: 'Ella', emoji: '🦊', color: '#db2777' },
  { id: 'm2', name: 'Owen', emoji: '🐻', color: '#ea580c' },
];
const chores: ChoreDefinition[] = [
  { id: 'c1', name: 'Feed the dog', emoji: '🐶', points: 1, frequency: 'daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime', assigneeIds: ['m1', 'm2'], rotation: 'fixed' },
  { id: 'c2', name: 'Trash', emoji: '🗑️', points: 2, frequency: 'weekly', daysOfWeek: [1], timeOfDay: 'evening', assigneeIds: ['m2'], rotation: 'fixed' },
];
// 2026-08-24 is a Monday, 2026-08-25 a Tuesday.
const dates = ['2026-08-24', '2026-08-25'];

describe('buildExtrasIndex', () => {
  it('aggregates chores per day: total, done, and who has one', () => {
    const index = buildExtrasIndex({
      dates,
      meals: null,
      chores: { members, chores, completions: [{ choreId: 'c1', memberId: 'm1', date: '2026-08-24' }] },
    });
    expect(index.byDate['2026-08-24'].chores).toEqual({ total: 3, done: 1, memberIds: ['m1', 'm2'] });
    expect(index.byDate['2026-08-25'].chores).toEqual({ total: 2, done: 0, memberIds: ['m1', 'm2'] });
    expect(index.members.m1).toEqual({ name: 'Ella', color: '#db2777', emoji: '🦊' });
  });

  it('lists planned meals for enabled slots only, in slot order, with custom text', () => {
    const index = buildExtrasIndex({
      dates,
      meals: {
        settings: { enabledSlots: ['breakfast', 'dinner'] },
        savedMeals: [{ id: 'meal-1', name: 'Tacos', emoji: '🌮' }],
        plan: [
          { date: '2026-08-24', slot: 'dinner', mealId: 'meal-1' },
          { date: '2026-08-24', slot: 'breakfast', customText: 'Cereal' },
          { date: '2026-08-24', slot: 'lunch', customText: 'Hidden: slot disabled' },
          { date: '2026-08-25', slot: 'dinner', mealId: 'missing' },
        ],
      },
      chores: null,
    });
    expect(index.byDate['2026-08-24'].meals).toEqual([
      { slot: 'breakfast', name: 'Cereal', emoji: undefined },
      { slot: 'dinner', name: 'Tacos', emoji: '🌮' },
    ]);
    expect(index.byDate['2026-08-24'].chores).toBeNull();
    // A plan entry pointing at a deleted meal draws nothing.
    expect(index.byDate['2026-08-25']).toBeUndefined();
  });

  it('hasExtras reports whether any listed date has content', () => {
    const index = buildExtrasIndex({ dates, meals: null, chores: { members, chores, completions: [] } });
    expect(hasExtras(index, dates)).toBe(true);
    expect(hasExtras(index, ['2026-09-01'])).toBe(false);
    expect(hasExtras(EMPTY_EXTRAS, dates)).toBe(false);
  });
});
