import { describe, it, expect } from 'vitest';
import { getOrderedDays, getNextPlannedMeal } from '@/lib/meal-constants';
import type { SavedMeal, PlannedMeal, MealSlotType } from '@/types/config';

// ── Helpers ──────────────────────────────────────────────────────────

function meal(id: string, name: string): SavedMeal {
  return { id, name };
}

function planned(date: string, slot: MealSlotType, mealId: string): PlannedMeal {
  return { date, slot, mealId };
}

const ALL_SLOTS: MealSlotType[] = ['breakfast', 'lunch', 'snack', 'dinner'];
const STANDARD_SLOTS: MealSlotType[] = ['breakfast', 'lunch', 'dinner'];

// ── getOrderedDays ───────────────────────────────────────────────────

describe('getOrderedDays', () => {
  it('returns Sun–Sat for sunday start', () => {
    expect(getOrderedDays('sunday')).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('returns Mon–Sun for monday start', () => {
    expect(getOrderedDays('monday')).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});

// ── getNextPlannedMeal ───────────────────────────────────────────────

describe('getNextPlannedMeal', () => {
  const spaghetti = meal('m1', 'Spaghetti');
  const pancakes = meal('m2', 'Pancakes');

  it('returns the current slot as "now" when its meal is planned and the window is active', () => {
    const plan = [planned('2026-09-01', 'breakfast', 'm1')];
    const result = getNextPlannedMeal('2026-09-01', 7 * 60 + 30, plan, [spaghetti], ALL_SLOTS);
    expect(result).toMatchObject({ slot: 'breakfast', date: '2026-09-01', dayOffset: 0, context: 'now' });
    expect(result?.name).toBe('Spaghetti');
  });

  it('skips an empty active slot and finds a later slot today as "upcoming"', () => {
    // 9:40 PM pattern from the audit, shifted: at 9am with nothing at breakfast
    // but dinner planned, the card must say dinner, not "nothing planned".
    const plan = [planned('2026-09-01', 'dinner', 'm1')];
    const result = getNextPlannedMeal('2026-09-01', 9 * 60, plan, [spaghetti], ALL_SLOTS);
    expect(result).toMatchObject({ slot: 'dinner', dayOffset: 0, context: 'upcoming' });
  });

  it('walks past an empty tomorrow-breakfast to tomorrow lunch', () => {
    // Late evening, tomorrow has lunch and dinner planned but no breakfast.
    const plan = [
      planned('2026-09-02', 'lunch', 'm1'),
      planned('2026-09-02', 'dinner', 'm2'),
    ];
    const result = getNextPlannedMeal('2026-09-01', 21 * 60, plan, [spaghetti, pancakes], ALL_SLOTS);
    expect(result).toMatchObject({ slot: 'lunch', date: '2026-09-02', dayOffset: 1, context: 'tomorrow' });
  });

  it('labels meals beyond tomorrow as "future"', () => {
    const plan = [planned('2026-09-04', 'dinner', 'm1')];
    const result = getNextPlannedMeal('2026-09-01', 12 * 60, plan, [spaghetti], ALL_SLOTS);
    expect(result).toMatchObject({ slot: 'dinner', date: '2026-09-04', dayOffset: 3, context: 'future' });
  });

  it('ignores slots whose window already ended today', () => {
    // Breakfast planned today but it is 3pm — today\'s breakfast is over.
    const plan = [planned('2026-09-01', 'breakfast', 'm1')];
    expect(getNextPlannedMeal('2026-09-01', 15 * 60, plan, [spaghetti], ALL_SLOTS)).toBeNull();
  });

  it('ignores disabled slots', () => {
    const plan = [planned('2026-09-01', 'snack', 'm1')];
    expect(getNextPlannedMeal('2026-09-01', 12 * 60, plan, [spaghetti], STANDARD_SLOTS)).toBeNull();
  });

  it('returns null when nothing is planned in the coming week', () => {
    const plan = [planned('2026-09-09', 'dinner', 'm1')]; // 8 days out
    expect(getNextPlannedMeal('2026-09-01', 12 * 60, plan, [spaghetti], ALL_SLOTS)).toBeNull();
  });

  it('returns null for an empty slot list', () => {
    expect(getNextPlannedMeal('2026-09-01', 12 * 60, [], [], [])).toBeNull();
  });
});
