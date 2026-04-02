'use client';

import { useState, useEffect, useMemo } from 'react';
import { useFullscreenDims } from '@/hooks/useFullscreenDims';
import { getThemeTokens, getTypoMultiplier, getDensityMultiplier, buildThemeCSSVars } from '@/lib/fullscreen-themes';
import { useFetchData } from '@/hooks/useFetchData';
import type { FullscreenMealPlannerConfig, SavedMeal, PlannedMeal } from '@/types/config';
import type { ModuleStyle } from '@/types/config';
import { getActiveSlot } from './meal-planner-utils';
import type { MealPlannerViewProps } from './meal-planner-utils';
import WeekView from './WeekView';
import TodayView from './TodayView';
import MenuBoardView from './MenuBoardView';
import NextMealView from './NextMealView';

interface MealDataResponse {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  groceryChecked: string[];
}

interface FullscreenMealPlannerModuleProps {
  config: FullscreenMealPlannerConfig;
  style: ModuleStyle;
  timezone?: string;
  fullscreenTheme?: string;
}

export default function FullscreenMealPlannerModule({
  config,
  style: _style,
  timezone: _timezone,
  fullscreenTheme,
}: FullscreenMealPlannerModuleProps) {
  // ── Data fetching ──
  const [mealData] = useFetchData<MealDataResponse>('/api/meals/data', 60_000);
  const savedMeals = useMemo(() => mealData?.savedMeals ?? [], [mealData?.savedMeals]);
  const plan = useMemo(() => mealData?.plan ?? [], [mealData?.plan]);

  // ── Scale system ──
  const { containerRef, dims } = useFullscreenDims();

  // ── Theme ──
  const theme = getThemeTokens(config.theme ?? fullscreenTheme);

  const bu = Math.min(dims.w, dims.h) / 100;
  const typoMul = getTypoMultiplier(config.typographySize ?? 'medium');
  const densityMul = getDensityMultiplier(config.density ?? 'snug');
  const s = bu * typoMul;
  const d = densityMul;

  // ── Current time ──
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);

  const currentHour = now.getHours();
  const slots = useMemo(() => config.slots ?? ['breakfast', 'lunch', 'dinner'], [config.slots]);
  const activeSlot = getActiveSlot(currentHour, slots);
  const view = config.view ?? 'week';

  const pad = s * 2 * d;
  const headerFont = "var(--font-dm-serif), 'DM Serif Display', Georgia, serif";
  const bodyFont = "'Inter', sans-serif";

  // ── CSS custom properties ──
  const cssVars = {
    ...buildThemeCSSVars('fmp', theme),
    '--fmp-accent': config.accentColor ?? '#f59e0b',
  } as React.CSSProperties;

  // ── View props ──
  const viewProps: MealPlannerViewProps = {
    config, savedMeals, plan, now, slots, activeSlot,
    bu, s, pad,
    showEmoji: config.showEmoji ?? true,
    showPrepTime: config.showPrepTime ?? true,
    showTags: config.showTags ?? true,
    showDifficulty: config.showDifficulty ?? false,
    headerFont, bodyFont,
  };

  return (
    <div
      ref={containerRef}
      className="fmp-root"
      style={{
        width: '100%',
        height: '100%',
        fontFamily: bodyFont,
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        colorScheme: theme.isDark ? 'dark' : 'light',
        ...cssVars,
      } as React.CSSProperties}
    >
      <style>{`
        .fmp-root {
          background: var(--fmp-bg);
          color: var(--fmp-text);
        }
        @keyframes fmpPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .fmp-now-dot {
          animation: fmpPulse 2s ease-in-out infinite;
        }
        .fmp-scroll {
          overflow-y: auto;
          scrollbar-width: none;
        }
        .fmp-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {view === 'week' && <WeekView {...viewProps} />}
      {view === 'today' && <TodayView {...viewProps} />}
      {view === 'menu-board' && <MenuBoardView {...viewProps} />}
      {view === 'next-meal' && <NextMealView {...viewProps} />}
    </div>
  );
}
