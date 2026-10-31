'use client';

import { useMemo, useRef } from 'react';
import { useFullscreenDims } from '@/hooks/useFullscreenDims';
import { useFitScale, FIT_FACTOR_ATTR, FIT_SETTLED_ATTR } from '@/hooks/useFitScale';
import { useTZClock } from '@/hooks/useTZClock';
import { getThemeTokens, getTypoMultiplier, getDensityMultiplier, buildThemeCSSVars, resolveFullscreenAccent } from '@/lib/fullscreen-themes';
import { useFetchData } from '@/hooks/useFetchData';
import { mealsDataUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { mergeMealSources, type MealieWireBlock } from '@/lib/meal-sources';
import type { ResolvedCourse } from '@/lib/meal-courses';
import { mealPhotoSrc } from '@/components/meals/MealPicture';
import { useAuthImageState } from '@/components/display/useAuthImage';
import MealPhotoBackdrop from './MealPhotoBackdrop';
import type { FullscreenMealPlannerConfig, MealSettings, SavedMeal, PlannedMeal, TimeFormat } from '@/types/config';
import type { ModuleStyle } from '@/types/config';
import type { GroceryChecked } from '@/lib/grocery-checks';
import { getActiveSlot, DEFAULT_MEAL_SETTINGS, DEFAULT_ACCENT_COLOR, getWeekRange, filterPlanToWeek, toISODate, resolveMealTimeFormat, resolveMealWithEntry, getNextPlannedMeal } from '@/lib/meal-constants';
import type { MealPlannerViewProps } from './meal-planner-utils';
import { resolveRecipeTapMode } from '../shared/MealTapTarget';
import WeekView from './WeekView';
import TodayView from './TodayView';
import MenuBoardView from './MenuBoardView';
import NextMealView from './NextMealView';
import { UI_SANS_STACK } from '@/lib/font-registry';
import { useTranslate } from '@/i18n';
import { heldPulseKeyframes } from '@/lib/held-pulse';
import { mealieWords } from '../shared/mealie-problem';

// The now dot's blink, redrawn 12 times a second rather than on every refresh.
const NOW_DOT_PULSE_KEYFRAMES = heldPulseKeyframes('fmpPulse', { rest: 1, peak: 0.3, periodMs: 2000 });

interface MealDataResponse {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  groceryChecked: GroceryChecked;
  settings?: MealSettings;
  /** Household GlobalSettings.timeFormat, reported alongside the settings */
  globalTimeFormat?: TimeFormat;
  /** Mealie's plan, while the plan lives there (see `meal-sources.ts`). */
  mealie?: MealieWireBlock;
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
  const t = useTranslate('modules');
  // ── Data fetching ──
  const [mealData, mealError] = useFetchData<MealDataResponse>(mealsDataUrl(), FETCH_KEY_REGISTRY['fullscreen-meal-planner']?.ttlMs ?? 60_000);
  // The plan lives in meals.json or in Mealie; the shared rule decides which
  // one this wall draws, the same way the phone and the editor do.
  const merged = useMemo(
    () => (mealData ? mergeMealSources(mealData, mealData.settings ?? DEFAULT_MEAL_SETTINGS) : null),
    [mealData],
  );
  const savedMeals = useMemo(() => merged?.savedMeals ?? [], [merged]);
  const mealieUnreachable = merged?.source === 'mealie' && merged.mealie?.status !== 'ok' && merged.mealie?.status !== 'stale';
  const fullPlan = useMemo(() => merged?.plan ?? [], [merged]);
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
  const densityMul = getDensityMultiplier(config.density ?? 'cozy');
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
  // same loop fullscreen weather uses. The week view is measured too: its
  // seven day rows are a fixed stack, and on a landscape wall (1080 high)
  // they ran past the bottom, with Saturday off the screen and no way to
  // scroll a wall to it.
  //
  // Deps are content *shape*, not array identities: the number of meals the
  // view draws and how much text they carry. A refetch that returns the same
  // plan must not restart the bisection.
  const { mealCount, textLength } = useMemo(() => {
    let count = 0;
    let length = 0;
    // A meal typed straight into the day draws text like any other, so it has
    // to be counted here or the fit is measured against a slot the view does
    // not actually consider empty.
    // A meal's courses are lines of their own in the views that list them,
    // so a dessert added to tonight has to be able to shrink the view.
    const tally = (name: string | null, meal: SavedMeal | null, courses: ResolvedCourse[] = [], notes: string | null = null) => {
      if (!name) return;
      count += 1 + courses.length;
      length += name.length + (notes?.length ?? 0) + (meal?.tags?.join('').length ?? 0)
        + courses.reduce((n, c) => n + c.name.length, 0);
    };
    if (view === 'week') {
      for (const entry of plan) {
        const { meal, name, courses, notes } = resolveMealWithEntry(entry.date, entry.slot, plan, savedMeals);
        tally(name, meal, courses, notes);
      }
    } else if (view === 'next-meal') {
      const next = getNextPlannedMeal(todayISO, currentHour, fullPlan, savedMeals, slots);
      tally(next?.name ?? null, next?.meal ?? null, next?.courses, next?.notes);
    } else {
      for (const slot of slots) {
        const { meal, name, courses, notes } = resolveMealWithEntry(todayISO, slot, plan, savedMeals);
        tally(name, meal, courses, notes);
      }
    }
    return { mealCount: count, textLength: length };
  }, [view, todayISO, currentHour, fullPlan, plan, savedMeals, slots]);

  // Next Meal over the dish's photo: the backdrop and the light text only
  // once the photo is in, never light text on the theme's own background.
  const showEmoji = config.showEmoji ?? true;
  const nextMeal = useMemo(
    () => (view === 'next-meal' && showEmoji ? getNextPlannedMeal(todayISO, currentHour, fullPlan, savedMeals, slots)?.meal ?? null : null),
    [view, showEmoji, todayISO, currentHour, fullPlan, savedMeals, slots],
  );
  const backdrop = useAuthImageState(mealPhotoSrc(nextMeal, 'full'));
  const backdropUrl = backdrop.status === 'ready' ? backdrop.url : undefined;

  const stackRef = useRef<HTMLDivElement>(null);
  const { factor: fit, settled: fitSettled } = useFitScale(stackRef, [
    view, config.typographySize, config.density, dims.w, dims.h,
    config.showEmoji, config.showPrepTime, config.showTags, config.showDifficulty, config.showTitle,
    slots.length, mealCount, textLength,
    // The backdrop takes the big picture out of the stack, which frees room.
    !!backdropUrl,
  ]);
  const s = bu * typoMul * fit;

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
    showEmoji,
    showPrepTime: config.showPrepTime ?? true,
    showTags: config.showTags ?? true,
    showDifficulty: config.showDifficulty ?? false,
    showTitle: config.showTitle !== false,
    headerFont, bodyFont,
    recipeTapMode,
    landscape,
    photoBackdrop: !!backdropUrl,
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
        ${NOW_DOT_PULSE_KEYFRAMES}
        .fmp-now-dot {
          animation: fmpPulse 2s linear infinite;
        }
        .fmp-scroll {
          overflow-y: auto;
          scrollbar-width: none;
        }
        .fmp-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {backdropUrl && mealData !== null && <MealPhotoBackdrop url={backdropUrl} />}
      {mealieUnreachable ? (
        // The plan is in Mealie and Mealie never answered: say so rather than
        // "nothing planned", which would be wrong.
        <div
          data-testid="fmp-mealie-unreachable"
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: s * 1.5, textAlign: 'center', padding: pad }}
        >
          <span style={{ fontSize: s * 10, lineHeight: 1, opacity: 0.3 }}>&#127869;</span>
          <span style={{ fontFamily: headerFont, fontSize: s * 4, lineHeight: 1.1, color: 'var(--fmp-text)' }}>{t(`meal-planner.${mealieWords(merged?.mealie?.failure)}`)}</span>
          <span style={{ fontSize: s * 2, color: 'var(--fmp-text-3)', maxWidth: '80%', lineHeight: 1.3 }}>{t(`meal-planner.${mealieWords(merged?.mealie?.failure)}Hint`)}</span>
        </div>
      ) : mealData === null ? (
        // Until the first answer the plan is unknown, not empty: the views
        // would say "No meals planned" on every load of a slow Pi.
        <div
          data-testid={mealError ? 'module-not-updating' : 'fmp-loading'}
          aria-live="polite"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fmp-text-2)', fontSize: s * 2.2, textAlign: 'center', padding: pad }}
        >
          {t(mealError ? 'common.notUpdating' : 'meal-planner.loading')}
        </div>
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
            // Above the photo backdrop, which is positioned in the root.
            position: 'relative',
          }}
        >
          {view === 'week' && <WeekView {...viewProps} />}
          {view === 'today' && <TodayView {...viewProps} />}
          {view === 'menu-board' && <MenuBoardView {...viewProps} />}
          {view === 'next-meal' && <NextMealView {...viewProps} plan={fullPlan} />}
        </div>
      )}
    </div>
  );
}
