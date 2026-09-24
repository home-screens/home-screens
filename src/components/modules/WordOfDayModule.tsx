'use client';

import type { WordOfDayConfig, ModuleStyle } from '@/types/config';
import { TEXT_OPACITY, ink } from '@/lib/constants';
import { AccentDivider } from './shared/AccentDivider';
import { ScaledAccentContent } from './shared/ScaledAccentContent';
import { useTranslate, useLocale } from '@/i18n';
import { useTZClock } from '@/hooks/useTZClock';
import { getWordsForLocale, getWordEntryForDate } from './word-of-day-data';

interface WordOfDayModuleProps {
  config: WordOfDayConfig;
  style: ModuleStyle;
  /** Household zone: the word changes at its midnight, not the Pi's. */
  timezone?: string;
}

export default function WordOfDayModule({ config, style, timezone }: WordOfDayModuleProps) {
  const t = useTranslate('modules');
  const locale = useLocale();
  // Shifted clock: its local getters read the household calendar, which is
  // what the day-of-year pick wants. Ticking means a screen that never rotates
  // still turns over at midnight.
  const today = useTZClock(timezone, 60_000);
  const words = getWordsForLocale(locale);
  const entry = getWordEntryForDate(words, today);

  return (
    <ScaledAccentContent
      style={style}
      config={config}
      minScale={0.10}
      className="flex flex-col items-center justify-center h-full gap-2"
    >
      {({ accentColor, hasAccent }) => (
        <>
          {config.showDividers !== false && (
            <AccentDivider accentColor={accentColor} hasAccent={hasAccent} />
          )}
          <p className="font-extralight" style={{ fontSize: '2.8em', lineHeight: 1.1 }}>{entry.word}</p>
          <div className="w-16 h-px" style={{ backgroundColor: hasAccent ? accentColor : ink(0.15), opacity: TEXT_OPACITY.tertiary }} />
          <p className="italic" style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.tertiary }}>{t(`word-of-day.pos.${entry.pos}`)}</p>
          <p className="text-center italic leading-relaxed" style={{ fontSize: '0.95em', opacity: TEXT_OPACITY.secondary }}>
            {entry.definition}
          </p>
          {config.showDividers !== false && (
            <AccentDivider accentColor={accentColor} hasAccent={hasAccent} />
          )}
        </>
      )}
    </ScaledAccentContent>
  );
}
