'use client';

import { useTranslate, type TranslateFn } from '@/i18n';
import { settingsPlaceText } from '@/lib/settings-route';
import type { PersonRow } from '@/lib/calendar-people';
import { MemberBadge } from '../shared/MemberBadge';

/**
 * Shared presentation atoms for the person views (family grid, free time):
 * the initials avatar and the "nobody configured yet" hint. The data model
 * lives in `calendar-people.ts`; these are its on-screen counterparts, so
 * a third person view starts from the same pieces instead of a copy.
 */

/** Avatar circle for a person row: initials on the person's color. Callers
 *  pre-scale `fontSize` for their density; longer initials (two names that
 *  share a letter) shrink a step inside the circle (`MemberBadge`). */
export function PersonAvatar({ row, size, fontSize }: { row: PersonRow; size: number; fontSize: number }) {
  return <MemberBadge aria-hidden="true" initials={row.initials} color={row.color} size={size} fontSize={fontSize} />;
}

/** "Add people in Settings > Family" hint under a person view with nobody configured. */
export function PeopleHint({ fontSize, padding, t }: { fontSize: number; padding: string; t: TranslateFn }) {
  const tCore = useTranslate('core');
  return (
    <div data-people-hint="" style={{ flexShrink: 0, padding, fontSize: fontSize * 1.05, color: 'var(--cal-text-tertiary)' }}>
      {t('fullscreen-calendar.peopleHint', { place: settingsPlaceText(tCore, 'family') })}
    </div>
  );
}
