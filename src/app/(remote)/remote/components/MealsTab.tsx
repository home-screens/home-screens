'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { SavedMeal, PlannedMeal, MealSlotType, MealSettings } from '@/types/config';
import { generateGroceryList } from '@/lib/grocery-utils';
import { generateRandomPlan } from '@/lib/meal-shuffle';
import { toISODate, filterPlanToWeek, replaceWeekInPlan, copyWeekEntries, alignToWeekStart } from '@/lib/meal-constants';
import { useMealsData } from '../hooks/useMealsData';
import { useMealForm } from '../hooks/useMealForm';
import { normalizeTag } from '@/lib/meal-constants';
import { getWeekDates, currentActiveSlot } from './meals-shared';
import MealsWeekView from './MealsWeekView';
import MealsPlanView from './MealsPlanView';
import MealsLibraryView from './MealsLibraryView';
import MealsGroceryView from './MealsGroceryView';
import MealsSettingsSheet from './MealsSettingsSheet';
import ConfirmSheet from './ConfirmSheet';

export default function MealsTab() {
  const {
    savedMeals,
    setSavedMeals,
    plan,
    setPlan,
    groceryChecked,
    settings,
    setSettings,
    loading,
    saving,
    setSaving,
    saveError,
    setSaveError,
    saveData,
    saveSettingsOnly,
    toggleGroceryItem,
    fetchData,
  } = useMealsData();

  const form = useMealForm();

  const [subView, setSubView] = useState<'week' | 'plan' | 'library' | 'grocery'>('week');
  const [pickingSlot, setPickingSlot] = useState<{ date: string; slot: MealSlotType } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [confirmAction, setConfirmAction] = useState<{ title: string; description: string; confirmLabel: string; onConfirm: () => void } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Week navigation state — initialized as a placeholder; the effect below
  // re-aligns it to the household's weekStartDay once settings load.
  const [viewingWeekStart, setViewingWeekStart] = useState<Date>(() => new Date());

  // Wall-clock tick — drives the "active slot" highlight and time-aware
  // fade-out of past slots. Without this tick, memoized values like
  // `activeSlotType` and `currentHour` freeze at first render, so a phone
  // left open at 4:55 PM would still show "Lunch • Now" at 6:00 PM.
  // Ticks once a minute, which is fine-grained enough for slot boundaries.
  const [clockNow, setClockNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setClockNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Re-align the week origin to today whenever the household's weekStartDay
  // changes. Anchored to today (not to the existing `viewingWeekStart`) so the
  // user always lands on the current week regardless of whether they were
  // viewing a future or past week when the setting changed. See the
  // alignToWeekStart unit tests for the offset math, including the regression
  // case for the compounding-offset bug.
  //
  // This also fires on mount (after fetchData resolves with a non-default
  // weekStartDay), so we don't need a separate initial-alignment effect.
  useEffect(() => {
    setViewingWeekStart(alignToWeekStart(new Date(), settings.weekStartDay));
  }, [settings.weekStartDay]);

  const weekDates = useMemo(
    () => getWeekDates(viewingWeekStart, settings.weekStartDay),
    [viewingWeekStart, settings.weekStartDay],
  );
  // Derive todayISO from the tick so a phone left open past midnight rolls
  // the "Today" highlight to the new day automatically.
  const todayISO = useMemo(() => toISODate(clockNow), [clockNow]);
  const currentHour = useMemo(() => clockNow.getHours(), [clockNow]);
  // Re-run when the clock ticks so "active slot" advances across slot
  // boundaries. Otherwise this memo would freeze at first render.
  const activeSlotType = useMemo(
    () => currentActiveSlot(settings.enabledSlots, clockNow),
    [settings.enabledSlots, clockNow],
  );
  const isCurrentWeek = weekDates.some((d) => d.date === todayISO);

  // Filter plan to viewed week
  const weekPlan = useMemo(
    () => filterPlanToWeek(plan, weekDates[0].date, weekDates[6].date),
    [plan, weekDates],
  );

  const navigateWeek = useCallback((direction: -1 | 1) => {
    setViewingWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + direction * 7);
      return next;
    });
  }, []);

  const jumpToToday = useCallback(() => {
    setViewingWeekStart(alignToWeekStart(new Date(), settings.weekStartDay));
  }, [settings.weekStartDay]);

  const getMealForSlot = useCallback((date: string, slot: MealSlotType): { planned: PlannedMeal | undefined; meal: SavedMeal | undefined } => {
    const planned = weekPlan.find((p) => p.date === date && p.slot === slot);
    const meal = planned?.mealId ? savedMeals.find((m) => m.id === planned.mealId) : undefined;
    return { planned, meal };
  }, [weekPlan, savedMeals]);

  const assignMealToSlot = useCallback(async (date: string, slot: MealSlotType, mealId: string) => {
    const existing = plan.find((p) => p.date === date && p.slot === slot);
    const newPlan = plan.filter((p) => !(p.date === date && p.slot === slot));
    // Preserve existing per-instance fields (time, notes, customText) when swapping the meal
    newPlan.push({ ...(existing ?? {}), date, slot, mealId });
    setPlan(newPlan);
    setPickingSlot(null);
    await saveData(savedMeals, newPlan);
  }, [plan, savedMeals, saveData, setPlan]);

  const clearSlot = useCallback(async (date: string, slot: MealSlotType) => {
    const newPlan = plan.filter((p) => !(p.date === date && p.slot === slot));
    setPlan(newPlan);
    await saveData(savedMeals, newPlan);
  }, [plan, savedMeals, saveData, setPlan]);

  const setSlotTime = useCallback(async (date: string, slot: MealSlotType, time: string | undefined) => {
    const existing = plan.find((p) => p.date === date && p.slot === slot);
    if (!existing) return;
    const updated: PlannedMeal = { ...existing };
    if (time) {
      updated.time = time;
    } else {
      delete updated.time;
    }
    const newPlan = plan.map((p) => (p === existing ? updated : p));
    setPlan(newPlan);
    await saveData(savedMeals, newPlan);
  }, [plan, savedMeals, saveData, setPlan]);

  const saveSettings = useCallback(async (next: MealSettings): Promise<boolean> => {
    const prev = settings;
    setSettings(next); // optimistic update
    // Settings-only PUT — does not round-trip meals/plan, so it can't clobber
    // a concurrent meal write from the editor or another /remote tab.
    const ok = await saveSettingsOnly(next);
    if (!ok) {
      // Server rejected the write — revert local state so the UI matches
      // what's actually on disk. The useMealsData hook will have set
      // `saveError` which the toast already renders.
      setSettings(prev);
    }
    return ok;
  }, [settings, saveSettingsOnly, setSettings]);

  const clearAllPlan = useCallback(() => {
    setConfirmAction({
      title: 'Clear plan?',
      description: 'This will remove all planned meals for this week.',
      confirmLabel: 'Clear Week',
      onConfirm: async () => {
        const weekSet = new Set(weekDates.map((d) => d.date));
        const remaining = plan.filter((p) => !weekSet.has(p.date));
        setPlan(remaining);
        await saveData(savedMeals, remaining);
        setConfirmAction(null);
      },
    });
  }, [savedMeals, plan, weekDates, saveData, setPlan]);

  const suggestRandom = useCallback(async () => {
    if (savedMeals.length === 0) return;
    const weekDateStrs = weekDates.map((d) => d.date);
    const newWeek = generateRandomPlan(savedMeals, settings.enabledSlots, weekDateStrs);
    const merged = replaceWeekInPlan(plan, weekDateStrs, newWeek);
    setPlan(merged);
    await saveData(savedMeals, merged);
  }, [savedMeals, plan, weekDates, settings.enabledSlots, saveData, setPlan]);

  const copyLastWeek = useCallback(async () => {
    const prevStart = new Date(viewingWeekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    // Pass the household's weekStartDay so the previous-week window aligns
    // correctly for Monday-start households. Without this, prevStart was rolled
    // back to a Sunday and the 7-day window was shifted by one day.
    const prevWeekDates = getWeekDates(prevStart, settings.weekStartDay).map((d) => d.date);
    const weekDateStrs = weekDates.map((d) => d.date);
    const restamped = copyWeekEntries(plan, prevWeekDates, weekDateStrs);
    if (restamped.length === 0) return;
    const merged = replaceWeekInPlan(plan, weekDateStrs, restamped);
    setPlan(merged);
    await saveData(savedMeals, merged);
  }, [plan, savedMeals, viewingWeekStart, weekDates, settings.weekStartDay, saveData, setPlan]);

  const hasPreviousWeekEntries = useMemo(() => {
    const prevStart = new Date(viewingWeekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    // Same fix as copyLastWeek — must honor weekStartDay or the previous-week
    // window is misaligned for Monday-start households.
    const prevWeekDates = getWeekDates(prevStart, settings.weekStartDay);
    return filterPlanToWeek(plan, prevWeekDates[0].date, prevWeekDates[6].date).length > 0;
  }, [plan, viewingWeekStart, settings.weekStartDay]);

  const openNewMealForm = () => {
    form.openNew(() => setSaveError(null));
  };

  const openEditMealForm = (meal: SavedMeal) => {
    form.openEdit(meal, () => setSaveError(null));
  };

  const saveMealForm = async () => {
    if (!form.formName.trim() || saving) return;
    setSaving(true);
    setSaveError(null);

    const mealData = form.buildMealData();

    let newMeals: SavedMeal[];
    if (form.editingMeal === 'new') {
      newMeals = [...savedMeals, mealData];
    } else {
      newMeals = savedMeals.map((m) => (m.id === mealData.id ? mealData : m));
    }

    const ok = await saveData(newMeals, plan);
    setSaving(false);
    if (ok) {
      setSavedMeals(newMeals);
      form.setEditingMeal(null);
    }
  };

  const deleteMeal = () => {
    if (form.editingMeal === 'new' || form.editingMeal === null) return;
    const mealToDelete = form.editingMeal;
    setConfirmAction({
      title: `Delete "${mealToDelete.name}"?`,
      description: 'This will also remove it from any planned slots.',
      confirmLabel: 'Delete Meal',
      onConfirm: async () => {
        const id = mealToDelete.id;
        const newMeals = savedMeals.filter((m) => m.id !== id);
        const newPlan = plan.filter((p) => p.mealId !== id);
        setSavedMeals(newMeals);
        setPlan(newPlan);
        form.setEditingMeal(null);
        setConfirmAction(null);
        await saveData(newMeals, newPlan);
      },
    });
  };

  const toggleFavorite = async (mealId: string) => {
    const newMeals = savedMeals.map((m) =>
      m.id === mealId ? { ...m, isFavorite: !m.isFavorite } : m,
    );
    setSavedMeals(newMeals);
    await saveData(newMeals, plan);
  };

  const filteredMeals = useMemo(() => {
    let result = savedMeals;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((m) =>
        m.name.toLowerCase().includes(q) ||
        m.tags?.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (filterTag === 'favorites') {
      result = result.filter((m) => m.isFavorite);
    } else if (filterTag !== 'all') {
      result = result.filter((m) => m.tags?.some((t) => normalizeTag(t) === filterTag));
    }
    return result;
  }, [savedMeals, searchQuery, filterTag]);

  const groceryList = useMemo(() => generateGroceryList(weekPlan, savedMeals, groceryChecked), [weekPlan, savedMeals, groceryChecked]);

  const groceryStats = useMemo(() => {
    let total = 0;
    let checked = 0;
    for (const [, cat] of groceryList) {
      for (const item of cat.items) {
        total++;
        if (item.checked) checked++;
      }
    }
    return { total, checked };
  }, [groceryList]);

  if (loading) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: 'var(--hs-text-faint)' }}>Loading meals...</div>
      </div>
    );
  }

  // Format week date range for header
  const startDate = new Date(weekDates[0].date + 'T12:00:00');
  const endDate = new Date(weekDates[6].date + 'T12:00:00');
  const formatShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const weekLabel = isCurrentWeek ? 'This Week' : `${formatShort(startDate)} – ${formatShort(endDate)}`;

  return (
    <div>
      {/* Header */}
      <div style={{ padding: '12px 0 4px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--hs-text-faint)' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long' })}
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--hs-text-primary)', margin: 0 }}>Meals</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            border: '1px solid var(--hs-border)',
            background: 'var(--hs-bg-panel)',
            color: 'var(--hs-text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'inherit',
          }}
          aria-label="Open meal settings"
          title="Settings"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* Sub-navigation */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: 3,
          background: 'var(--hs-bg-panel)',
          borderRadius: 10,
          marginTop: 12,
          marginBottom: 16,
        }}
      >
        {(['week', 'plan', 'library', 'grocery'] as const).map((view) => {
          const labels: Record<typeof view, string> = {
            week: weekLabel,
            plan: 'Plan',
            library: 'Library',
            grocery: 'Grocery',
          };
          const icons: Record<typeof view, React.ReactNode> = {
            week: (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="2" width="12" height="11" rx="1.5" /><line x1="1" y1="5.5" x2="13" y2="5.5" /><line x1="4.5" y1="1" x2="4.5" y2="3" /><line x1="9.5" y1="1" x2="9.5" y2="3" />
              </svg>
            ),
            plan: (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="1" width="3.5" height="3.5" rx="0.5" /><rect x="5.25" y="1" width="3.5" height="3.5" rx="0.5" /><rect x="9.5" y="1" width="3.5" height="3.5" rx="0.5" /><rect x="1" y="5.25" width="3.5" height="3.5" rx="0.5" /><rect x="5.25" y="5.25" width="3.5" height="3.5" rx="0.5" /><rect x="9.5" y="5.25" width="3.5" height="3.5" rx="0.5" /><rect x="1" y="9.5" width="3.5" height="3.5" rx="0.5" /><rect x="5.25" y="9.5" width="3.5" height="3.5" rx="0.5" /><rect x="9.5" y="9.5" width="3.5" height="3.5" rx="0.5" />
              </svg>
            ),
            library: (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 2 L2 5 L2 12 L7 9.5 L12 12 L12 5 Z" /><line x1="7" y1="2" x2="7" y2="9.5" />
              </svg>
            ),
            grocery: (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 1 L3 1 L4.5 9 L11.5 9" /><circle cx="5.5" cy="12" r="1" /><circle cx="10.5" cy="12" r="1" /><path d="M3.5 3.5 L12.5 3.5 L11.5 9 L4.5 9 Z" />
              </svg>
            ),
          };
          return (
            <button
              key={view}
              onClick={() => setSubView(view)}
              style={{
                flex: 1,
                padding: '8px 6px',
                minHeight: 40,
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s',
                background: subView === view ? 'var(--hs-border)' : 'transparent',
                color: subView === view ? 'var(--hs-text-primary)' : 'var(--hs-text-faint)',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
              }}
            >
              {icons[view]}
              {labels[view]}
            </button>
          );
        })}
      </div>

      {/* Week navigation (shown for week/plan/grocery views) */}
      {(subView === 'week' || subView === 'plan' || subView === 'grocery') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => navigateWeek(-1)}
            style={{
              width: 32, height: 32, borderRadius: 8, border: '1px solid var(--hs-border)',
              background: 'transparent', color: 'var(--hs-text-muted)', fontSize: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
            }}
          >
            ‹
          </button>
          <span style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--hs-text-muted)' }}>
            {isCurrentWeek ? 'This Week' : `${formatShort(startDate)} – ${formatShort(endDate)}`}
          </span>
          <button
            onClick={() => navigateWeek(1)}
            style={{
              width: 32, height: 32, borderRadius: 8, border: '1px solid var(--hs-border)',
              background: 'transparent', color: 'var(--hs-text-muted)', fontSize: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
            }}
          >
            ›
          </button>
          {!isCurrentWeek && (
            <button
              onClick={jumpToToday}
              style={{
                padding: '4px 12px', borderRadius: 6, border: 'none',
                background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
                fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Today
            </button>
          )}
        </div>
      )}

      {subView === 'week' && (
        <MealsWeekView
          savedMeals={savedMeals}
          plan={weekPlan}
          weekDates={weekDates}
          todayISO={todayISO}
          activeSlot={activeSlotType}
          currentHour={currentHour}
          getMealForSlot={getMealForSlot}
          settings={settings}
          setSubView={setSubView}
        />
      )}

      {subView === 'plan' && (
        <MealsPlanView
          savedMeals={savedMeals}
          plan={weekPlan}
          weekDates={weekDates}
          todayISO={todayISO}
          activeSlot={activeSlotType}
          currentHour={currentHour}
          getMealForSlot={getMealForSlot}
          assignMealToSlot={assignMealToSlot}
          clearSlot={clearSlot}
          setSlotTime={setSlotTime}
          clearAllPlan={clearAllPlan}
          suggestRandom={suggestRandom}
          copyLastWeek={copyLastWeek}
          hasPreviousWeek={hasPreviousWeekEntries}
          pickingSlot={pickingSlot}
          setPickingSlot={setPickingSlot}
          settings={settings}
          setSubView={setSubView}
        />
      )}

      {subView === 'library' && (
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
      )}

      {subView === 'grocery' && (
        <MealsGroceryView
          groceryList={groceryList}
          groceryStats={groceryStats}
          toggleGroceryItem={toggleGroceryItem}
        />
      )}

      {/* Confirmation dialog */}
      {confirmAction && (
        <ConfirmSheet
          title={confirmAction.title}
          description={confirmAction.description}
          confirmLabel={confirmAction.confirmLabel}
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {/* Settings sheet */}
      {showSettings && (
        <MealsSettingsSheet
          settings={settings}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Save error toast */}
      {saveError && !form.editingMeal && (
        <div
          style={{
            position: 'fixed',
            bottom: 100,
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
