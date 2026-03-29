'use client';
import type { WordOfDayConfig, ModuleStyle } from '@/types/config';
import { getDayOfYear } from 'date-fns';
import ModuleWrapper from './ModuleWrapper';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';

interface WordOfDayModuleProps {
  config: WordOfDayConfig;
  style: ModuleStyle;
}

const WORDS = [
  { word: "Ephemeral", definition: "Lasting for a very short time" },
  { word: "Serendipity", definition: "The occurrence of events by chance in a happy way" },
  { word: "Eloquent", definition: "Fluent or persuasive in speaking or writing" },
  { word: "Resilient", definition: "Able to recover quickly from difficulties" },
  { word: "Ubiquitous", definition: "Present, appearing, or found everywhere" },
  { word: "Sanguine", definition: "Optimistic or positive, especially in a difficult situation" },
  { word: "Mellifluous", definition: "Sweet or musical; pleasant to hear" },
  { word: "Perspicacious", definition: "Having a ready insight into things; shrewd" },
  { word: "Ineffable", definition: "Too great or extreme to be expressed in words" },
  { word: "Luminous", definition: "Full of or shedding light; bright or shining" },
  { word: "Petrichor", definition: "The pleasant smell of earth after rain" },
  { word: "Quintessential", definition: "Representing the most perfect example of a quality" },
  { word: "Ethereal", definition: "Extremely delicate and light, seeming heavenly" },
  { word: "Wanderlust", definition: "A strong desire to travel and explore the world" },
  { word: "Halcyon", definition: "Denoting a period of time that was idyllically happy and peaceful" },
  { word: "Sonorous", definition: "Imposingly deep and full in sound" },
  { word: "Verdant", definition: "Green with grass or other rich vegetation" },
  { word: "Ebullient", definition: "Cheerful and full of energy" },
  { word: "Sublime", definition: "Of outstanding spiritual or intellectual worth" },
  { word: "Incandescent", definition: "Emitting light as a result of being heated; passionate" },
  { word: "Gossamer", definition: "Something very light, thin, and insubstantial" },
  { word: "Aplomb", definition: "Self-confidence or assurance, especially in a demanding situation" },
  { word: "Zenith", definition: "The highest point reached; the peak or culmination" },
  { word: "Euphoria", definition: "A feeling of intense excitement and happiness" },
  { word: "Cascade", definition: "A small waterfall, or a succession of stages" },
  { word: "Resplendent", definition: "Impressive and attractive; brilliant" },
  { word: "Labyrinthine", definition: "Like a labyrinth; irregular and twisting" },
  { word: "Cerulean", definition: "Deep sky blue in color" },
  { word: "Transcendent", definition: "Beyond or above the range of normal experience" },
  { word: "Iridescent", definition: "Showing luminous colors that change when seen from different angles" },
];

export default function WordOfDayModule({ config: _config, style }: WordOfDayModuleProps) {
  const dayOfYear = getDayOfYear(new Date());
  const entry = WORDS[dayOfYear % WORDS.length];
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, 0.10);

  return (
    <ModuleWrapper style={style}>
      <div ref={containerRef} className="flex flex-col items-center justify-center h-full gap-2" style={{ fontSize: `${scaledFontSize}px` }}>
        <p className="font-bold" style={{ fontSize: '1.5em' }}>{entry.word}</p>
        <p className="text-center italic">{entry.definition}</p>
      </div>
    </ModuleWrapper>
  );
}
