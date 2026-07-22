'use client';

import { TEXT_OPACITY } from '@/lib/constants';
import { useTranslate } from '@/i18n';
import CountdownTimer from './CountdownTimer';
import type { CountdownViewProps } from './types';

export default function CountdownNextView({ events, config, scale, basePx }: CountdownViewProps) {
  const t = useTranslate('modules');
  const event = events[0];

  if (!event) {
    return <p style={{ fontSize: '0.875em', opacity: TEXT_OPACITY.dim }}>{t('countdown.noUpcoming')}</p>;
  }

  // Use a larger scale since we have the full module area for one event
  const nextBasePx = basePx * 1.3;

  return (
    <div className="flex flex-col items-center justify-center h-full w-full">
      <div className="flex flex-col items-center" style={{ gap: `${0.6 * scale}em` }}>
        <p
          className="font-semibold text-center"
          style={{ fontSize: `${Math.max(14, 18 * scale)}px`, opacity: TEXT_OPACITY.heading }}
        >
          {event.name}
          {event.time.past && !event.stayingForToday && <span className="ml-1 font-normal">{t('countdown.agoSuffix')}</span>}
        </p>
        {event.stayingForToday ? (
          <p
            className="font-semibold text-center"
            style={{ fontSize: `${nextBasePx}px`, opacity: TEXT_OPACITY.heading }}
          >
            {t('countdown.todayBang')}
          </p>
        ) : (
          <CountdownTimer time={event.time} config={config} fontSizePx={nextBasePx} />
        )}
      </div>
    </div>
  );
}
