'use client';

import type { MouseEvent } from 'react';
import { useTranslate } from '@/i18n';
import { settingsPath } from '@/lib/settings-route';
import { timezoneLabel } from '@/lib/timezone';

/** Settings > Location & language, arriving on the time zone picker. */
export const PICK_TIMEZONE_HREF = settingsPath({ kind: 'defaults', page: 'location' }, { highlight: 'location.timezone' });

interface NoTimezoneBannerProps {
  /**
   * The household's zone and whether it was saved; while it was not, the zone
   * is the hub's own, which every screen runs on until one is picked. Null
   * (still loading) shows nothing.
   */
  zone: { timezone: string; saved: boolean } | null;
  /** Runs before the link is followed, e.g. to save the editor first. */
  onPick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  className?: string;
}

/**
 * Shown above the editor canvas and on the Preview window while no time zone
 * is saved. Both show the hub's clock then, which is often UTC, and the parent
 * would otherwise only learn that on the Location page they have no reason to
 * open. There is no dismiss: picking a zone is what makes it go away.
 */
export default function NoTimezoneBanner({ zone, onPick, className = '' }: NoTimezoneBannerProps) {
  const t = useTranslate('core');
  if (!zone || zone.saved) return null;
  return (
    <div
      role="status"
      data-testid="no-timezone-banner"
      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-[12.5px] leading-snug text-hs-text-body ${className}`}
      style={{
        borderColor: 'color-mix(in srgb, var(--hs-warning) 45%, transparent)',
        // Mixed into the panel colour rather than laid over whatever is behind,
        // so it reads the same over the editor's canvas and a black wall.
        background: 'color-mix(in srgb, var(--hs-warning) 10%, var(--hs-bg-panel))',
      }}
    >
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-hs-warning" />
      <span className="min-w-0 flex-1">
        <b className="font-semibold text-hs-text-primary">{t('noTimezone.title')}</b>{' '}
        {t('noTimezone.body', { zone: timezoneLabel(zone.timezone) })}
      </span>
      <a
        href={PICK_TIMEZONE_HREF}
        onClick={onPick}
        className="shrink-0 whitespace-nowrap rounded-md bg-hs-warning px-2.5 py-1.5 text-xs font-semibold text-[#1b1200] hover:brightness-110"
      >
        {t('noTimezone.action')}
      </a>
    </div>
  );
}
