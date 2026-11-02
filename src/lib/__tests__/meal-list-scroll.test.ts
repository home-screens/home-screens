import { describe, expect, it } from 'vitest';
import { mealListScrollTop, mealListSlotColumn } from '../meal-list-scroll';

/**
 * A week of days, each a 20px heading and 24px meal rows, with an 8px gap
 * between days. Returns the headings, the meal rows and where each day
 * starts and ends.
 */
function week(mealsPerDay: number[]) {
  const headings: number[] = [];
  const rows: number[] = [];
  const days: { top: number; bottom: number }[] = [];
  let y = 0;
  for (const meals of mealsPerDay) {
    const top = y;
    headings.push(y);
    y += 20;
    for (let i = 0; i < meals; i++) {
      rows.push(y);
      y += 24;
    }
    days.push({ top, bottom: y });
    y += 8;
  }
  return { headings, rows, days, height: y - 8 };
}

describe('mealListScrollTop', () => {
  it('stays at the top when the whole week fits', () => {
    const { headings, days, height } = week([1, 1, 1]);
    expect(mealListScrollTop(headings, days[2], height + 50, height)).toEqual({ top: 0, spacer: 0 });
  });

  it('puts today\'s heading at the top when the list can scroll that far', () => {
    const { headings, days, height } = week([3, 3, 3, 3, 3, 3, 3]);
    expect(mealListScrollTop(headings, days[2], 200, height)).toEqual({ top: days[2].top, spacer: 0 });
  });

  it('stops at the last reachable day heading near the end of the week, never mid-row', () => {
    // Saturday in a short module: Saturday's heading cannot reach the top
    // (the week ends too soon), and the furthest the list can scroll lands
    // inside Friday's first row. Friday's heading leads instead, with all of
    // Saturday still in view under it.
    const { headings, rows, days, height } = week([3, 3, 3, 3, 3, 3, 3]);
    const view = 250;
    const max = height - view;
    expect(days[5].top).toBeGreaterThan(max);
    expect([...headings, ...rows]).not.toContain(max);
    const { top, spacer } = mealListScrollTop(headings, days[5], view, height);
    expect(top).toBe(days[4].top);
    expect(spacer).toBe(0);
    expect(days[5].bottom - top).toBeLessThanOrEqual(view);
  });

  it('leads with the next heading and room after the week when the reachable one would cut today', () => {
    // Sunday, the last day: Friday's heading is the last the list can reach,
    // but with Friday on top Sunday's dinner falls off the bottom. Saturday's
    // heading leads, the list ending in a little blank room under Sunday.
    const { headings, days, height } = week([3, 3, 3, 3, 3, 3, 3]);
    const view = 250;
    const max = height - view;
    expect(days[4].top).toBeLessThanOrEqual(max);
    expect(days[6].bottom - days[4].top).toBeGreaterThan(view);
    const { top, spacer } = mealListScrollTop(headings, days[6], view, height);
    expect(top).toBe(days[5].top);
    expect(spacer).toBe(days[5].top - max);
    expect(top).toBeLessThanOrEqual(height + spacer - view);
    expect(days[6].bottom - top).toBeLessThanOrEqual(view);
  });

  it('keeps the blank room under one day', () => {
    const { headings, days, height } = week([3, 3, 3, 3, 9, 3, 1]);
    const view = 200;
    const { top, spacer } = mealListScrollTop(headings, days[5], view, height);
    expect(top).toBe(days[5].top);
    expect(spacer).toBeLessThan(days[5].bottom - days[5].top);
  });
});

describe('mealListSlotColumn', () => {
  const en = { full: ['Breakfast', 'Lunch', 'Dinner'], short: ['B', 'L', 'D'] };

  it('names the meal in full at the registry default size (500 px wide, 16 px type)', () => {
    const column = mealListSlotColumn(468, 16, en);
    expect(column.full).toBe(true);
    // "Breakfast" at 11.2 px fits its column.
    expect(column.widthPx).toBeGreaterThanOrEqual(Math.ceil(9 * 0.6 * 11.2));
  });

  it('makes room for the longest name the wall\'s language has', () => {
    const fr = mealListSlotColumn(600, 16, { full: ['Petit-déjeuner', 'Déjeuner', 'Dîner'], short: ['P', 'D', 'S'] });
    expect(fr.widthPx).toBeGreaterThan(mealListSlotColumn(600, 16, en).widthPx);
  });

  it('falls back to the short name in a narrow list, or before the list is measured', () => {
    expect(mealListSlotColumn(260, 16, en).full).toBe(false);
    expect(mealListSlotColumn(0, 16, en).full).toBe(false);
    // Still a column a letter reads in, at least 11 px.
    expect(mealListSlotColumn(260, 12, en).widthPx).toBeGreaterThanOrEqual(15);
  });

  it('follows the module\'s text size', () => {
    expect(mealListSlotColumn(900, 24, en).widthPx).toBeGreaterThan(mealListSlotColumn(900, 16, en).widthPx);
    // Bigger type needs a wider list before the names spell out.
    expect(mealListSlotColumn(468, 30, en).full).toBe(false);
  });
});
