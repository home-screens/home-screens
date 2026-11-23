'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { getLocalizedDayNames, getMealSlotLabelKey } from '@/lib/meal-constants';
import { pickTargetChosen, type MealPickTarget } from '@/lib/meal-courses';
import { useMealsTabData } from '../hooks/useMealsTabData';
import type { WallNotices } from '../hooks/useShowRecipeOnWall';
import { readMealsPlace, writeMealsPlace, type MealsSubView } from './meals-shared';
import MealsTabHeader from './MealsTabHeader';
import MealsSubNav from './MealsSubNav';
import MealsWeekNav from './MealsWeekNav';
import MealsWeekView from './MealsWeekView';
import MealsPlanView from './MealsPlanView';
import MealsLibraryView from './MealsLibraryView';
import MealsGroceryView from './MealsGroceryView';
import MealsMealieLibraryView from './MealsMealieLibraryView';
import MealsMealieGroceryView from './MealsMealieGroceryView';
import MealsSettingsSheet from './MealsSettingsSheet';
import MealSheet from './MealSheet';
import MealPickerSheet from './MealPickerSheet';
import ConfirmSheet from './ConfirmSheet';
import AtHomePill from './AtHomePill';
import { MealieUnreachable, MealsSourcePill, MealsWeekLoading } from './MealsMealieStatus';
import { MealVotesProvider } from '@/components/meals/meal-votes';
import { DinnerRatingSheet } from './MealRatingSheet';
import { isoWeekday } from '@/lib/iso-date';
import { dismissToast, showToast, useRemoteToast } from '../remote-toast';
import { LoadFailed } from './RetryButton';

/** `onOpenList` shows one of the family's lists on the Lists tab (from the Grocery tab's "Also on" group). */
export default function MealsTab({ onOpenList }: { onOpenList?: (listId: string) => void } = {}) {
  const locale = useFormattingLocale();
  const t = useTranslate('remote');
  const tModules = useTranslate('modules');
  // The tab and the week this tab was left on, from the address (see
  // `readMealsPlace`), so a reload comes back to them.
  const [place] = useState(() => (typeof window === 'undefined'
    ? readMealsPlace('')
    : readMealsPlace(window.location.search)));
  const {
    savedMeals,
    meals,
    familyRatings,
    nowMinutes,
    plan,
    weekPlan,
    week,
    settings,
    globalTimeFormat,
    loading,
    loadError,
    retryLoad,
    saving,
    saveError,
    setSaveError,
    showNotice,
    form,
    weekDates,
    todayISO,
    activeSlotType,
    isCurrentWeek,
    navigateWeek,
    jumpToToday,
    source,
    status,
    canEdit,
    mealieConnected,
    weekState,
    retryWeek,
    getMealForSlot,
    setSlotTime,
    clearMeal,
    removeCourse,
    moveCourse,
    clearAllPlan,
    suggestRandom,
    copyLastWeek,
    hasPreviousWeekEntries,
    picker,
    setPicker,
    pickMeal,
    pickText,
    sheet,
    setSheet,
    searchQuery,
    setSearchQuery,
    filterTag,
    setFilterTag,
    filteredMeals,
    openNewMealForm,
    openEditMealForm,
    saveMealForm,
    deleteMeal,
    toggleFavorite,
    groceryList,
    groceryStats,
    groceryWithoutIngredients,
    toggleGroceryItem,
    confirmAction,
    setConfirmAction,
    saveSettings,
  } = useMealsTabData(place.week);

  const [ratingDinner, setRatingDinner] = useState(false);
  const [subView, setSubView] = useState<MealsSubView>(place.view);
  // Leaving a sub-tab takes its notice along: an Undo for the plan does not
  // follow the family onto the grocery list.
  const openView = useCallback((view: MealsSubView) => {
    if (view !== subView) dismissToast();
    setSubView(view);
  }, [subView]);
  const [showSettings, setShowSettings] = useState(false);
  const dayNamesFull = useMemo(() => getLocalizedDayNames(locale, 'full'), [locale]);
  const closeSheet = useCallback(() => setSheet(null), [setSheet]);

  // A save that failed is said through the phone's toast, which sits above
  // any open sheet; the meal form says it on the form instead, so it waits
  // there until the form closes. Said once: the same failure again is a new
  // toast, not a message that was already up.
  useEffect(() => {
    if (!saveError || form.editingMeal) return;
    showToast(saveError, 'error');
    setSaveError(null);
  }, [saveError, form.editingMeal, setSaveError]);
  // A later Mealie write that went through takes down the error it left, and
  // only that one.
  const toast = useRemoteToast();
  const clearError = (message: string) => {
    if (toast?.tone === 'error' && toast.message === message) dismissToast();
  };

  // "Show on the wall" says how it went through the same toast. A send that
  // works replaces an error an earlier one left.
  const wallNotices = useMemo<WallNotices>(() => ({
    sent: (message, takeDown) => showNotice(message, takeDown, takeDown ? t('mealsTab.showOnWall.takeDown') : undefined),
    failed: (message) => showToast(message, 'error'),
  }), [showNotice, t]);

  // Mirror the tab and the week shown into the address, once the household's
  // week start has settled which week that is.
  const placeWeek = isCurrentWeek ? null : weekDates[0].date;
  useEffect(() => {
    if (loading || loadError) return;
    const url = new URL(window.location.href);
    if (writeMealsPlace(url, { view: subView, week: placeWeek })) window.history.replaceState(window.history.state, '', url);
  }, [loading, loadError, subView, placeWeek]);

  if (loading) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: 'var(--hs-text-faint)' }}>{t('mealsTab.loading')}</div>
      </div>
    );
  }

  // Never an empty week: that reads as "nothing planned", and a meal saved
  // from here would be built on nothing.
  if (loadError) {
    return <LoadFailed testId="meals-load-error" message={t('mealsTab.loadError')} onRetry={retryLoad} />;
  }

  const fromMealie = source === 'mealie';
  const baseUrl = status.state === 'local' ? undefined : status.baseUrl;
  // Mealie gave no answer and this is its last good copy: viewing stays
  // calm, planning pauses with one message saying why.
  const paused = fromMealie && !canEdit && status.state === 'stale' ? { updatedAt: status.updatedAt, problem: status.problem } : null;
  // No copy at all (or the hub could not fetch this week): say so instead of
  // drawing an empty week, which would read as nothing planned.
  const unreachable = fromMealie && (status.state === 'unreachable' || weekState === 'failed');

  // The week between the arrows: "This week", or the dates of another.
  const weekLabel = isCurrentWeek ? t('mealsTab.weekLabel.thisWeek') : week.range;
  const weekReady = weekState === 'ready';

  const sheetEntry = sheet ? getMealForSlot(sheet.date, sheet.slot).planned : undefined;
  const pickerEntry = picker ? getMealForSlot(picker.date, picker.slot).planned : undefined;
  // What the picker marks with a tick: the dish being changed, or, when
  // adding, the dishes of that kind the meal already has.
  const chosen = picker ? pickTargetChosen(pickerEntry, picker) : null;

  return (
    <MealVotesProvider loaded={familyRatings}>
    <div>
      <MealsTabHeader todayISO={todayISO} onOpenSettings={() => setShowSettings(true)} onRateDinner={() => setRatingDinner(true)} />
      <MealsSourcePill status={status} todayISO={todayISO} />
      <AtHomePill style={{ marginTop: 8 }} />

      <MealsSubNav subView={subView} setSubView={openView} />

      {(subView === 'week' || subView === 'plan' || (subView === 'grocery' && !fromMealie)) && (
        <MealsWeekNav
          weekLabel={weekLabel}
          isCurrentWeek={isCurrentWeek}
          navigateWeek={navigateWeek}
          jumpToToday={jumpToToday}
        />
      )}

      {(subView === 'week' || subView === 'plan') && unreachable && (
        <MealieUnreachable problem={status.state === 'unreachable' || status.state === 'stale' ? status.problem : 'unreachable'} onRetry={retryWeek} />
      )}
      {(subView === 'week' || subView === 'plan') && !unreachable && !weekReady && <MealsWeekLoading />}

      {subView === 'week' && !unreachable && weekReady && (
        <MealsWeekView
          savedMeals={meals}
          plan={weekPlan}
          weekDates={weekDates}
          todayISO={todayISO}
          activeSlot={activeSlotType}
          getMealForSlot={getMealForSlot}
          settings={settings}
          globalTimeFormat={globalTimeFormat}
          setSubView={openView}
          onOpenMeal={(date, slot) => setSheet({ date, slot })}
        />
      )}

      {subView === 'plan' && !unreachable && weekReady && (
        <MealsPlanView
          savedMeals={meals}
          plan={weekPlan}
          weekDates={weekDates}
          todayISO={todayISO}
          activeSlot={activeSlotType}
          getMealForSlot={getMealForSlot}
          globalTimeFormat={globalTimeFormat}
          fromMealie={fromMealie}
          paused={paused}
          onRetry={retryLoad}
          onOpenMeal={(date, slot) => setSheet({ date, slot })}
          onPick={(target: MealPickTarget) => setPicker(target)}
          setSlotTime={setSlotTime}
          clearAllPlan={clearAllPlan}
          suggestRandom={suggestRandom}
          copyLastWeek={copyLastWeek}
          hasPreviousWeek={hasPreviousWeekEntries}
          settings={settings}
          setSubView={openView}
        />
      )}

      {subView === 'library' && (fromMealie ? (
        // The hub already knows Mealie cannot answer: say so at once rather
        // than search and then say it.
        status.state === 'unreachable' ? (
          <MealieUnreachable problem={status.problem} onRetry={retryWeek} />
        ) : (
          <MealsMealieLibraryView baseUrl={baseUrl} wallNotices={wallNotices} onSaveFailed={setSaveError} />
        )
      ) : (
        <MealsLibraryView
          savedMeals={savedMeals}
          filteredMeals={filteredMeals}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filterTag={filterTag}
          setFilterTag={setFilterTag}
          form={form}
          openNewMealForm={openNewMealForm}
          openEditMealForm={openEditMealForm}
          saveMealForm={saveMealForm}
          deleteMeal={deleteMeal}
          toggleFavorite={toggleFavorite}
          saving={saving}
          saveError={saveError}
          wallNotices={wallNotices}
        />
      ))}

      {subView === 'grocery' && (fromMealie ? (
        <MealsMealieGroceryView
          baseUrl={baseUrl}
          todayISO={todayISO}
          onError={setSaveError}
          onErrorResolved={clearError}
        />
      ) : (
        <MealsGroceryView
          groceryList={groceryList}
          groceryStats={groceryStats}
          withoutIngredients={groceryWithoutIngredients}
          toggleGroceryItem={toggleGroceryItem}
          week={week}
          extras={isCurrentWeek && settings.groceryExtrasListId ? { listId: settings.groceryExtrasListId, since: weekDates[0].date } : null}
          onOpenList={onOpenList}
        />
      ))}

      {sheet && (
        <MealSheet
          date={sheet.date}
          slot={sheet.slot}
          planned={sheetEntry}
          meals={meals}
          settings={settings}
          globalTimeFormat={globalTimeFormat}
          todayISO={todayISO}
          fromMealie={fromMealie}
          paused={paused}
          onRetry={retryLoad}
          onClose={closeSheet}
          onPick={setPicker}
          onMoveCourse={(from, to) => void moveCourse(sheet.date, sheet.slot, from, to)}
          onRemoveCourse={(index) => void removeCourse(sheet.date, sheet.slot, index)}
          onSetTime={(time) => void setSlotTime(sheet.date, sheet.slot, time)}
          onClear={() => clearMeal(sheet.date, sheet.slot, closeSheet)}
          wallNotices={wallNotices}
        />
      )}

      {picker && (
        <MealPickerSheet
          key={`${picker.date}|${picker.slot}|${picker.pick}|${picker.pick === 'main' ? '' : picker.kind}`}
          target={picker}
          subtitle={t('mealsPlan.picker.subtitle', {
            slot: tModules(getMealSlotLabelKey(picker.slot)),
            day: dayNamesFull[isoWeekday(picker.date)],
          })}
          fromMealie={fromMealie}
          library={savedMeals}
          chosenIds={new Set(chosen?.mealIds)}
          initialText={chosen?.text ?? ''}
          onPickMeal={(meal) => pickMeal(picker, meal)}
          onPickText={(text) => pickText(picker, text)}
          onClose={() => setPicker(null)}
          onOpenLibrary={() => { setSheet(null); openView('library'); }}
        />
      )}

      {confirmAction && (
        <ConfirmSheet
          title={confirmAction.title}
          description={confirmAction.description}
          confirmLabel={confirmAction.confirmLabel}
          tone={confirmAction.tone}
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {/* Rate dinner is something the family does, not a view of the plan, so
          it opens over whichever tab is up and closes back onto it. */}
      {ratingDinner && (
        <DinnerRatingSheet
          weekDates={weekDates}
          todayISO={todayISO}
          nowMinutes={nowMinutes}
          plan={plan}
          meals={meals}
          defaultSlotTimes={settings.defaultSlotTimes}
          waiting={unreachable
            ? <MealieUnreachable problem={status.state === 'unreachable' || status.state === 'stale' ? status.problem : 'unreachable'} onRetry={retryWeek} />
            : !weekReady ? <MealsWeekLoading /> : null}
          onClose={() => setRatingDinner(false)}
        />
      )}

      {showSettings && (
        <MealsSettingsSheet
          settings={settings}
          globalTimeFormat={globalTimeFormat}
          mealieConnected={mealieConnected}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
    </MealVotesProvider>
  );
}
