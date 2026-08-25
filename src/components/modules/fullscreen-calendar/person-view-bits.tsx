'use client';

import type { TranslateFn } from '@/i18n';
import type { PersonRow } from '@/lib/calendar-people';

/**
 * Shared presentation atoms for the person views (family grid, free time):
 * the initials avatar and the "nobody configured yet" hint. The data model
 * lives in `calendar-people.ts`; these are its on-screen counterparts, so
 * a third person view starts from the same pieces instead of a copy.
 */

/** Avatar circle for a person row: initials on the person's color. Callers
 *  pre-scale `fontSize` for their density; 3+-letter initials (the
 *  source-name fallback rows) shrink a step so they still fit the circle. */
export function PersonAvatar({ row, size, fontSize }: { row: PersonRow; size: number; fontSize: number }) {
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: row.color, color: '#fff',
      fontSize: row.initials.length > 2 ? fontSize * 0.7 : fontSize, fontWeight: 700,
    }}>
      {row.initials}
    </span>
  );
}

/** "Add people in Settings" hint under a person view with nobody configured. */
export function PeopleHint({ fontSize, padding, t }: { fontSize: number; padding: string; t: TranslateFn }) {
  return (
    <div data-people-hint="" style={{ flexShrink: 0, padding, fontSize: fontSize * 1.05, color: 'var(--cal-text-tertiary)' }}>
      {t('fullscreen-calendar.peopleHint')}
    </div>
  );
}
