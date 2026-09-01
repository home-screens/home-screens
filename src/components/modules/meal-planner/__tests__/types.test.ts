import { describe, it, expect } from 'vitest';
import { getOrderedDays, resolveMeal, getActiveSlot, getNextPlannedMeal } from '@/lib/meal-constants';
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

// ── resolveMeal ──────────────────────────────────────────────────────

describe('resolveMeal', () => {
  const savedMeals = [meal('a', 'Oatmeal'), meal('b', 'Pasta')];

  it('returns null when plan is undefined', () => {
    expect(resolveMeal('2026-04-01', 'breakfast', undefined, savedMeals)).toBeNull();
  });

  it('returns null when savedMeals is undefined', () => {
    expect(resolveMeal('2026-04-01', 'breakfast', [planned('2026-04-01', 'breakfast', 'a')], undefined)).toBeNull();
  });

  it('returns null when no planned entry matches day/slot', () => {
    expect(resolveMeal('2026-04-02', 'lunch', [planned('2026-04-01', 'breakfast', 'a')], savedMeals)).toBeNull();
  });

  it('returns null when mealId references nonexistent saved meal', () => {
    expect(resolveMeal('2026-04-01', 'breakfast', [planned('2026-04-01', 'breakfast', 'missing')], savedMeals)).toBeNull();
  });

  it('returns the saved meal when plan entry matches', () => {
    const result = resolveMeal('2026-04-01', 'breakfast', [planned('2026-04-01', 'breakfast', 'a')], savedMeals);
    expect(result).toEqual(savedMeals[0]);
  });

  it('returns correct meal from multiple plan entries', () => {
    const plan = [planned('2026-04-01', 'breakfast', 'a'), planned('2026-04-01', 'dinner', 'b')];
    expect(resolveMeal('2026-04-01', 'dinner', plan, savedMeals)).toEqual(savedMeals[1]);
  });

  it('returns null for empty arrays', () => {
    expect(resolveMeal('2026-04-04', 'breakfast', [], [])).toBeNull();
  });
});

// ── getActiveSlot ────────────────────────────────────────────────────

describe('getActiveSlot', () => {
  it('returns null before 5am', () => {
    expect(getActiveSlot(0, ALL_SLOTS)).toBeNull();
    expect(getActiveSlot(4, ALL_SLOTS)).toBeNull();
  });

  it('returns breakfast from 5am to 9am', () => {
    expect(getActiveSlot(5, ALL_SLOTS)).toBe('breakfast');
    expect(getActiveSlot(7, ALL_SLOTS)).toBe('breakfast');
    expect(getActiveSlot(9, ALL_SLOTS)).toBe('breakfast');
  });

  it('returns lunch from 10am to 1pm', () => {
    expect(getActiveSlot(10, ALL_SLOTS)).toBe('lunch');
    expect(getActiveSlot(12, ALL_SLOTS)).toBe('lunch');
    expect(getActiveSlot(13, ALL_SLOTS)).toBe('lunch');
  });

  it('returns snack from 2pm to 4pm', () => {
    expect(getActiveSlot(14, ALL_SLOTS)).toBe('snack');
    expect(getActiveSlot(16, ALL_SLOTS)).toBe('snack');
  });

  it('returns dinner from 5pm to 8pm', () => {
    expect(getActiveSlot(17, ALL_SLOTS)).toBe('dinner');
    expect(getActiveSlot(19, ALL_SLOTS)).toBe('dinner');
    expect(getActiveSlot(20, ALL_SLOTS)).toBe('dinner');
  });

  it('returns null after 9pm', () => {
    expect(getActiveSlot(21, ALL_SLOTS)).toBeNull();
    expect(getActiveSlot(23, ALL_SLOTS)).toBeNull();
  });

  it('skips disabled slots', () => {
    expect(getActiveSlot(15, STANDARD_SLOTS)).toBeNull(); // snack disabled, hour 15 is in snack window
    expect(getActiveSlot(10, ['dinner'])).toBeNull();      // only dinner enabled, hour 10 not in window
  });

  it('handles solo dinner slot correctly — not active at 5am', () => {
    expect(getActiveSlot(5, ['dinner'])).toBeNull();
    expect(getActiveSlot(17, ['dinner'])).toBe('dinner');
    expect(getActiveSlot(20, ['dinner'])).toBe('dinner');
    expect(getActiveSlot(21, ['dinner'])).toBeNull();
  });

  it('handles solo snack slot', () => {
    expect(getActiveSlot(13, ['snack'])).toBeNull();
    expect(getActiveSlot(14, ['snack'])).toBe('snack');
    expect(getActiveSlot(16, ['snack'])).toBe('snack');
    expect(getActiveSlot(17, ['snack'])).toBeNull();
  });

  it('returns null for empty slots array', () => {
    expect(getActiveSlot(12, [])).toBeNull();
  });
});

// ── getNextPlannedMeal ───────────────────────────────────────────────

describe('getNextPlannedMeal', () => {
  const spaghetti = meal('m1', 'Spaghetti');
  const pancakes = meal('m2', 'Pancakes');

  it('returns the current slot as "now" when its meal is planned and the window is active', () => {
    const plan = [planned('2026-09-01', 'breakfast', 'm1')];
    const result = getNextPlannedMeal('2026-09-01', 7, plan, [spaghetti], ALL_SLOTS);
    expect(result).toMatchObject({ slot: 'breakfast', date: '2026-09-01', dayOffset: 0, context: 'now' });
    expect(result?.meal.name).toBe('Spaghetti');
  });

  it('skips an empty active slot and finds a later slot today as "upcoming"', () => {
    // 9:40 PM pattern from the audit, shifted: at 9am with nothing at breakfast
    // but dinner planned, the card must say dinner, not "nothing planned".
    const plan = [planned('2026-09-01', 'dinner', 'm1')];
    const result = getNextPlannedMeal('2026-09-01', 9, plan, [spaghetti], ALL_SLOTS);
    expect(result).toMatchObject({ slot: 'dinner', dayOffset: 0, context: 'upcoming' });
  });

  it('walks past an empty tomorrow-breakfast to tomorrow lunch', () => {
    // Late evening, tomorrow has lunch and dinner planned but no breakfast.
    const plan = [
      planned('2026-09-02', 'lunch', 'm1'),
      planned('2026-09-02', 'dinner', 'm2'),
    ];
    const result = getNextPlannedMeal('2026-09-01', 21, plan, [spaghetti, pancakes], ALL_SLOTS);
    expect(result).toMatchObject({ slot: 'lunch', date: '2026-09-02', dayOffset: 1, context: 'tomorrow' });
  });

  it('labels meals beyond tomorrow as "future"', () => {
    const plan = [planned('2026-09-04', 'dinner', 'm1')];
    const result = getNextPlannedMeal('2026-09-01', 12, plan, [spaghetti], ALL_SLOTS);
    expect(result).toMatchObject({ slot: 'dinner', date: '2026-09-04', dayOffset: 3, context: 'future' });
  });

  it('ignores slots whose window already ended today', () => {
    // Breakfast planned today but it is 3pm — today\'s breakfast is over.
    const plan = [planned('2026-09-01', 'breakfast', 'm1')];
    expect(getNextPlannedMeal('2026-09-01', 15, plan, [spaghetti], ALL_SLOTS)).toBeNull();
  });

  it('ignores disabled slots', () => {
    const plan = [planned('2026-09-01', 'snack', 'm1')];
    expect(getNextPlannedMeal('2026-09-01', 12, plan, [spaghetti], STANDARD_SLOTS)).toBeNull();
  });

  it('returns null when nothing is planned in the coming week', () => {
    const plan = [planned('2026-09-09', 'dinner', 'm1')]; // 8 days out
    expect(getNextPlannedMeal('2026-09-01', 12, plan, [spaghetti], ALL_SLOTS)).toBeNull();
  });

  it('returns null for an empty slot list', () => {
    expect(getNextPlannedMeal('2026-09-01', 12, [], [], [])).toBeNull();
  });
});
