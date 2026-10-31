'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { getLocalizedDayNames, getMealSlotLabelKey, dateToDayIndex } from '@/lib/meal-constants';
import { useMealsTabData } from '../hooks/useMealsTabData';
import { readMealsPlace, writeMealsPlace, type MealPickTarget, type MealsSubView } from './meals-shared';
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

export default function MealsTab() {
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
    notice,
    dismissNotice,
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

  const [subView, setSubView] = useState<MealsSubView>(place.view);
  // Leaving a sub-tab takes its notice along: an Undo for the plan does not
  // follow the family onto the grocery list.
  const openView = useCallback((view: MealsSubView) => {
    if (view !== subView) dismissNotice();
    setSubView(view);
  }, [subView, dismissNotice]);
  const [showSettings, setShowSettings] = useState(false);
  const dayNamesFull = useMemo(() => getLocalizedDayNames(locale, 'full'), [locale]);
  const closeSheet = useCallback(() => setSheet(null), [setSheet]);

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
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center' }} data-testid="meals-load-error">
        <p role="alert" style={{ fontSize: 14, color: 'var(--hs-text-faint)', margin: 0 }}>{t('mealsTab.loadError')}</p>
        <button
          type="button"
          onClick={() => void retryLoad()}
          className="press-btn"
          style={{
            marginTop: 16,
            minHeight: 44,
            padding: '0 18px',
            borderRadius: 12,
            border: 'none',
            background: 'var(--hs-hover)',
            color: 'var(--hs-text-primary)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {t('mealsTab.retry')}
        </button>
      </div>
    );
  }

  const fromMealie = source === 'mealie';
  const baseUrl = status.state === 'local' ? undefined : status.baseUrl;
  // Mealie gave no answer and this is its last good copy: viewing stays
  // calm, planning pauses with one message saying why.
  const paused = fromMealie && !canEdit && status.state === 'stale' ? { updatedAt: status.updatedAt, problem: status.problem } : null;
  // No copy at all (or the hub could not fetch this week): say so instead of
  // drawing an empty week, which would read as nothing planned.
  const unreachable = fromMealie && (status.state === 'unreachable' || weekState === 'failed');

  // The week between the arrows: "This Week", or the dates of another.
  const weekLabel = isCurrentWeek ? t('mealsTab.weekLabel.thisWeek') : week.range;
  const weekReady = weekState === 'ready';

  const sheetEntry = sheet ? getMealForSlot(sheet.date, sheet.slot).planned : undefined;
  const pickerEntry = picker ? getMealForSlot(picker.date, picker.slot).planned : undefined;
  // What the picker marks with a tick: the dish being changed, or, when
  // adding, the dishes of that kind the meal already has.
  const chosenIds = new Set<string>();
  let pickerText = '';
  if (picker && pickerEntry) {
    if (picker.pick === 'main') {
      if (pickerEntry.mealId) chosenIds.add(pickerEntry.mealId);
      pickerText = pickerEntry.customText ?? '';
    } else if (picker.pick === 'swap') {
      const course = pickerEntry.courses?.[picker.index];
      if (course?.mealId) chosenIds.add(course.mealId);
      pickerText = course?.customText ?? '';
    } else {
      for (const c of pickerEntry.courses ?? []) if (c.kind === picker.kind && c.mealId) chosenIds.add(c.mealId);
    }
  }

  // Where the notice and a save error sit: above the tab bar (and above the
  // Library's add button), or, while a sheet is up, at the top of the screen
  // over the dimmed page. At the bottom they covered the sheet's own rows
  // (the serving time, Clear).
  const toastPlace: CSSProperties = sheet || picker || confirmAction || showSettings
    ? { top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }
    : { bottom: subView === 'library' && !fromMealie ? 144 : 100 };

  return (
    <div>
      <MealsTabHeader todayISO={todayISO} onOpenSettings={() => setShowSettings(true)} />
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
        <MealieUnreachable problem={status.state === 'unreachable' ? status.problem : 'unreachable'} onRetry={retryWeek} />
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
          <MealsMealieLibraryView baseUrl={baseUrl} />
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
        />
      ))}

      {subView === 'grocery' && (fromMealie ? (
        <MealsMealieGroceryView baseUrl={baseUrl} />
      ) : (
        <MealsGroceryView
          groceryList={groceryList}
          groceryStats={groceryStats}
          withoutIngredients={groceryWithoutIngredients}
          toggleGroceryItem={toggleGroceryItem}
          week={week}
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
        />
      )}

      {picker && (
        <MealPickerSheet
          key={`${picker.date}|${picker.slot}|${picker.pick}|${picker.pick === 'main' ? '' : picker.kind}`}
          target={picker}
          subtitle={t('mealsPlan.picker.subtitle', {
            slot: tModules(getMealSlotLabelKey(picker.slot)),
            day: dayNamesFull[dateToDayIndex(picker.date)],
          })}
          fromMealie={fromMealie}
          library={savedMeals}
          chosenIds={chosenIds}
          initialText={pickerText}
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
          confirmColor={confirmAction.confirmColor}
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
          zIndex={130}
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

      {notice && !saveError && (
        <div
          role="status"
          onClick={notice.undo ? undefined : dismissNotice}
          style={{
            position: 'fixed',
            ...toastPlace,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'max-content',
            maxWidth: 'calc(100% - 32px)',
            background: 'var(--hs-bg-panel)',
            border: '1px solid var(--hs-border)',
            color: 'var(--hs-text)',
            padding: '10px 18px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            textAlign: 'center',
            zIndex: 250,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <span>{notice.message}</span>
          {notice.undo && (
            <button
              type="button"
              onClick={() => { notice.undo?.(); dismissNotice(); }}
              style={{ minHeight: 36, padding: '0 12px', borderRadius: 8, border: '1px solid var(--hs-border)', background: 'transparent', color: '#f59e0b', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {t('mealsTab.notice.undo')}
            </button>
          )}
        </div>
      )}

      {saveError && !form.editingMeal && (
        <div
          style={{
            position: 'fixed',
            ...toastPlace,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--hs-danger)',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            zIndex: 250,
            boxShadow: 'none',
            cursor: 'pointer',
          }}
          onClick={() => setSaveError(null)}
          role="alert"
        >
          {saveError}
        </div>
      )}

    </div>
  );
}
