'use client';

import { Lock } from 'lucide-react';
import { useTranslate, useFormattingLocale } from '@/i18n';

/** Format a YYYY-MM-DD string as a short friendly date ("Saturday, Aug 29"). */
function formatBannerDate(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date(y, m - 1, d));
}

interface ChoreHistoryBannerProps {
  /** Currently-viewed date as YYYY-MM-DD. */
  viewingDate: string;
  /** When true, the viewer may backdate edits on this day (admins, or non-past days). */
  canEdit: boolean;
}

/**
 * History banner shown when the user has navigated away from today. Admins (and
 * anyone editing a non-past day) see a warning-styled "editing a past day"
 * notice; kids viewing a past day see a locked/read-only notice instead.
 */
export default function ChoreHistoryBanner({ viewingDate, canEdit }: ChoreHistoryBannerProps) {
  const locale = useFormattingLocale();
  const t = useTranslate('remote');

  return canEdit ? (
    <div
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
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
        <strong style={{ fontWeight: 700 }}>{formatBannerDate(viewingDate, locale)}</strong>
        {t('choresTab.history.editingSuffix')}
      </span>
      <span style={{ fontSize: 11, opacity: 0.75 }}>{t('choresTab.history.editingNote')}</span>
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
