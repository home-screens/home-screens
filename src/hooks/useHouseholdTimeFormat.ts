'use client';

import { useFormattingLocale } from '@/i18n';
import { householdTimeFormat } from '@/lib/clock-time';
import type { TimeFormat } from '@/types/config';

/**
 * The household's 12/24-hour clock for a component: `timeFormat` (the saved
 * setting, often a module prop) when there is one, else the formatting
 * language's own hour cycle. See `householdTimeFormat`.
 */
export function useHouseholdTimeFormat(timeFormat: TimeFormat | undefined): TimeFormat {
  return householdTimeFormat(timeFormat, useFormattingLocale());
}
