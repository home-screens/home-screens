'use client';

import { Lock } from 'lucide-react';
import { useTranslate, useFormattingLocale } from '@/i18n';

/** Format a YYYY-MM-DD string as a friendly long date for banner copy. */
function formatLongDate(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(y, m - 1, d));
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const msPerDay = 86_400_000;
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / msPerDay);
}

interface ChoreHistoryBannerProps {
  /** Currently-viewed date as YYYY-MM-DD. */
  viewingDate: string;
  /** Real "today" as YYYY-MM-DD, flipped at midnight by the parent. */
  realToday: string;
  /** When true, the viewer may backdate edits on this day (admins, or non-past days). */
  canEdit: boolean;
}

/**
 * History banner shown when the user has navigated away from today. Admins (and
 * anyone editing a non-past day) see a warning-styled "editing a past day"
 * notice; kids viewing a past day see a locked/read-only notice instead.
 */
export default function ChoreHistoryBanner({ viewingDate, realToday, canEdit }: ChoreHistoryBannerProps) {
  const locale = useFormattingLocale();
  const t = useTranslate('remote');

  const daysAgo = Math.max(1, daysBetween(viewingDate, realToday));

  return canEdit ? (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        background: 'color-mix(in srgb, var(--hs-warning) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--hs-warning) 25%, transparent)',
        borderRadius: 10,
        marginBottom: 10,
        fontSize: 12,
        color: 'var(--hs-warning)',
        lineHeight: 1.4,
      }}
    >
      <span>
        {t('choresTab.history.editingPrefix')}
        <strong style={{ fontWeight: 700 }}>{formatLongDate(viewingDate, locale)}</strong>
        {daysAgo === 1
          ? t('choresTab.history.editingDaysAgoSingular')
          : t('choresTab.history.editingDaysAgoPlural', { n: daysAgo })}
        {t('choresTab.history.editingNote')}
      </span>
    </div>
  ) : (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        background: 'var(--hs-bg-hover)',
        border: '1px solid var(--hs-border)',
        borderRadius: 10,
        marginBottom: 10,
        fontSize: 12,
        color: 'var(--hs-text-muted)',
        lineHeight: 1.4,
      }}
    >
      <Lock size={14} strokeWidth={2.25} aria-hidden="true" />
      <span>{t('choresTab.history.lockedMessage')}</span>
    </div>
  );
}
