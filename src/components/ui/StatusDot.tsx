'use client';

import { useTranslate } from '@/i18n';

export default function StatusDot({ configured }: { configured: boolean }) {
  const t = useTranslate('editor');
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span
        className={`w-1.5 h-1.5 rounded-full inline-block ${
          configured ? 'bg-hs-success' : 'bg-hs-text-faint'
        }`}
      />
      <span className={configured ? 'text-hs-success' : 'text-hs-text-faint'}>
        {configured ? t('statusDot.configured') : t('statusDot.notConfigured')}
      </span>
    </span>
  );
}
