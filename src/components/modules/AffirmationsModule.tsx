'use client';

import { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTypewriter } from '@/hooks/useTypewriter';
import type { AffirmationsConfig, AffirmationsCategory, AffirmationsView, ModuleStyle } from '@/types/config';
import { useTZClock } from '@/hooks/useTZClock';
import ModuleWrapper from './ModuleWrapper';
import { BUILT_IN, type AffirmationEntry as Entry } from './affirmations-data';
import { TEXT_OPACITY } from '@/lib/constants';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';

interface AffirmationsModuleProps {
  config: AffirmationsConfig;
  style: ModuleStyle;
  timezone?: string;
  latitude?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<AffirmationsCategory, string> = {
  affirmations: 'Affirmation',
  compliments: 'Compliment',
  motivational: 'Motivation',
  gratitude: 'Gratitude',
  mindfulness: 'Mindfulness',
};

function getTimeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function getSeason(month: number, latitude: number): 'spring' | 'summer' | 'fall' | 'winter' {
  // Flip seasons for southern hemisphere
  const southern = latitude < 0;
  if (month >= 2 && month <= 4) return southern ? 'fall' : 'spring';
  if (month >= 5 && month <= 7) return southern ? 'winter' : 'summer';
  if (month >= 8 && month <= 10) return southern ? 'spring' : 'fall';
  return southern ? 'summer' : 'winter';
}

/** Fisher-Yates shuffle (returns new array) */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Content selection hook — smart shuffled rotation with context scoring
// ---------------------------------------------------------------------------

function useAffirmationRotation(
  entries: Entry[],
  intervalMs: number,
  timeAware: boolean,
  now: Date,
  latitude: number,
): { entry: Entry; key: number } | null {
  const [index, setIndex] = useState(0);
  const [order, setOrder] = useState<number[]>([]);

  // Build a scored & shuffled order whenever entries or time context changes
  const timeOfDay = getTimeOfDay(now.getHours());
  const dayOfWeek = now.getDay();
  const season = getSeason(now.getMonth(), latitude);

  useEffect(() => {
    if (entries.length === 0) { setOrder([]); setIndex(0); return; }

    // Score each entry: higher score = better contextual fit (integer scores only)
    const withScores = entries.map((entry, i) => {
      let score = 1; // base score

      if (timeAware) {
        // Time affinity bonus
        if (entry.time === timeOfDay) score += 3;
        else if (entry.time === 'anytime') score += 1;
        // wrong time-of-day: no bonus (stays in lowest tier)

        // Day-of-week bonus
        if (entry.days && entry.days.includes(dayOfWeek)) score += 4;
        else if (entry.days) score = 0; // day-specific entries hidden on wrong days

        // Season bonus
        if (entry.season === season) score += 2;
        else if (entry.season && entry.season !== season) score = 0; // wrong season = hide
      }

      return { index: i, score };
    });

    // Filter out zeroes (wrong day/season) then group by score tier, shuffle within each
    const valid = withScores.filter((s) => s.score > 0);
    const tiers = new Map<number, number[]>();
    for (const s of valid) {
      if (!tiers.has(s.score)) tiers.set(s.score, []);
      tiers.get(s.score)!.push(s.index);
    }
    const sortedTiers = [...tiers.entries()].sort((a, b) => b[0] - a[0]);
    const result: number[] = [];
    for (const [, indices] of sortedTiers) {
      result.push(...shuffle(indices));
    }
    setOrder(result);
    setIndex(0);
  }, [entries, timeAware, timeOfDay, dayOfWeek, season, latitude]);

  // Rotation timer — depends on full `order` reference so it restarts on any reshuffle
  useEffect(() => {
    if (order.length <= 1) return;
    const len = order.length;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % len);
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, order]);

  if (order.length === 0) return null;
  const safeIndex = index % order.length;
  const entryIndex = order[safeIndex];
  const entry = entries[entryIndex];
  if (!entry) return null;
  return { entry, key: safeIndex };
}

// ---------------------------------------------------------------------------
// View components
// ---------------------------------------------------------------------------

function ElegantView({ entry, accentColor, showCategory }: { entry: Entry; accentColor: string; showCategory: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
      <div className="w-12 h-0.5 rounded-full" style={{ backgroundColor: accentColor, opacity: TEXT_OPACITY.secondary }} />
      {showCategory && (
        <span className="uppercase tracking-[0.2em]" style={{ fontSize: '0.55em', opacity: TEXT_OPACITY.tertiary }}>
          {CATEGORY_LABELS[entry.category]}
        </span>
      )}
      <p className="text-center leading-relaxed font-light italic" style={{ fontSize: '1.3em' }}>
        {entry.text}
      </p>
      {entry.attribution && (
        <p className="font-light" style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.tertiary }}>
          &mdash; {entry.attribution}
        </p>
      )}
      <div className="w-12 h-0.5 rounded-full" style={{ backgroundColor: accentColor, opacity: TEXT_OPACITY.secondary }} />
    </div>
  );
}

function CardView({ entry, accentColor, showCategory }: { entry: Entry; accentColor: string; showCategory: boolean }) {
  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-2 px-5 rounded-xl"
      style={{
        background: `linear-gradient(135deg, ${accentColor}15 0%, ${accentColor}08 100%)`,
        borderLeft: `3px solid ${accentColor}50`,
      }}
    >
      {showCategory && (
        <span className="uppercase tracking-[0.15em]" style={{ fontSize: '0.55em', opacity: TEXT_OPACITY.tertiary }}>
          {CATEGORY_LABELS[entry.category]}
        </span>
      )}
      <p className="text-center leading-relaxed" style={{ fontSize: '1.15em' }}>
        {entry.text}
      </p>
      {entry.attribution && (
        <p style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.tertiary }}>
          &mdash; {entry.attribution}
        </p>
      )}
    </div>
  );
}

function MinimalView({ entry, showCategory }: { entry: Entry; accentColor?: string; showCategory: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 px-4">
      {showCategory && (
        <span className="uppercase tracking-[0.2em]" style={{ fontSize: '0.55em', opacity: TEXT_OPACITY.tertiary }}>
          {CATEGORY_LABELS[entry.category]}
        </span>
      )}
      <p className="text-center leading-relaxed font-light" style={{ fontSize: '1.2em' }}>
        {entry.text}
      </p>
      {entry.attribution && (
        <p className="font-light" style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.tertiary }}>
          &mdash; {entry.attribution}
        </p>
      )}
    </div>
  );
}

function TypewriterView({ entry, accentColor, showCategory }: { entry: Entry; accentColor: string; showCategory: boolean }) {
  const { displayed, done } = useTypewriter(entry.text, true);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 px-4">
      {showCategory && (
        <span className="uppercase tracking-[0.2em]" style={{ fontSize: '0.55em', opacity: TEXT_OPACITY.tertiary }}>
          {CATEGORY_LABELS[entry.category]}
        </span>
      )}
      <p className="text-center leading-relaxed font-mono" style={{ fontSize: '1.1em' }}>
        {displayed}
        {!done && (
          <span className="animate-pulse" style={{ color: accentColor }}>|</span>
        )}
      </p>
      <AnimatePresence>
        {done && entry.attribution && (
          <motion.p
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 0.5, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="font-light"
            style={{ fontSize: '0.7em' }}
          >
            &mdash; {entry.attribution}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View component map
// ---------------------------------------------------------------------------

type ViewProps = { entry: Entry; accentColor: string; showCategory: boolean };

const VIEW_COMPONENTS: Record<AffirmationsView, React.ComponentType<ViewProps>> = {
  elegant: ElegantView,
  card: CardView,
  minimal: MinimalView,
  typewriter: TypewriterView,
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AffirmationsModule({ config, style, timezone, latitude }: AffirmationsModuleProps) {
  const now = useTZClock(timezone, 60_000);

  const view = config.view ?? 'elegant';
  const rotationMs = config.rotationIntervalMs ?? 15000;
  const showCategory = config.showCategoryLabel ?? false;
  const timeAware = config.timeAware ?? true;
  const accentColor = config.accentColor ?? '#a78bfa';

  // Merge built-in (filtered by category) + custom entries (always included)
  const allEntries = useMemo(() => {
    const categories = config.categories ?? ['affirmations', 'compliments', 'motivational'];
    const customEntries = config.customEntries ?? [];
    const categorySet = new Set(categories);
    const builtIn = BUILT_IN.filter((e) => categorySet.has(e.category));
    const custom: Entry[] = customEntries.map((c) => ({
      text: c.text,
      attribution: c.attribution,
      category: 'affirmations' as AffirmationsCategory,
      time: 'anytime' as const,
    }));
    return [...builtIn, ...custom];
  }, [config.categories, config.customEntries]);

  const result = useAffirmationRotation(allEntries, rotationMs, timeAware, now, latitude ?? 0);
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, 0.08);

  if (!result) {
    return (
      <ModuleWrapper style={style}>
        <div className="flex items-center justify-center h-full opacity-50">
          <p style={{ fontSize: '0.9em' }}>No affirmations configured</p>
        </div>
      </ModuleWrapper>
    );
  }

  const { entry, key } = result;
  const ViewComponent = VIEW_COMPONENTS[view] ?? VIEW_COMPONENTS.elegant;

  return (
    <ModuleWrapper style={style}>
      <div ref={containerRef} className="h-full" style={{ fontSize: `${scaledFontSize}px` }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={`${key}-${entry.text}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="h-full"
        >
          <ViewComponent entry={entry} accentColor={accentColor} showCategory={showCategory} />
        </motion.div>
      </AnimatePresence>
      </div>
    </ModuleWrapper>
  );
}
