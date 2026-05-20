'use client';

import { useTranslate } from '@/i18n';

export default function ChoresEmptyState() {
  const t = useTranslate('remote');
  return (
    <div className="flex min-h-screen items-center justify-center bg-hs-body text-hs-text-faint text-sm p-6 text-center">
      {t('choresKidView.notConfigured')}
    </div>
  );
}
