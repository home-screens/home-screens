import { describe, it, expect } from 'vitest';
import type { SavedMeal, PlannedMeal } from '@/types/config';
import {
  assignPlanSlot,
  setPlanSlotText,
  clearPlanSlot,
  setPlanSlotTime,
  clearPlanWeek,
  shufflePlanWeek,
  copyPlanWeek,
  upsertSavedMeal,
  removeSavedMeal,
  toggleSavedMealFavorite,
  restorePlanEntries,
  replacesDish,
  suggestPlanWeek,
  placePlanWeek,
  plannedEntriesOfMeal,
  restoreSavedMeal,
} from '../meal-plan-actions';

const WEEK = ['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19'];
const NEXT_WEEK = ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26'];

const meal = (id: string, extra: Partial<SavedMeal> = {}): SavedMeal =>
  ({ id, name: id, ...extra }) as SavedMeal;

const entry = (date: string, mealId: string, extra: Partial<PlannedMeal> = {}): PlannedMeal =>
  ({ date, slot: 'dinner', mealId, ...extra }) as PlannedMeal;

function find(plan: PlannedMeal[], date: string) {
  return plan.find((p) => p.date === date && p.slot === 'dinner');
}

describe('assignPlanSlot', () => {
  it('fills an empty slot', () => {
    const next = assignPlanSlot([], '2026-09-15', 'dinner', 'm-1');
    expect(next).toHaveLength(1);
    expect(find(next, '2026-09-15')?.mealId).toBe('m-1');
  });

  it('replaces the meal already in that slot without duplicating it', () => {
    const next = assignPlanSlot([entry('2026-09-15', 'm-1')], '2026-09-15', 'dinner', 'm-2');
    expect(next).toHaveLength(1);
    expect(find(next, '2026-09-15')?.mealId).toBe('m-2');
  });

  /* Swapping the meal should not silently drop a serving time somebody set. */
  it("keeps the existing entry's own fields", () => {
    const plan = [entry('2026-09-15', 'm-1', { time: '18:30', notes: 'double batch' })];
    const swapped = find(assignPlanSlot(plan, '2026-09-15', 'dinner', 'm-2'), '2026-09-15');
    expect(swapped).toMatchObject({ mealId: 'm-2', time: '18:30', notes: 'double batch' });
  });

  it('leaves the other slots and days alone', () => {
    const plan = [entry('2026-09-14', 'm-1'), { ...entry('2026-09-15', 'm-1'), slot: 'lunch' } as PlannedMeal];
    const next = assignPlanSlot(plan, '2026-09-15', 'dinner', 'm-2');
    expect(next).toHaveLength(3);
    expect(next.filter((p) => p.slot === 'lunch')).toHaveLength(1);
  });
});

describe('setPlanSlotText', () => {
  it('puts a typed meal in an empty slot', () => {
    const next = setPlanSlotText([], '2026-09-15', 'dinner', 'Tacos');
    expect(next).toHaveLength(1);
    expect(find(next, '2026-09-15')).toMatchObject({ customText: 'Tacos' });
  });

  it('trims what was typed', () => {
    const next = setPlanSlotText([], '2026-09-15', 'dinner', '  Tacos  ');
    expect(find(next, '2026-09-15')?.customText).toBe('Tacos');
  });

  /* Typing over a slot that held a saved meal replaces the meal: the slot
   * shows one dinner, not a library meal with a note stuck to it. */
  it('drops the saved meal it replaces', () => {
    const plan = [entry('2026-09-15', 'm-1', { time: '18:30' })];
    const updated = find(setPlanSlotText(plan, '2026-09-15', 'dinner', 'Takeaway'), '2026-09-15')!;
    expect(updated.customText).toBe('Takeaway');
    expect('mealId' in updated).toBe(false);
    expect(updated.time).toBe('18:30');
  });

  it('empties the slot when the text is blank', () => {
    const plan = [{ date: '2026-09-15', slot: 'dinner', customText: 'Tacos' } as PlannedMeal];
    expect(setPlanSlotText(plan, '2026-09-15', 'dinner', '   ')).toEqual([]);
  });

  it('is a no-op when blank text meets an empty slot', () => {
    const plan = [entry('2026-09-16', 'm-1')];
    expect(setPlanSlotText(plan, '2026-09-15', 'dinner', '')).toBe(plan);
  });

  it('leaves the other slots and days alone', () => {
    const plan = [entry('2026-09-14', 'm-1'), { ...entry('2026-09-15', 'm-1'), slot: 'lunch' } as PlannedMeal];
    const next = setPlanSlotText(plan, '2026-09-15', 'dinner', 'Tacos');
    expect(next).toHaveLength(3);
    expect(next.filter((p) => p.slot === 'lunch')).toHaveLength(1);
  });
});

describe('replacesDish', () => {
  /* A dish changed for another in the picker gets a notice with Undo; a pick
   * that fills an empty place, or picks what is there, has nothing to undo. */
  it('is a change when the main dish was another meal or typed text', () => {
    expect(replacesDish(entry('2026-09-15', 'm-1'), null, { mealId: 'm-2' })).toBe(true);
    expect(replacesDish(entry('2026-09-15', 'm-1'), null, { customText: 'Tacos' })).toBe(true);
    const typed = { date: '2026-09-15', slot: 'dinner', customText: 'Tacos' } as PlannedMeal;
    expect(replacesDish(typed, null, { mealId: 'm-2' })).toBe(true);
    expect(replacesDish(typed, null, { customText: 'Pizza' })).toBe(true);
  });

  it('is no change when nothing was there or the same dish is picked again', () => {
    expect(replacesDish(undefined, null, { mealId: 'm-1' })).toBe(false);
    expect(replacesDish(entry('2026-09-15', 'm-1'), null, { mealId: 'm-1' })).toBe(false);
    const typed = { date: '2026-09-15', slot: 'dinner', customText: 'Tacos' } as PlannedMeal;
    expect(replacesDish(typed, null, { customText: ' Tacos ' })).toBe(false);
    // A dinner planned as only its sides has no main dish to replace.
    const sidesOnly = { date: '2026-09-15', slot: 'dinner', courses: [{ kind: 'side', mealId: 's-1' }] } as PlannedMeal;
    expect(replacesDish(sidesOnly, null, { mealId: 'm-1' })).toBe(false);
  });

  it('looks at the course being swapped', () => {
    const withSide = entry('2026-09-15', 'm-1', { courses: [{ kind: 'side', mealId: 's-1' }] });
    expect(replacesDish(withSide, 0, { mealId: 's-2' })).toBe(true);
    expect(replacesDish(withSide, 0, { mealId: 's-1' })).toBe(false);
    expect(replacesDish(withSide, 1, { mealId: 's-2' })).toBe(false);
  });
});

describe('clearPlanSlot', () => {
  it('empties one slot and nothing else', () => {
    const plan = [entry('2026-09-15', 'm-1'), entry('2026-09-16', 'm-2')];
    const next = clearPlanSlot(plan, '2026-09-15', 'dinner');
    expect(next.map((p) => p.date)).toEqual(['2026-09-16']);
  });
});

describe('setPlanSlotTime', () => {
  it('sets a time', () => {
    const next = setPlanSlotTime([entry('2026-09-15', 'm-1')], '2026-09-15', 'dinner', '18:30');
    expect(find(next, '2026-09-15')?.time).toBe('18:30');
  });

  /* A stored "" is not a valid HH:MM and fails isValidTimeString on the next
   * read, so both a cleared value and an empty string remove the field. */
  it.each([undefined, ''])('removes the field when cleared with %p', (value) => {
    const plan = [entry('2026-09-15', 'm-1', { time: '18:30' })];
    const updated = find(setPlanSlotTime(plan, '2026-09-15', 'dinner', value), '2026-09-15')!;
    expect('time' in updated).toBe(false);
  });

  it('is a no-op on a slot with no meal in it', () => {
    const plan = [entry('2026-09-15', 'm-1')];
    expect(setPlanSlotTime(plan, '2026-09-16', 'dinner', '18:30')).toBe(plan);
  });
});

describe('clearPlanWeek', () => {
  it('drops the viewed week and keeps every other', () => {
    const plan = [entry('2026-09-15', 'm-1'), entry('2026-09-22', 'm-2')];
    expect(clearPlanWeek(plan, WEEK).map((p) => p.date)).toEqual(['2026-09-22']);
  });
});

describe('shufflePlanWeek', () => {
  it('fills the week from the library and leaves other weeks alone', () => {
    const plan = [entry('2026-09-22', 'm-keep')];
    const next = shufflePlanWeek(plan, [meal('m-1'), meal('m-2')], ['dinner'], WEEK);
    expect(next.filter((p) => WEEK.includes(p.date)).length).toBeGreaterThan(0);
    expect(next.filter((p) => p.date === '2026-09-22')).toEqual([entry('2026-09-22', 'm-keep')]);
  });

  it('is a no-op for a household with no saved meals', () => {
    const plan = [entry('2026-09-15', 'm-1')];
    expect(shufflePlanWeek(plan, [], ['dinner'], WEEK)).toBe(plan);
  });

  it('reads the other weeks for where a meal with no slot tag belongs, not the week it replaces', () => {
    const plan = [
      entry('2026-09-08', 'popcorn', { slot: 'snack' }),
      // Planned as a dinner in the week being replaced: not counted.
      entry('2026-09-15', 'popcorn'),
    ];
    const next = shufflePlanWeek(plan, [meal('popcorn'), meal('tacos')], ['snack', 'dinner'], WEEK, () => 0);
    const week = next.filter((p) => WEEK.includes(p.date));
    expect(week.filter((p) => p.mealId === 'popcorn').every((p) => p.slot === 'snack')).toBe(true);
    expect(week.filter((p) => p.slot === 'snack')).toHaveLength(7);
    expect(week.filter((p) => p.slot === 'dinner').map((p) => p.mealId)).toEqual(['tacos']);
  });
});

describe('suggestPlanWeek and placePlanWeek', () => {
  /* Both surfaces run an edit twice (for the screen, then for the save): the
   * pick is made once outside it, and the edit only places it, so the week
   * shown is the week saved. */
  it('picks the week once, and placing it gives the same plan every time', () => {
    const plan = [entry('2026-09-22', 'm-keep'), entry('2026-09-15', 'm-old')];
    const library = [meal('m-1'), meal('m-2'), meal('m-3')];
    const picked = suggestPlanWeek(plan, library, ['dinner'], WEEK);
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.every((p) => WEEK.includes(p.date))).toBe(true);
    const shown = placePlanWeek(plan, WEEK, picked);
    const saved = placePlanWeek(plan, WEEK, picked);
    expect(saved).toEqual(shown);
    expect(saved.filter((p) => p.date === '2026-09-22')).toEqual([entry('2026-09-22', 'm-keep')]);
    expect(saved.some((p) => p.mealId === 'm-old')).toBe(false);
  });

  it('puts the week back as it was for Undo', () => {
    const before = [entry('2026-09-15', 'm-old', { time: '18:30' })];
    const plan = [entry('2026-09-22', 'm-keep'), ...before];
    const suggested = placePlanWeek(plan, WEEK, suggestPlanWeek(plan, [meal('m-1')], ['dinner'], WEEK));
    expect(placePlanWeek(suggested, WEEK, before)).toEqual(plan);
  });
});

describe('copyPlanWeek', () => {
  it("restamps the source week's entries onto the target week", () => {
    const plan = [entry('2026-09-15', 'm-1')];
    const next = copyPlanWeek(plan, WEEK, NEXT_WEEK);
    // Same weekday, one week on: Tuesday to Tuesday.
    expect(find(next, '2026-09-22')?.mealId).toBe('m-1');
    expect(find(next, '2026-09-15')?.mealId).toBe('m-1');
  });

  it('is a no-op when the source week is empty', () => {
    const plan = [entry('2026-09-22', 'm-1')];
    expect(copyPlanWeek(plan, WEEK, NEXT_WEEK)).toBe(plan);
  });

  it('replaces whatever the target week held', () => {
    const plan = [entry('2026-09-15', 'm-new'), entry('2026-09-22', 'm-old')];
    const next = copyPlanWeek(plan, WEEK, NEXT_WEEK);
    expect(next.filter((p) => p.date === '2026-09-22')).toHaveLength(1);
    expect(find(next, '2026-09-22')?.mealId).toBe('m-new');
  });
});

describe('upsertSavedMeal', () => {
  it('adds a meal the library has never seen', () => {
    expect(upsertSavedMeal([meal('m-1')], meal('m-2')).map((m) => m.id)).toEqual(['m-1', 'm-2']);
  });

  it('replaces a meal in place rather than appending a second copy', () => {
    const next = upsertSavedMeal([meal('m-1'), meal('m-2')], meal('m-1', { name: 'Renamed' }));
    expect(next.map((m) => m.id)).toEqual(['m-1', 'm-2']);
    expect(next[0].name).toBe('Renamed');
  });
});

describe('removeSavedMeal', () => {
  /* A plan entry whose meal no longer exists renders as a slot the user cannot
   * clear, so both halves have to move together. */
  it('removes the meal and every plan entry pointing at it', () => {
    const next = removeSavedMeal(
      [meal('m-1'), meal('m-2')],
      [entry('2026-09-15', 'm-1'), entry('2026-09-16', 'm-2')],
      'm-1',
    );
    expect(next.savedMeals.map((m) => m.id)).toEqual(['m-2']);
    expect(next.plan.map((p) => p.mealId)).toEqual(['m-2']);
  });
});

describe('plannedEntriesOfMeal', () => {
  it('finds the meals a dish is the main dish of or a course in', () => {
    const main = entry('2026-09-15', 'm-1');
    const side = entry('2026-09-16', 'm-2', { courses: [{ kind: 'side', mealId: 'm-1' }] });
    const other = entry('2026-09-17', 'm-3');
    expect(plannedEntriesOfMeal([main, side, other], 'm-1')).toEqual([main, side]);
  });
});

describe('restoreSavedMeal', () => {
  /* Undo of a delete: the meal and every meal it was in come back as they
   * were, the side included, over whatever was planned there since. */
  it('puts the meal back in the library and on every day it was planned', () => {
    const library = [meal('m-1'), meal('m-2')];
    const plan = [
      entry('2026-09-15', 'm-1', { time: '18:30' }),
      entry('2026-09-16', 'm-2', { courses: [{ kind: 'side', mealId: 'm-1' }] }),
    ];
    const entries = plannedEntriesOfMeal(plan, 'm-1');
    const deleted = removeSavedMeal(library, plan, 'm-1');
    expect(deleted.plan).toEqual([entry('2026-09-16', 'm-2')]);
    const back = restoreSavedMeal(deleted.savedMeals, deleted.plan, library[0], entries);
    expect(back.savedMeals.map((m) => m.id).sort()).toEqual(['m-1', 'm-2']);
    expect([...back.plan].sort((a, b) => a.date.localeCompare(b.date))).toEqual(plan);
  });
});

describe('toggleSavedMealFavorite', () => {
  it('stars and unstars', () => {
    const starred = toggleSavedMealFavorite([meal('m-1')], 'm-1');
    expect(starred[0].isFavorite).toBe(true);
    expect(toggleSavedMealFavorite(starred, 'm-1')[0].isFavorite).toBe(false);
  });

  it('leaves the other meals alone', () => {
    const next = toggleSavedMealFavorite([meal('m-1'), meal('m-2')], 'm-2');
    expect(next[0].isFavorite).toBeUndefined();
  });
});

describe('restorePlanEntries', () => {
  /* Undo of a deletion or a cleared week. Rebuilding the entries from date,
   * slot and meal would drop the serving time and notes they carried. */
  it('puts entries back whole, replacing what took their slots since', () => {
    const removed = [entry('2026-09-15', 'm-1', { time: '18:30', notes: 'grandma is coming' })];
    const meanwhile = [entry('2026-09-15', 'm-2'), entry('2026-09-16', 'm-3')];
    const next = restorePlanEntries(meanwhile, removed);
    expect(next).toEqual([entry('2026-09-16', 'm-3'), removed[0]]);
    expect(find(next, '2026-09-15')?.time).toBe('18:30');
  });
});
