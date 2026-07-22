'use client';

import { TEXT_OPACITY } from '@/lib/constants';
import { useTranslate } from '@/i18n';
import CountdownTimer from './CountdownTimer';
import type { CountdownViewProps } from './types';

export default function CountdownAllView({ events, config, scale, basePx }: CountdownViewProps) {
  const t = useTranslate('modules');

  if (events.length === 0) {
    return <p style={{ fontSize: '0.875em', opacity: TEXT_OPACITY.dim }}>{t('countdown.noUpcoming')}</p>;
  }

  return (
    <>
      {events.map((event) => (
        <div key={event.id} className="flex flex-col items-center" style={{ gap: `${0.3 * scale}em` }}>
          <p
            className="font-medium truncate w-full text-center"
            style={{ fontSize: `${Math.max(12, 14 * scale)}px`, opacity: TEXT_OPACITY.secondary }}
          >
            {event.name}
            {event.time.past && !event.stayingForToday && <span className="ml-1 font-normal">{t('countdown.agoSuffix')}</span>}
          </p>
          {event.stayingForToday ? (
            <p
              className="font-semibold text-center"
              style={{ fontSize: `${basePx}px`, opacity: TEXT_OPACITY.heading }}
            >
              {t('countdown.todayBang')}
            </p>
          ) : (
            <CountdownTimer time={event.time} config={config} fontSizePx={basePx} />
          )}
        </div>
      ))}
    </>
  );
}
