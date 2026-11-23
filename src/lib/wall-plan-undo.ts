import { randomBytes } from 'crypto';
import type { MealSlotType, PlannedMeal } from '@/types/config';

/**
 * The menu changes walls made in the last few minutes, so a wall's Undo can
 * put a meal back as it was. The display token may only make the one-meal
 * changes in `meal-plan-wall.ts`; putting back an arbitrary meal is not one
 * of them, so the hub keeps what was there and hands the wall a ticket for
 * it. Memory only: a restart forgets, which leaves the change in place for
 * the phone to fix, the safe way round.
 *
 * Kept on `globalThis` because separate routes can hold separate copies of
 * this module.
 */

/** How long after a change the wall may undo it. Longer than the sheet shows its Undo. */
export const WALL_PLAN_UNDO_MS = 5 * 60_000;

export interface WallPlanUndo {
  date: string;
  slot: MealSlotType;
  /** The meal before the change; null when the day was free. */
  before: PlannedMeal | null;
  /** The meal as the change left it; null when it emptied the day. */
  after: PlannedMeal | null;
}

type Ledger = Map<string, WallPlanUndo & { at: number }>;

const key = Symbol.for('home-screens.wall-plan-undo.v1');
const globals = globalThis as typeof globalThis & { [key]?: Ledger };
const ledger: Ledger = globals[key] ??= new Map();

function sweep(now: number): void {
  for (const [ticket, entry] of ledger) if (now - entry.at > WALL_PLAN_UNDO_MS) ledger.delete(ticket);
}

/** Remember a change and answer the ticket its Undo quotes. */
export function noteWallPlanChange(change: WallPlanUndo, now = Date.now()): string {
  sweep(now);
  const ticket = randomBytes(12).toString('hex');
  ledger.set(ticket, { ...change, at: now });
  return ticket;
}

/** The change a ticket stands for, while it can still be undone. */
export function wallPlanUndo(ticket: string, now = Date.now()): WallPlanUndo | null {
  sweep(now);
  const entry = ledger.get(ticket);
  if (!entry) return null;
  const { at: _at, ...change } = entry;
  void _at;
  return change;
}

/** It was undone (or can no longer be): a ticket works once. */
export function forgetWallPlanUndo(ticket: string): void {
  ledger.delete(ticket);
}

/** Tests only. */
export function resetWallPlanUndo(): void {
  ledger.clear();
}
