import { describe, it, expect } from 'vitest';
import { mealieProblem, mealieRangeWanted, mealieWeekHeld, type MealieWireBlock } from '../meal-sources';

/** The weeks every answer carries: the week before this one through three after it. */
const SHARED = { start: '2026-09-14', end: '2026-10-18' };

function fromMealie(status: MealieWireBlock['status'], range = SHARED) {
  const mealie: MealieWireBlock = { status, plan: [], meals: [], range, fetchedAt: status === 'failed' ? null : 1 };
  return { source: 'mealie' as const, mealie };
}

const LOCAL = { source: 'local' as const, mealie: null };

describe('mealieRangeWanted', () => {
  /* The phone asked for the week in view only, so paging back to the first
   * week of the copy never brought in the week before it, and Copy Last Week
   * stayed hidden. */
  it('asks for the week before too, at the edge of the copy', () => {
    expect(mealieRangeWanted(fromMealie('ok'), { start: '2026-09-14', end: '2026-09-20' }))
      .toEqual({ start: '2026-09-07', end: '2026-09-20' });
  });

  it('asks for a week past the copy with the week before it', () => {
    expect(mealieRangeWanted(fromMealie('ok'), { start: '2026-11-02', end: '2026-11-08' }))
      .toEqual({ start: '2026-10-26', end: '2026-11-08' });
  });

  it('asks nothing when the copy holds both weeks', () => {
    expect(mealieRangeWanted(fromMealie('ok'), { start: '2026-09-21', end: '2026-09-27' })).toBeNull();
  });

  /* The phone asked whatever Mealie's state, and the hub's answer for days
   * it held no copy of replaced every week on screen. */
  it('asks nothing while Mealie is not answering', () => {
    const past = { start: '2026-11-02', end: '2026-11-08' };
    expect(mealieRangeWanted(fromMealie('stale'), past)).toBeNull();
    expect(mealieRangeWanted(fromMealie('failed'), past)).toBeNull();
    expect(mealieRangeWanted({ source: 'mealie', mealie: null }, past)).toBeNull();
  });

  it('asks nothing for the plan Home Screens keeps', () => {
    expect(mealieRangeWanted(LOCAL, { start: '2026-11-02', end: '2026-11-08' })).toBeNull();
  });
});

describe('mealieWeekHeld', () => {
  it('holds the weeks inside the copy, whatever Mealie is doing', () => {
    expect(mealieWeekHeld(fromMealie('ok'), { start: '2026-09-14', end: '2026-09-20' })).toBe(true);
    expect(mealieWeekHeld(fromMealie('stale'), { start: '2026-10-12', end: '2026-10-18' })).toBe(true);
  });

  it('does not hold a week outside the copy', () => {
    expect(mealieWeekHeld(fromMealie('stale'), { start: '2026-10-19', end: '2026-10-25' })).toBe(false);
  });

  it('holds every week of the plan Home Screens keeps, and with no Mealie copy at all', () => {
    expect(mealieWeekHeld(LOCAL, { start: '2027-01-04', end: '2027-01-10' })).toBe(true);
    expect(mealieWeekHeld({ source: 'mealie', mealie: null }, { start: '2027-01-04', end: '2027-01-10' })).toBe(true);
  });
});

describe('mealieProblem', () => {
  it('says what the family can do about each failure', () => {
    expect(mealieProblem('not-set-up')).toBe('not-connected');
    expect(mealieProblem('key-rejected')).toBe('token');
    expect(mealieProblem('unreachable')).toBe('unreachable');
    expect(mealieProblem('upstream')).toBe('unreachable');
    expect(mealieProblem(undefined)).toBe('unreachable');
  });

  /* A wrong address or an old Mealie read as Mealie not answering, and the
   * family was told to try again in a moment, which never fixes it. */
  it('sends a wrong address or an old Mealie to Settings, not to waiting', () => {
    expect(mealieProblem('bad-address')).toBe('setup');
    expect(mealieProblem('not-mealie')).toBe('setup');
    expect(mealieProblem('too-old')).toBe('setup');
  });
});
