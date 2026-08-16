'use client';

import { useMemo } from 'react';
import { useFullscreenDims } from '@/hooks/useFullscreenDims';
import { useTZClock } from '@/hooks/useTZClock';
import { getThemeTokens, getTypoMultiplier, getDensityMultiplier, buildThemeCSSVars } from '@/lib/fullscreen-themes';
import { useFetchData } from '@/hooks/useFetchData';
import { mealsDataUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import type { FullscreenMealPlannerConfig, MealSettings, SavedMeal, PlannedMeal } from '@/types/config';
import type { ModuleStyle } from '@/types/config';
import { getActiveSlot, DEFAULT_MEAL_SETTINGS, getWeekRange, filterPlanToWeek, toISODate, resolveMealTimeFormat } from '@/lib/meal-constants';
import type { MealPlannerViewProps } from './meal-planner-utils';
import { resolveRecipeTapMode } from '../shared/MealTapTarget';
import WeekView from './WeekView';
import TodayView from './TodayView';
import MenuBoardView from './MenuBoardView';
import NextMealView from './NextMealView';

interface MealDataResponse {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  groceryChecked: string[];
  settings?: MealSettings;
  /** Household GlobalSettings.timeFormat, reported alongside the settings */
  globalTimeFormat?: '12h' | '24h';
}

interface FullscreenMealPlannerModuleProps {
  config: FullscreenMealPlannerConfig;
  style: ModuleStyle;
  timezone?: string;
  fullscreenTheme?: string;
  screenId?: string;
  moduleId?: string;
}

export default function FullscreenMealPlannerModule({
  config,
  style: _style,
  timezone,
  fullscreenTheme,
  screenId,
  moduleId,
}: FullscreenMealPlannerModuleProps) {
  // ── Data fetching ──
  const [mealData] = useFetchData<MealDataResponse>(mealsDataUrl(), FETCH_KEY_REGISTRY['fullscreen-meal-planner']?.ttlMs ?? 60_000);
  const savedMeals = useMemo(() => mealData?.savedMeals ?? [], [mealData?.savedMeals]);
  const fullPlan = useMemo(() => mealData?.plan ?? [], [mealData?.plan]);
  // Settings now come from the shared meals.json (edited via /remote), not per-module config
  const settings = mealData?.settings ?? DEFAULT_MEAL_SETTINGS;
  // Effective serving-time format: an explicit meal override wins, else the
  // household global. Resolved once here so every view renders consistently.
  const globalTimeFormat = mealData?.globalTimeFormat === '24h' ? '24h' : '12h';
  const timeFormat = resolveMealTimeFormat(settings, globalTimeFormat);

  // ── Scale system ──
  const { containerRef, dims } = useFullscreenDims();

  // ── Theme ──
  const theme = getThemeTokens(config.theme ?? fullscreenTheme);

  const bu = Math.min(dims.w, dims.h) / 100;
  const typoMul = getTypoMultiplier(config.typographySize ?? 'medium');
  const densityMul = getDensityMultiplier(config.density ?? 'snug');
  const s = bu * typoMul;
  const d = densityMul;

  // ── Current time (display timezone, not browser-local) ──
  const now = useTZClock(timezone, 60_000);

  const currentHour = now.getHours();
  const slots = settings.enabledSlots;
  const activeSlot = getActiveSlot(currentHour, slots);
  const view = config.view ?? 'week';

  // Filter plan to current week for display
  const todayISO = toISODate(now);
  const { start: weekStart, end: weekEnd } = useMemo(
    () => getWeekRange(new Date(todayISO + 'T12:00:00'), settings.weekStartDay),
    [todayISO, settings.weekStartDay],
  );
  const plan = useMemo(
    () => filterPlanToWeek(fullPlan, weekStart, weekEnd),
    [fullPlan, weekStart, weekEnd],
  );

  const pad = s * 2 * d;
  const headerFont = "var(--font-dm-serif), 'DM Serif Display', Georgia, serif";
  const bodyFont = "'Inter', sans-serif";

  // ── CSS custom properties ──
  const cssVars = {
    ...buildThemeCSSVars('fmp', theme),
    '--fmp-accent': config.accentColor ?? '#f59e0b',
  } as React.CSSProperties;

  const recipeTapMode = resolveRecipeTapMode(config.tapRecipeAction, screenId, moduleId);

  // ── View props ──
  const viewProps: MealPlannerViewProps = {
    config, settings, timeFormat, savedMeals, plan, now, slots, activeSlot,
    bu, s, pad,
    showEmoji: config.showEmoji ?? true,
    showPrepTime: config.showPrepTime ?? true,
    showTags: config.showTags ?? true,
    showDifficulty: config.showDifficulty ?? false,
    headerFont, bodyFont,
    recipeTapMode,
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
      {view === 'next-meal' && <NextMealView {...viewProps} plan={fullPlan} />}
    </div>
  );
}
