'use client';

import { useTranslate } from '@/i18n';

export default function ConnectionBanner() {
  const t = useTranslate('remote');
  return (
    <div role="alert" aria-live="polite" className="sticky top-0 z-20 bg-hs-danger/20 backdrop-blur-sm border-b border-hs-danger/30 px-4 py-2">
      <p className="text-sm text-hs-danger text-center">
        {t('connectionBanner.unreachable')}
      </p>
    </div>
  );
}
