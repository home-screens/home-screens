import { TEXT_OPACITY } from '@/lib/constants';
import { FlipCard, FlipSeparator } from './FlipCard';
import { pad } from './countdown-utils';
import type { CountdownViewProps } from './types';

export default function CountdownAllView({ events, scale, basePx }: CountdownViewProps) {
  if (events.length === 0) {
    return <p style={{ fontSize: '0.875em', opacity: TEXT_OPACITY.dim }}>No upcoming events</p>;
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
            {event.time.past && !event.stayingForToday && <span className="ml-1 font-normal">(ago)</span>}
          </p>
          {event.stayingForToday ? (
            <p
              className="font-semibold text-center"
              style={{ fontSize: `${basePx}px`, opacity: TEXT_OPACITY.heading }}
            >
              Today!
            </p>
          ) : (
            <div className="flex items-start justify-center" style={{ fontSize: `${basePx}px`, gap: '0.15em' }}>
              {event.time.days > 0 && (
                <>
                  <FlipCard value={String(event.time.days)} label="days" />
                  <FlipSeparator />
                </>
              )}
              <FlipCard value={pad(event.time.hours)} label="hrs" />
              <FlipSeparator />
              <FlipCard value={pad(event.time.minutes)} label="min" />
              <FlipSeparator />
              <FlipCard value={pad(event.time.seconds)} label="sec" />
            </div>
          )}
        </div>
      ))}
    </>
  );
}
