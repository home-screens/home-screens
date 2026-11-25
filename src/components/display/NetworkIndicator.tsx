'use client';

import { WifiOff } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useHubUnreachableSince } from '@/hooks/useHubUnreachableSince';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { formatTimeOfDay } from '@/lib/timezone';
import { householdTimeFormat } from '@/lib/clock-time';
import type { TimeFormat } from '@/types/config';
import { PAGINATION_BOTTOM_PX, PAGINATION_HIT_PX } from '@/lib/constants';

interface NetworkIndicatorProps {
  displayState: 'active' | 'dimmed' | 'asleep';
  scale: number;
  timezone?: string;
  timeFormat?: TimeFormat;
}

/**
 * The wall's own word on its connection, in the bottom corner.
 *
 * The browser losing its network shows the icon alone, as it always has. The
 * hub not answering while the network is up (the hub restarting, switched
 * off, or moved to another address) says so in words once it has lasted a
 * minute, because the screen otherwise looks normal while every card stops
 * updating, and a tap only says "That didn't save".
 */
export default function NetworkIndicator({ displayState, scale, timezone, timeFormat }: NetworkIndicatorProps) {
  const { isOnline } = useNetworkStatus();
  const silentSince = useHubUnreachableSince();
  const t = useTranslate('core');
  const locale = useFormattingLocale();

  if (displayState === 'asleep') return null;
  if (isOnline && silentSince === null) return null;

  const size = 38 * scale;
  const padding = 16 * scale;
  const icon = <WifiOff aria-hidden="true" style={{ width: size, height: size, color: '#ef4444', flexShrink: 0 }} />;

  if (!isOnline) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: padding,
          right: padding,
          zIndex: 99,
          pointerEvents: 'none',
          opacity: 0.7,
          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
        }}
      >
        {icon}
      </div>
    );
  }

  const time = formatTimeOfDay(new Date(silentSince as number), {
    timeFormat: householdTimeFormat(timeFormat, locale),
    locale,
    timezone,
  });

  return (
    <div
      role="status"
      data-testid="hub-unreachable"
      style={{
        position: 'fixed',
        // Above the screen dots, which sit centred at the foot of the wall
        // and would otherwise be covered by a sentence this wide.
        bottom: PAGINATION_BOTTOM_PX + PAGINATION_HIT_PX + 12,
        right: padding,
        zIndex: 99,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 12 * scale,
        maxWidth: `calc(100vw - ${padding * 2}px)`,
        padding: `${10 * scale}px ${18 * scale}px ${10 * scale}px ${14 * scale}px`,
        borderRadius: 999,
        background: 'rgba(0,0,0,0.72)',
        border: '1px solid rgba(239,68,68,0.45)',
        color: '#fff',
        fontSize: 26 * scale,
        fontWeight: 600,
        lineHeight: 1.25,
        boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
      }}
    >
      {icon}
      <span>{t('hubReach.lostSince', { time })}</span>
    </div>
  );
}
