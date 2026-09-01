'use client';

import { useMemo, useRef } from 'react';
import { useFullscreenDims } from '@/hooks/useFullscreenDims';
import { useFitScale, FIT_FACTOR_ATTR, FIT_SETTLED_ATTR } from '@/hooks/useFitScale';
import { useTZClock } from '@/hooks/useTZClock';
import { getThemeTokens, getTypoMultiplier, getDensityMultiplier, buildThemeCSSVars, resolveFullscreenAccent } from '@/lib/fullscreen-themes';
import { useFetchData } from '@/hooks/useFetchData';
import { mealsDataUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import type { FullscreenMealPlannerConfig, MealSettings, SavedMeal, PlannedMeal, TimeFormat } from '@/types/config';
import type { ModuleStyle } from '@/types/config';
import { getActiveSlot, DEFAULT_MEAL_SETTINGS, DEFAULT_ACCENT_COLOR, getWeekRange, filterPlanToWeek, toISODate, resolveMealTimeFormat, resolveMeal, getNextPlannedMeal } from '@/lib/meal-constants';
import type { MealPlannerViewProps } from './meal-planner-utils';
import { resolveRecipeTapMode } from '../shared/MealTapTarget';
import WeekView from './WeekView';
import TodayView from './TodayView';
import MenuBoardView from './MenuBoardView';
import NextMealView from './NextMealView';
import { UI_SANS_STACK } from '@/lib/font-registry';

interface MealDataResponse {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  groceryChecked: string[];
  settings?: MealSettings;
  /** Household GlobalSettings.timeFormat, reported alongside the settings */
  globalTimeFormat?: TimeFormat;
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
  // Settings live in the shared meals.json, edited via /remote.
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
  const d = densityMul;
  const landscape = dims.w > dims.h;

  // ── Current time (display timezone, not browser-local) ──
  const now = useTZClock(timezone, 60_000);

  const currentHour = now.getHours();
  const slots = settings.enabledSlots;
  const activeSlot = getActiveSlot(currentHour, slots);
  const view = config.view ?? 'week';

  const todayISO = toISODate(now);
  const { start: weekStart, end: weekEnd } = useMemo(
    () => getWeekRange(new Date(todayISO + 'T12:00:00'), settings.weekStartDay),
    [todayISO, settings.weekStartDay],
  );
  const plan = useMemo(
    () => filterPlanToWeek(fullPlan, weekStart, weekEnd),
    [fullPlan, weekStart, weekEnd],
  );

  // The today, menu-board and next-meal views are authored to fill a 1080
  // canvas at `medium` (see `px` in meal-planner-utils). A larger
  // typographySize, a long dish name or a five-course day can push them past
  // the canvas, so the rendered stack is measured and shrunk to fit — the
  // same loop fullscreen weather uses. The week view reflows on its own and
  // keeps its factor at 1 by never being measured.
  //
  // Deps are content *shape*, not array identities: the number of meals the
  // view draws and how much text they carry. A refetch that returns the same
  // plan must not restart the bisection.
  const { mealCount, textLength } = useMemo(() => {
    if (view === 'week') return { mealCount: 0, textLength: 0 };
    let count = 0;
    let length = 0;
    const tally = (meal: SavedMeal | null) => {
      if (!meal) return;
      count += 1;
      length += meal.name.length + (meal.notes?.length ?? 0) + (meal.tags?.join('').length ?? 0);
    };
    if (view === 'next-meal') {
      tally(getNextPlannedMeal(todayISO, currentHour, fullPlan, savedMeals, slots)?.meal ?? null);
    } else {
      for (const slot of slots) tally(resolveMeal(todayISO, slot, plan, savedMeals));
    }
    return { mealCount: count, textLength: length };
  }, [view, todayISO, currentHour, fullPlan, plan, savedMeals, slots]);

  // The week view never renders the measured stack, so its ref stays null
  // and the loop is a no-op there.
  const stackRef = useRef<HTMLDivElement>(null);
  const { factor: fit, settled: fitSettled } = useFitScale(stackRef, [
    view, config.typographySize, config.density, dims.w, dims.h,
    config.showEmoji, config.showPrepTime, config.showTags, config.showDifficulty, config.showTitle,
    slots.length, mealCount, textLength,
  ]);
  const s = bu * typoMul * (view === 'week' ? 1 : fit);

  const pad = s * 2 * d;
  const headerFont = "var(--font-dm-serif), 'DM Serif Display', Georgia, serif";
  // Not the bare family name: `'Inter'` only matched because next/font happens
  // to name the face `inter` and CSS family matching is case-insensitive. If
  // that generated name ever changes this silently falls through to the
  // generic, which a Pi resolves to an emoji font.
  const bodyFont = UI_SANS_STACK;

  // ── CSS custom properties ──
  const cssVars = {
    ...buildThemeCSSVars('fmp', theme),
    // Empty accentColor follows the theme's own accent (see the registry default).
    '--fmp-accent': resolveFullscreenAccent(config.accentColor, theme, DEFAULT_ACCENT_COLOR),
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
    showTitle: config.showTitle !== false,
    headerFont, bodyFont,
    recipeTapMode,
    landscape,
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
          background-color: var(--fmp-bg);
          background-image: var(--fmp-bg-image);
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

      {view === 'week' ? (
        <WeekView {...viewProps} />
      ) : (
        <div
          ref={stackRef}
          data-testid="fmp-stack"
          // The fit loop measures this element and needs to know which factor
          // the layout it is reading belongs to. See useFitScale.
          {...{ [FIT_FACTOR_ATTR]: String(fit), [FIT_SETTLED_ATTR]: String(fitSettled) }}
          style={{
            flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
            // The fit loop reads scrollHeight against this box, so the box must
            // be the content area and the content must be allowed to exceed it
            // while measuring.
            overflow: 'hidden',
          }}
        >
          {view === 'today' && <TodayView {...viewProps} />}
          {view === 'menu-board' && <MenuBoardView {...viewProps} />}
          {view === 'next-meal' && <NextMealView {...viewProps} plan={fullPlan} />}
        </div>
      )}
    </div>
  );
}
