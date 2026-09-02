'use client';

import { ListChecks } from 'lucide-react';
import { useTranslate } from '@/i18n';

/**
 * What /chores shows when no display has a chore chart yet. A kid opens this
 * page from a fridge QR code, so it speaks to the kid first and points the
 * grown-up at the phone surface where chores actually get set up.
 */
export default function ChoresEmptyState() {
  const t = useTranslate('remote');
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-hs-body p-6 text-center"
      style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}
    >
      <ListChecks size={44} className="mb-4 text-hs-border-strong" aria-hidden="true" />
      <p className="max-w-xs text-base text-hs-text-body">{t('choresKidView.notConfigured')}</p>
      <a
        href="/remote"
        className="mt-6 text-sm font-medium text-hs-text-faint underline decoration-hs-border-strong underline-offset-4"
      >
        {t('choresKidView.grownUpsLink')}
      </a>
    </div>
  );
}
