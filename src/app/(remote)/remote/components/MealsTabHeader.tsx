'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { fromISODate } from '@/lib/meal-constants';
import TabHeader, { GearButton, HEADER_BUTTON } from './TabHeader';

/** Between the heading, Rate dinner and the gear (the header's own gap). */
const GAP = 8;
/** The gear, and Rate dinner when it is only a star. */
const BUTTON = 44;
/**
 * Rate dinner with its words, less the words: borders, padding, the star and
 * the space after it. Kept tight so the longest words ("Abendessen bewerten",
 * "Avondeten beoordelen") still fit beside the heading on a 390 px phone.
 */
const RATE_PAD_START = 8;
const RATE_PAD_END = 10;
const RATE_STAR_GAP = 4;
const RATE_CHROME = 2 + RATE_PAD_START + 15 + RATE_STAR_GAP + RATE_PAD_END;

interface MealsTabHeaderProps {
  /** The household's day, `YYYY-MM-DD`: the weekday is the one at home, not on the phone. */
  todayISO: string;
  onOpenSettings: () => void;
  onRateDinner: () => void;
}

export default function MealsTabHeader({ todayISO, onOpenSettings, onRateDinner }: MealsTabHeaderProps) {
  const locale = useFormattingLocale();
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const rateLabel = tCore('mealRatings.dinner');

  // Rate dinner says what it is in words wherever the words fit. A long
  // language on a narrow phone has no room for them beside the heading
  // ("Abendessen bewerten" at 360px), and there the star stands alone, the
  // same size as the gear. The widths are measured, not guessed per language.
  const row = useRef<HTMLDivElement>(null);
  const day = useRef<HTMLSpanElement>(null);
  const heading = useRef<HTMLSpanElement>(null);
  const words = useRef<HTMLSpanElement>(null);
  const [roomy, setRoomy] = useState(true);
  useLayoutEffect(() => {
    const parts = [row.current, day.current, heading.current, words.current];
    if (parts.some((part) => !part)) return;
    const width = (el: HTMLElement | null) => Math.ceil(el?.getBoundingClientRect().width ?? 0);
    const fit = () => {
      const text = Math.max(width(day.current), width(heading.current));
      setRoomy(text + GAP + RATE_CHROME + width(words.current) + GAP + BUTTON <= (row.current?.clientWidth ?? 0));
    };
    // Each part is watched, so a font that lands late is measured again. The
    // first reading comes from the observer itself, before the page is drawn.
    const watch = new ResizeObserver(fit);
    for (const part of parts) if (part) watch.observe(part);
    return () => watch.disconnect();
  }, []);

  return (
    <div ref={row}>
      <TabHeader
        eyebrow={fromISODate(todayISO).toLocaleDateString(locale, { weekday: 'long' })}
        eyebrowRef={day}
        title={<span style={{ whiteSpace: 'nowrap' }}>{t('mealsTab.header')}</span>}
        titleRef={heading}
        actions={(
          <>
            <button
              type="button"
              data-testid="meals-rate-dinner"
              aria-label={rateLabel}
              onClick={onRateDinner}
              className="press-scale"
              style={{
                ...HEADER_BUTTON,
                position: 'relative',
                overflow: 'hidden',
                color: 'var(--hs-text-body)',
                gap: RATE_STAR_GAP,
                fontSize: 13,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                ...(roomy ? { padding: `0 ${RATE_PAD_END}px 0 ${RATE_PAD_START}px` } : { width: BUTTON }),
              }}
            >
              <Star size={roomy ? 15 : 18} strokeWidth={0} fill="var(--hs-warning)" aria-hidden="true" style={{ flex: 'none' }} />
              {/* Kept when it is not shown, so its width can still be measured. */}
              <span ref={words} style={roomy ? undefined : { position: 'absolute', left: 0, top: 0, visibility: 'hidden' }}>{rateLabel}</span>
            </button>
            <GearButton
              label={t('mealsTab.settingsButtonAriaLabel')}
              title={t('mealsTab.settingsButtonTitle')}
              onClick={onOpenSettings}
            />
          </>
        )}
      />
    </div>
  );
}
