'use client';

import { useCallback } from 'react';
import { useFormattingLocale } from '@/i18n';
import { copyTimeWords } from '@/lib/meal-plan-words';
import type { TimeFormat } from '@/types/config';

/** The household's day, zone and clock a copy's time is said in; each surface reads its own. */
export interface CopyClock {
  todayISO: string;
  zone: string | undefined;
  timeFormat: TimeFormat;
}

/**
 * Say when Mealie answered (`copyTimeWords`), in the surface's language:
 * "3:10 PM", or "Thursday 3:10 PM" for a copy from another day. For a line
 * that takes the time as a function, such as the editor's shopping list.
 */
export function useCopyTimeWords({ todayISO, zone, timeFormat }: CopyClock): (at: number) => string {
  const locale = useFormattingLocale();
  return useCallback(
    (at: number) => copyTimeWords(at, { todayISO, zone, locale, hour12: timeFormat === '12h' }),
    [todayISO, zone, locale, timeFormat],
  );
}

/**
 * When Mealie last answered, for a "last updated" line on the phone or in
 * the editor; null with no time to say.
 */
export function useCopyTime(updatedAt: number | null | undefined, clock: CopyClock): string | null {
  const words = useCopyTimeWords(clock);
  return updatedAt ? words(updatedAt) : null;
}
