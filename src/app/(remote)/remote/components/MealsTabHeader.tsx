'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import { useFormattingLocale, useTranslate } from '@/i18n';

/** Between the heading, Rate Dinner and the gear. */
const GAP = 8;
/** The gear, and Rate Dinner when it is only a star. */
const BUTTON = 40;
/** Rate Dinner with its words, less the words: borders, padding, the star and the space after it. */
const RATE_CHROME = 2 + 10 + 15 + 6 + 12;

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

  // Rate Dinner says what it is in words wherever the words fit. A long
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
    <div ref={row} style={{ padding: '12px 0 4px', display: 'flex', alignItems: 'flex-start', gap: GAP }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--hs-text-faint)', whiteSpace: 'nowrap' }}>
          <span ref={day} style={{ display: 'inline-block' }}>
            {new Date(todayISO + 'T12:00:00').toLocaleDateString(locale, { weekday: 'long' })}
          </span>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--hs-text-primary)', margin: 0, whiteSpace: 'nowrap' }}>
          <span ref={heading} style={{ display: 'inline-block' }}>{t('mealsTab.header')}</span>
        </h2>
      </div>
      <button
        type="button"
        data-testid="meals-rate-dinner"
        aria-label={rateLabel}
        onClick={onRateDinner}
        className="press-scale"
        style={{
          position: 'relative',
          overflow: 'hidden',
          flex: 'none',
          height: BUTTON,
          borderRadius: 10,
          border: '1px solid var(--hs-border)',
          background: 'var(--hs-bg-panel)',
          color: 'var(--hs-text-body)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          ...(roomy ? { padding: '0 12px 0 10px' } : { width: BUTTON, padding: 0 }),
        }}
      >
        <Star size={roomy ? 15 : 18} strokeWidth={0} fill="#f59e0b" aria-hidden="true" style={{ flex: 'none' }} />
        {/* Kept when it is not shown, so its width can still be measured. */}
        <span ref={words} style={roomy ? undefined : { position: 'absolute', left: 0, top: 0, visibility: 'hidden' }}>{rateLabel}</span>
      </button>
      <button
        type="button"
        onClick={onOpenSettings}
        style={{
          flex: 'none',
          width: BUTTON,
          height: BUTTON,
          borderRadius: 10,
          border: '1px solid var(--hs-border)',
          background: 'var(--hs-bg-panel)',
          color: 'var(--hs-text-muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'inherit',
        }}
        aria-label={t('mealsTab.settingsButtonAriaLabel')}
        title={t('mealsTab.settingsButtonTitle')}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  );
}
