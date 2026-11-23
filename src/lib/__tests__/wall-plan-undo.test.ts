import { beforeEach, describe, expect, it } from 'vitest';
import type { PlannedMeal } from '@/types/config';
import {
  WALL_PLAN_UNDO_MS,
  forgetWallPlanUndo,
  noteWallPlanChange,
  resetWallPlanUndo,
  wallPlanUndo,
  type WallPlanUndo,
} from '../wall-plan-undo';

const AT = Date.parse('2026-11-18T18:00:00.000Z');
const stirFry: PlannedMeal = { date: '2026-11-18', slot: 'dinner', mealId: 'stir-fry', time: '18:15' };
const tacos: PlannedMeal = { date: '2026-11-18', slot: 'dinner', mealId: 'tacos', time: '18:15' };
const swap: WallPlanUndo = { date: '2026-11-18', slot: 'dinner', before: stirFry, after: tacos };

describe('wall plan Undo tickets', () => {
  beforeEach(() => {
    resetWallPlanUndo();
  });

  it('hands back the change a ticket stands for', () => {
    const ticket = noteWallPlanChange(swap, AT);
    expect(ticket).toMatch(/^[0-9a-f]{24}$/);
    expect(wallPlanUndo(ticket, AT + 1_000)).toEqual(swap);
  });

  it('keeps a free day and an emptied day as they were', () => {
    const planned = noteWallPlanChange({ ...swap, before: null }, AT);
    const emptied = noteWallPlanChange({ ...swap, after: null }, AT);
    expect(wallPlanUndo(planned, AT)).toMatchObject({ before: null, after: tacos });
    expect(wallPlanUndo(emptied, AT)).toMatchObject({ before: stirFry, after: null });
  });

  it('gives every change its own ticket', () => {
    const first = noteWallPlanChange(swap, AT);
    const second = noteWallPlanChange({ ...swap, date: '2026-11-19' }, AT);
    expect(second).not.toBe(first);
    expect(wallPlanUndo(first, AT)?.date).toBe('2026-11-18');
    expect(wallPlanUndo(second, AT)?.date).toBe('2026-11-19');
  });

  it('still answers at the last moment of its life, and not after', () => {
    const ticket = noteWallPlanChange(swap, AT);
    expect(wallPlanUndo(ticket, AT + WALL_PLAN_UNDO_MS)).toEqual(swap);
    expect(wallPlanUndo(ticket, AT + WALL_PLAN_UNDO_MS + 1)).toBeNull();
    // Once swept it stays gone, even when asked with an earlier clock.
    expect(wallPlanUndo(ticket, AT)).toBeNull();
  });

  it('lets go of old tickets when a new change is noted', () => {
    const old = noteWallPlanChange(swap, AT);
    const fresh = noteWallPlanChange(swap, AT + WALL_PLAN_UNDO_MS + 1);
    expect(wallPlanUndo(old, AT)).toBeNull();
    expect(wallPlanUndo(fresh, AT + WALL_PLAN_UNDO_MS + 1)).toEqual(swap);
  });

  it('works once: a forgotten ticket answers nothing', () => {
    const ticket = noteWallPlanChange(swap, AT);
    forgetWallPlanUndo(ticket);
    expect(wallPlanUndo(ticket, AT)).toBeNull();
  });

  it('answers nothing for a ticket it never gave', () => {
    noteWallPlanChange(swap, AT);
    expect(wallPlanUndo('0123456789abcdef01234567', AT)).toBeNull();
  });
});
