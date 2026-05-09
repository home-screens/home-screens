import type { MealSlotType } from '@/types/config';
import { SLOT_ORDER, SLOT_WINDOWS } from '@/lib/meal-constants';

export type NextMealLabelKey = 'now' | 'comingUp' | 'tomorrow' | 'next';

/** Get the next/current meal slot for display */
export function getNextMealSlot(
  hour: number,
  slots: MealSlotType[],
): { slot: MealSlotType; dayOffset: number; labelKey: NextMealLabelKey } {
  const activeOrder = SLOT_ORDER.filter((s) => slots.includes(s));
  if (activeOrder.length === 0) return { slot: 'breakfast', dayOffset: 0, labelKey: 'next' };

  // Currently in a slot's window → "Now"
  for (const s of activeOrder) {
    const w = SLOT_WINDOWS[s];
    if (hour >= w.start && hour < w.end) return { slot: s, dayOffset: 0, labelKey: 'now' };
  }

  // Next upcoming slot whose window hasn't started → "Coming Up"
  for (const s of activeOrder) {
    if (hour < SLOT_WINDOWS[s].start) return { slot: s, dayOffset: 0, labelKey: 'comingUp' };
  }

  // All windows passed → wrap to first slot tomorrow
  return { slot: activeOrder[0], dayOffset: 1, labelKey: 'tomorrow' };
}
