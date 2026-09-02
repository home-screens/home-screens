'use client';

import { useTranslate } from '@/i18n';

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
    <div className="mx-4 mt-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-hs-warning">
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
      <button
        onClick={onDismiss}
        className="shrink-0 text-hs-text-faint active:text-hs-text-secondary transition-colors p-1"
        aria-label={t('updateAvailable.dismissAriaLabel')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
