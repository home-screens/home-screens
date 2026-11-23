'use client';

import { X } from 'lucide-react';
import { useTranslate } from '@/i18n';
import IconButton from './IconButton';

interface UpdateAvailableBannerProps {
  shouldShow: boolean;
  latestVersion: string | null;
  onDismiss: () => void;
}

export default function UpdateAvailableBanner({
  shouldShow,
  latestVersion,
  onDismiss,
}: UpdateAvailableBannerProps) {
  const t = useTranslate('remote');
  if (!shouldShow || !latestVersion) return null;

  return (
    <div className="mx-4 mt-2 rounded-xl border border-hs-warning/20 bg-hs-warning/[0.06] px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-hs-warning-ink">
          {t('updateAvailable.message', { version: latestVersion })}
        </div>
        {/* Updating is an editor task (a computer on the home network); the
            phone can only point the way. The editor's too-narrow page hands
            a phone visitor the address to copy, so the link is still useful. */}
        <div className="mt-1 text-xs text-hs-text-faint">
          {t('updateAvailable.hint')}{' '}
          <a
            href="/editor/settings?page=system"
            className="text-hs-accent-hover underline underline-offset-2"
          >
            {t('updateAvailable.openEditor')}
          </a>
        </div>
      </div>
      {/* A full-size target; the negative margin keeps the banner its height. */}
      <IconButton label={t('updateAvailable.dismissAriaLabel')} onClick={onDismiss} style={{ margin: '-10px -12px -10px -6px', color: 'var(--hs-text-faint)' }}>
        <X size={16} strokeWidth={2} aria-hidden="true" />
      </IconButton>
    </div>
  );
}
