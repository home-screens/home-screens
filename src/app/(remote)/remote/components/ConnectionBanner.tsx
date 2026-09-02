'use client';

import { useTranslate } from '@/i18n';

export type ConnectionBannerMode = 'unreachable' | 'restart-service' | 'reboot';

/**
 * Sticky banner for "the phone can't talk to the hub". This is about the
 * hub, never a display: a dark kitchen panel is reported in the hero as
 * Offline / Last seen, while this banner means the remote itself has no
 * answer from Home Screens. The two restart modes cover the window right
 * after a user-initiated restart or reboot, when silence is expected.
 */
export default function ConnectionBanner({ mode = 'unreachable' }: { mode?: ConnectionBannerMode }) {
  const t = useTranslate('remote');
  const reconnecting = mode !== 'unreachable';
  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="connection-banner"
      data-mode={mode}
      className={`sticky top-0 z-20 backdrop-blur-sm border-b px-4 py-2 ${
        reconnecting
          ? 'bg-hs-accent/15 border-hs-accent/30'
          : 'bg-hs-danger/20 border-hs-danger/30'
      }`}
    >
      <p className={`text-sm text-center ${reconnecting ? 'text-hs-accent-hover' : 'text-hs-danger'}`}>
        {mode === 'restart-service'
          ? t('connectionBanner.restarting')
          : mode === 'reboot'
            ? t('connectionBanner.rebooting')
            : t('connectionBanner.unreachable')}
      </p>
    </div>
  );
}
