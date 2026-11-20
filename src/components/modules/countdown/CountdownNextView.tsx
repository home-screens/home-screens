'use client';

import { TEXT_OPACITY } from '@/lib/constants';
import { useTranslate } from '@/i18n';
import { useFitFontSize } from '@/hooks/useFitFontSize';
import CountdownTimer from './CountdownTimer';
import type { CountdownViewProps } from './types';

/**
 * Single-event view. Every size here is a plain multiple of `scale`, with no
 * view-local multiplier: an earlier `basePx * 1.3` on the ticking value made
 * scale non-comparable across views (scale 3.4 on Next rendered larger than
 * scale 4 on All). Migration v6 folded that 1.3 into the stored `scale`.
 *
 * Because the migration multiplies the stored value, EVERY expression reading
 * `scale` inflates by 1.3 — not just the one the multiplier used to live on.
 * The two coefficients below were rebased accordingly so migrated countdowns
 * keep their current rendered size:
 *   - heading 18 -> 14, matching the All view exactly (14 x 1.3 = 18.2, so
 *     existing headings shift by ~1%). The floor also drops 14 -> 12 to match
 *     All; it only binds below scale 0.86, where both views now agree.
 *   - gap 0.6 -> 0.46 (0.6 / 1.3), preserving the heading-to-timer spacing.
 *     Still roomier than the All view's 0.3 — that is hero-vs-list-item
 *     breathing room, and gap is layout, not the size of the countdown.
 *
 * If you ever add another `scale` term here, it must be expressed in
 * post-migration units. Do not reintroduce a view-local multiplier.
 *
 * The event shrinks to fit its box, as the All view's list does: a long row
 * of flip cards at a large scale used to be cut off at the card's edges. An
 * event that already fits is drawn exactly as before.
 */
/** Where the timer stops shrinking: flip labels are 0.3em, so below this they cannot be read. */
const MIN_TIMER_PX = 20;

export default function CountdownNextView({ events, config, scale, basePx, textPx }: CountdownViewProps) {
  const t = useTranslate('modules');
  const event = events[0];
  // Everything that changes how wide or tall the event draws starts the fit again.
  const fitKey = `${event?.id ?? ''}|${event?.name ?? ''}|${event?.stayingForToday ?? false}|${config.format ?? 'flip'}|${config.precision ?? 'auto'}|${scale}|${textPx}`;
  const { boxRef, contentRef, fontSize } = useFitFontSize(basePx, fitKey, Math.min(basePx, MIN_TIMER_PX));
  const fit = fontSize / basePx;

  if (!event) {
    return <p style={{ fontSize: '0.875em', opacity: TEXT_OPACITY.dim }}>{t('countdown.noUpcoming')}</p>;
  }

  return (
    <div ref={boxRef} className="flex flex-col items-center justify-center h-full w-full">
      <div ref={contentRef} className="flex flex-col items-center" style={{ gap: `${0.46 * scale * fit}em` }}>
        <p
          className="font-semibold text-center"
          style={{ fontSize: `${Math.max(12, 14 * scale * fit)}px`, opacity: TEXT_OPACITY.heading }}
        >
          {event.name}
          {event.time.past && !event.stayingForToday && <span className="ml-1 font-normal">{t('countdown.agoSuffix')}</span>}
        </p>
        {event.stayingForToday ? (
          <p
            className="font-semibold text-center"
            style={{ fontSize: `${fontSize}px`, opacity: TEXT_OPACITY.heading }}
          >
            {t('countdown.todayBang')}
          </p>
        ) : (
          <CountdownTimer time={event.time} config={config} fontSizePx={fontSize} />
        )}
      </div>
    </div>
  );
}
