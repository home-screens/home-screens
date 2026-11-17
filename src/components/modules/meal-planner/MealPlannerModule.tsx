'use client';

import type { ReactNode } from 'react';
import type { MealPlannerConfig, ModuleStyle } from '@/types/config';
import { DEFAULT_ACCENT_COLOR, fromISODate, planHasDrawnMeal, toISODate, weekPlannedSlots } from '@/lib/meal-constants';
import { mealLookAhead } from '@/lib/look-ahead';
import { formatDayRange, useFormattingLocale, useTranslate } from '@/i18n';
import ModuleWrapper from '../ModuleWrapper';
import FamilyEmptyState from '../FamilyEmptyState';
import { ModuleLoadingState } from '../ModuleStates';
import { WeekView } from './WeekView';
import { TodayView } from './TodayView';
import { NextMealView } from './NextMealView';
import { CompactView } from './CompactView';
import { ListView } from './ListView';
import { GroceryView } from './GroceryView';
import { RecipesView } from './RecipesView';
import { mealieWords } from '../shared/mealie-problem';
import { MealRecipeContext } from '../shared/MealRecipeContext';
import { useMealWeek, useWallMeals } from '../shared/useWallMeals';
import { WallRateDinnerButton } from '../shared/MealRatingWall';
import { MealVotesScope } from '@/components/meals/meal-votes';
import { useLookAhead } from '../shared/useLookAhead';
import { LookAheadBar, useLookAheadWords } from '../shared/LookAhead';
import { useWallRecipeBook } from '../shared/recipe-book/useWallRecipeBook';
import { recipeBookSource } from '@/lib/meal-recipe-book';

interface MealPlannerModuleProps {
  config: MealPlannerConfig;
  style: ModuleStyle;
  timezone?: string;
  /** The display's full-screen theme, which a recipe card is drawn in. */
  fullscreenTheme?: string;
  screenId?: string;
  moduleId?: string;
}

export default function MealPlannerModule({ config, style, timezone, fullscreenTheme, screenId, moduleId }: MealPlannerModuleProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const view = config.view ?? 'week';
  const {
    data, error, todayISO, nowMinutes, settings, timeFormat, savedMeals, fullPlan,
    mealie, grocery, interactive, recipeTapMode, recipeContext, familyRatings,
  } = useWallMeals({ moduleType: 'meal-planner', view, timezone, theme: fullscreenTheme, config, screenId, moduleId });
  // The Week and List views step a week at a time on a touch wall (the
  // arrows show where taps are on, as the finger scrolling does). They draw
  // the week stepped to; `todayISO` still marks the real day.
  const look = useLookAhead({ step: mealLookAhead(view, mealie.state !== 'local'), enabled: interactive, today: fromISODate(todayISO) });
  const ownHeading = useLookAheadWords(look);
  const { weekDates, plan } = useMealWeek(fullPlan, toISODate(look.anchor), settings.weekStartDay);
  const book = useWallRecipeBook({
    source: recipeBookSource(data?.mealieConnected ?? false),
    savedMeals,
    enabled: view === 'recipes' && data !== null,
  });

  // A plan counts by what it draws (`weekPlannedSlots`), as the full-screen
  // Week counts it: an entry for a meal that is switched off (Mealie plans
  // lunch whether or not the wall shows it) is not a meal. Next meal and
  // Compact look past this week, so they ask the whole plan.
  const hasMeals = view === 'next-meal' || view === 'compact'
    ? planHasDrawnMeal(fullPlan, settings.enabledSlots, savedMeals)
    : weekPlannedSlots(weekDates, settings.enabledSlots, plan, savedMeals).filled > 0;

  // Until the first answer the plan is unknown, not empty: "No meals planned
  // yet" flashed on every load of a slow Pi.
  if (data === null) {
    return <ModuleLoadingState style={style} message={t('meal-planner.loading')} error={error} />;
  }

  // The grocery list is not the plan: it has its own empty and out-of-reach states.
  if (view === 'grocery') {
    return (
      <ModuleWrapper style={style}>
        {/* Keyed: a touch wall scrolls the list and one without pages it, each measured from its own mount. */}
        <GroceryView key={String(interactive)} config={config} grocery={grocery} tappable={interactive} />
      </ModuleWrapper>
    );
  }

  // The recipe book is not the plan either: it answers for itself.
  if (view === 'recipes') {
    return (
      <ModuleWrapper style={style}>
        <MealRecipeContext.Provider value={recipeContext}>
          <MealVotesScope votes={familyRatings}>
            <RecipesView config={config} book={book} fontSize={style.fontSize} interactive={interactive} />
          </MealVotesScope>
        </MealRecipeContext.Provider>
      </ModuleWrapper>
    );
  }

  // Mealie never answered and there is no copy: say so rather than "nothing
  // planned", which would be wrong, since the plan is in Mealie.
  if (mealie.state === 'unreachable') {
    return (
      <ModuleWrapper style={style}>
        <FamilyEmptyState
          icon={<>&#127869;</>}
          title={t(`meal-planner.${mealieWords(mealie.problem)}`)}
          hint={t(`meal-planner.${mealieWords(mealie.problem)}Hint`)}
        />
      </ModuleWrapper>
    );
  }

  // With the arrows on, the Week and List views get a heading row naming the
  // week shown, its dates and the arrows. It heads the empty state too, so a
  // week with nothing planned can still step to one that has meals.
  // A card title that repeats the planner's own heading ("This week") would
  // print twice; the heading is the title then. Only while the heading is
  // drawn: with Tap on the Wall off there is no look-ahead bar, and the card
  // title is the only place the week is named.
  const cardStyle = look.on && style.title && ownHeading && style.title.trim().toLowerCase() === ownHeading.toLowerCase()
    ? { ...style, title: undefined }
    : style;

  const withArrows = (body: ReactNode) => {
    if (!look.on) return body;
    const dates = formatDayRange(fromISODate(weekDates[0]), fromISODate(weekDates[6]), locale, { year: false });
    const shortDates = formatDayRange(fromISODate(weekDates[0]), fromISODate(weekDates[6]), locale, { month: 'short', year: false });
    return (
      <div className="h-full flex flex-col" {...look.rootProps}>
        <LookAheadBar look={look} dates={dates} shortDates={shortDates} accent={config.accentColor || DEFAULT_ACCENT_COLOR} />
        <div className="flex-1 min-h-0">{body}</div>
      </div>
    );
  };

  if (!hasMeals) {
    return (
      <ModuleWrapper style={cardStyle}>
        {withArrows(
          // Another week with nothing planned is just that, not a wall waiting
          // to be set up: no "plan from a phone" hint with the hub's address.
          <FamilyEmptyState
            icon={<>&#127869;</>}
            title={t(look.away ? 'meal-planner.nothingPlannedThatWeek' : 'meal-planner.noMealsPlannedYet')}
            hint={look.away ? undefined : t('meal-planner.planFromPhoneHint')}
          />,
        )}
      </ModuleWrapper>
    );
  }

  return (
    <ModuleWrapper style={cardStyle}>
      <MealRecipeContext.Provider value={recipeContext}>
      <MealVotesScope votes={familyRatings}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
      {view === 'week' && withArrows(<WeekView config={config} settings={settings} timeFormat={timeFormat} plan={plan} savedMeals={savedMeals} weekDates={weekDates} todayISO={todayISO} recipeTapMode={recipeTapMode} fontSize={style.fontSize} interactive={interactive} />)}
      {/* The whole plan: late in the evening Today shows tomorrow, which can be in next week. */}
      {view === 'today' && <TodayView config={config} settings={settings} timeFormat={timeFormat} plan={fullPlan} savedMeals={savedMeals} todayISO={todayISO} nowMinutes={nowMinutes} recipeTapMode={recipeTapMode} />}
      {view === 'next-meal' && <NextMealView config={config} settings={settings} timeFormat={timeFormat} plan={fullPlan} savedMeals={savedMeals} todayISO={todayISO} nowMinutes={nowMinutes} recipeTapMode={recipeTapMode} />}
      {view === 'compact' && <CompactView config={config} settings={settings} timeFormat={timeFormat} plan={fullPlan} savedMeals={savedMeals} todayISO={todayISO} recipeTapMode={recipeTapMode} />}
      {view === 'list' && withArrows(<ListView config={config} settings={settings} timeFormat={timeFormat} plan={plan} savedMeals={savedMeals} weekDates={weekDates} todayISO={todayISO} recipeTapMode={recipeTapMode} interactive={interactive} fontSize={style.fontSize} />)}
      </div>
      {interactive && config.showFamilyRatings !== false && <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'flex-end', paddingTop: '0.4em' }}><WallRateDinnerButton size="0.65em" /></div>}
      </div>
      </MealVotesScope>
      </MealRecipeContext.Provider>
    </ModuleWrapper>
  );
}
