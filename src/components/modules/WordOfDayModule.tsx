'use client';

import type { WordOfDayConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';
import { TEXT_OPACITY, resolveAccent } from '@/lib/constants';
import { AccentDivider } from './shared/AccentDivider';
import { useTranslate, useLocale } from '@/i18n';
import { getWordsForLocale, getWordEntryForDate } from './word-of-day-data';

interface WordOfDayModuleProps {
  config: WordOfDayConfig;
  style: ModuleStyle;
}

export default function WordOfDayModule({ config, style }: WordOfDayModuleProps) {
  const t = useTranslate('modules');
  const locale = useLocale();
  const words = getWordsForLocale(locale);
  const entry = getWordEntryForDate(words, new Date());
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, 0.10);
  const { accentColor, hasAccent, gradientStyle } = resolveAccent(config);

  return (
    <ModuleWrapper style={style}>
      <div
        ref={containerRef}
        className="flex flex-col items-center justify-center h-full gap-2"
        style={{ fontSize: `${scaledFontSize}px`, ...gradientStyle }}
      >
        {config.showDividers !== false && (
          <AccentDivider accentColor={accentColor} hasAccent={hasAccent} />
        )}
        <p className="font-extralight" style={{ fontSize: '2.8em', lineHeight: 1.1 }}>{entry.word}</p>
        <div className="w-16 h-px" style={{ backgroundColor: hasAccent ? accentColor : 'rgba(255,255,255,0.15)', opacity: TEXT_OPACITY.tertiary }} />
        <p className="italic" style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.tertiary }}>{t(`word-of-day.pos.${entry.pos}`)}</p>
        <p className="text-center italic leading-relaxed" style={{ fontSize: '0.95em', opacity: TEXT_OPACITY.secondary }}>
          {entry.definition}
        </p>
        {config.showDividers !== false && (
          <AccentDivider accentColor={accentColor} hasAccent={hasAccent} />
        )}
      </div>
    </ModuleWrapper>
  );
}
