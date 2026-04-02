'use client';

import type { WordOfDayConfig, ModuleStyle } from '@/types/config';
import { getDayOfYear } from 'date-fns';
import ModuleWrapper from './ModuleWrapper';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';
import { TEXT_OPACITY, hasAccentColor } from '@/lib/constants';

interface WordOfDayModuleProps {
  config: WordOfDayConfig;
  style: ModuleStyle;
}

const WORDS = [
  { word: "Ephemeral", pos: "adjective", definition: "Lasting for a very short time" },
  { word: "Serendipity", pos: "noun", definition: "The occurrence of events by chance in a happy way" },
  { word: "Eloquent", pos: "adjective", definition: "Fluent or persuasive in speaking or writing" },
  { word: "Resilient", pos: "adjective", definition: "Able to recover quickly from difficulties" },
  { word: "Ubiquitous", pos: "adjective", definition: "Present, appearing, or found everywhere" },
  { word: "Sanguine", pos: "adjective", definition: "Optimistic or positive, especially in a difficult situation" },
  { word: "Mellifluous", pos: "adjective", definition: "Sweet or musical; pleasant to hear" },
  { word: "Perspicacious", pos: "adjective", definition: "Having a ready insight into things; shrewd" },
  { word: "Ineffable", pos: "adjective", definition: "Too great or extreme to be expressed in words" },
  { word: "Luminous", pos: "adjective", definition: "Full of or shedding light; bright or shining" },
  { word: "Petrichor", pos: "noun", definition: "The pleasant smell of earth after rain" },
  { word: "Quintessential", pos: "adjective", definition: "Representing the most perfect example of a quality" },
  { word: "Ethereal", pos: "adjective", definition: "Extremely delicate and light, seeming heavenly" },
  { word: "Wanderlust", pos: "noun", definition: "A strong desire to travel and explore the world" },
  { word: "Halcyon", pos: "adjective", definition: "Denoting a period of time that was idyllically happy and peaceful" },
  { word: "Sonorous", pos: "adjective", definition: "Imposingly deep and full in sound" },
  { word: "Verdant", pos: "adjective", definition: "Green with grass or other rich vegetation" },
  { word: "Ebullient", pos: "adjective", definition: "Cheerful and full of energy" },
  { word: "Sublime", pos: "adjective", definition: "Of outstanding spiritual or intellectual worth" },
  { word: "Incandescent", pos: "adjective", definition: "Emitting light as a result of being heated; passionate" },
  { word: "Gossamer", pos: "noun", definition: "Something very light, thin, and insubstantial" },
  { word: "Aplomb", pos: "noun", definition: "Self-confidence or assurance, especially in a demanding situation" },
  { word: "Zenith", pos: "noun", definition: "The highest point reached; the peak or culmination" },
  { word: "Euphoria", pos: "noun", definition: "A feeling of intense excitement and happiness" },
  { word: "Cascade", pos: "noun", definition: "A small waterfall, or a succession of stages" },
  { word: "Resplendent", pos: "adjective", definition: "Impressive and attractive; brilliant" },
  { word: "Labyrinthine", pos: "adjective", definition: "Like a labyrinth; irregular and twisting" },
  { word: "Cerulean", pos: "adjective", definition: "Deep sky blue in color" },
  { word: "Transcendent", pos: "adjective", definition: "Beyond or above the range of normal experience" },
  { word: "Iridescent", pos: "adjective", definition: "Showing luminous colors that change when seen from different angles" },
];

export default function WordOfDayModule({ config, style }: WordOfDayModuleProps) {
  const dayOfYear = getDayOfYear(new Date());
  const entry = WORDS[dayOfYear % WORDS.length];
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, 0.10);
  const accentColor = config.accentColor ?? '#000000';
  const hasAccent = hasAccentColor(accentColor);

  return (
    <ModuleWrapper style={style}>
      <div
        ref={containerRef}
        className="flex flex-col items-center justify-center h-full gap-2"
        style={{
          fontSize: `${scaledFontSize}px`,
          ...(hasAccent && { background: `linear-gradient(135deg, ${accentColor}15, ${accentColor}08)` }),
        }}
      >
        {config.showDividers !== false && (
          <div className="w-12 h-0.5 rounded-full" style={{ backgroundColor: hasAccent ? accentColor : 'rgba(255,255,255,0.15)', opacity: TEXT_OPACITY.secondary }} />
        )}
        <p className="font-extralight" style={{ fontSize: '2.8em', lineHeight: 1.1 }}>{entry.word}</p>
        <div className="w-16 h-px" style={{ backgroundColor: hasAccent ? accentColor : 'rgba(255,255,255,0.15)', opacity: TEXT_OPACITY.tertiary }} />
        <p className="italic" style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.tertiary }}>{entry.pos}</p>
        <p className="text-center italic leading-relaxed" style={{ fontSize: '0.95em', opacity: TEXT_OPACITY.secondary }}>
          {entry.definition}
        </p>
        {config.showDividers !== false && (
          <div className="w-12 h-0.5 rounded-full" style={{ backgroundColor: hasAccent ? accentColor : 'rgba(255,255,255,0.15)', opacity: TEXT_OPACITY.secondary }} />
        )}
      </div>
    </ModuleWrapper>
  );
}
