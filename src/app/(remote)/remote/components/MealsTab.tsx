'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { SavedMeal, PlannedMeal, MealSlotType } from '@/types/config';
import { generateGroceryList } from '@/lib/grocery-utils';
import { generateRandomPlan } from '@/lib/meal-shuffle';
import { toISODate, filterPlanToWeek, replaceWeekInPlan, copyWeekEntries } from '@/lib/meal-constants';
import { useMealsData } from '../hooks/useMealsData';
import { useMealForm } from '../hooks/useMealForm';
import { SLOT_ORDER, normalizeTag } from '@/lib/meal-constants';
import { getWeekDates, currentSlotIndex } from './meals-shared';
import MealsWeekView from './MealsWeekView';
import MealsPlanView from './MealsPlanView';
import MealsLibraryView from './MealsLibraryView';
import MealsGroceryView from './MealsGroceryView';
import ConfirmSheet from './ConfirmSheet';

export default function MealsTab() {
  const {
    savedMeals,
    setSavedMeals,
    plan,
    setPlan,
    groceryChecked,
    loading,
    saving,
    setSaving,
    saveError,
    setSaveError,
    saveData,
    toggleGroceryItem,
    fetchData,
  } = useMealsData();

  const form = useMealForm();

  const [subView, setSubView] = useState<'week' | 'plan' | 'library' | 'grocery'>('week');
  const [pickingSlot, setPickingSlot] = useState<{ date: string; slot: MealSlotType } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [confirmAction, setConfirmAction] = useState<{ title: string; description: string; confirmLabel: string; onConfirm: () => void } | null>(null);

  // Week navigation state
  const [viewingWeekStart, setViewingWeekStart] = useState<Date>(() => {
    const now = new Date();
    const d = new Date(now);
    d.setDate(now.getDate() - now.getDay()); // align to Sunday
    return d;
  });

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const weekDates = useMemo(() => getWeekDates(viewingWeekStart), [viewingWeekStart]);
  const todayISO = toISODate(new Date());
  const currentSlot = currentSlotIndex();
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
    const now = new Date();
    const d = new Date(now);
    d.setDate(now.getDate() - now.getDay());
    setViewingWeekStart(d);
  }, []);

  const getMealForSlot = useCallback((date: string, slot: MealSlotType): { planned: PlannedMeal | undefined; meal: SavedMeal | undefined } => {
    const planned = weekPlan.find((p) => p.date === date && p.slot === slot);
    const meal = planned?.mealId ? savedMeals.find((m) => m.id === planned.mealId) : undefined;
    return { planned, meal };
  }, [weekPlan, savedMeals]);

  const assignMealToSlot = useCallback(async (date: string, slot: MealSlotType, mealId: string) => {
    const newPlan = plan.filter((p) => !(p.date === date && p.slot === slot));
    newPlan.push({ date, slot, mealId });
    setPlan(newPlan);
    setPickingSlot(null);
    await saveData(savedMeals, newPlan);
  }, [plan, savedMeals, saveData, setPlan]);

  const clearSlot = useCallback(async (date: string, slot: MealSlotType) => {
    const newPlan = plan.filter((p) => !(p.date === date && p.slot === slot));
    setPlan(newPlan);
    await saveData(savedMeals, newPlan);
  }, [plan, savedMeals, saveData, setPlan]);

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
    const newWeek = generateRandomPlan(savedMeals, SLOT_ORDER, weekDateStrs);
    const merged = replaceWeekInPlan(plan, weekDateStrs, newWeek);
    setPlan(merged);
    await saveData(savedMeals, merged);
  }, [savedMeals, plan, weekDates, saveData, setPlan]);

  const copyLastWeek = useCallback(async () => {
    const prevStart = new Date(viewingWeekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    const prevWeekDates = getWeekDates(prevStart).map((d) => d.date);
    const weekDateStrs = weekDates.map((d) => d.date);
    const restamped = copyWeekEntries(plan, prevWeekDates, weekDateStrs);
    if (restamped.length === 0) return;
    const merged = replaceWeekInPlan(plan, weekDateStrs, restamped);
    setPlan(merged);
    await saveData(savedMeals, merged);
  }, [plan, savedMeals, viewingWeekStart, weekDates, saveData, setPlan]);

  const hasPreviousWeekEntries = useMemo(() => {
    const prevStart = new Date(viewingWeekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    const prevWeekDates = getWeekDates(prevStart);
    return filterPlanToWeek(plan, prevWeekDates[0].date, prevWeekDates[6].date).length > 0;
  }, [plan, viewingWeekStart]);

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
        <div style={{ fontSize: 14, color: '#525252' }}>Loading meals...</div>
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
      <div style={{ padding: '12px 0 4px' }}>
        <div style={{ fontSize: 12, color: '#525252' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long' })}
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fafafa', margin: 0 }}>Meals</h2>
      </div>

      {/* Sub-navigation */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: 3,
          background: '#171717',
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
                background: subView === view ? '#262626' : 'transparent',
                color: subView === view ? '#fafafa' : '#525252',
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
              width: 32, height: 32, borderRadius: 8, border: '1px solid #262626',
              background: 'transparent', color: '#a3a3a3', fontSize: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
            }}
          >
            ‹
          </button>
          <span style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#a3a3a3' }}>
            {isCurrentWeek ? 'This Week' : `${formatShort(startDate)} – ${formatShort(endDate)}`}
          </span>
          <button
            onClick={() => navigateWeek(1)}
            style={{
              width: 32, height: 32, borderRadius: 8, border: '1px solid #262626',
              background: 'transparent', color: '#a3a3a3', fontSize: 16, cursor: 'pointer',
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
          currentSlot={currentSlot}
          getMealForSlot={getMealForSlot}
          setSubView={setSubView}
        />
      )}

      {subView === 'plan' && (
        <MealsPlanView
          savedMeals={savedMeals}
          plan={weekPlan}
          weekDates={weekDates}
          todayISO={todayISO}
          currentSlot={currentSlot}
          getMealForSlot={getMealForSlot}
          assignMealToSlot={assignMealToSlot}
          clearSlot={clearSlot}
          clearAllPlan={clearAllPlan}
          suggestRandom={suggestRandom}
          copyLastWeek={copyLastWeek}
          hasPreviousWeek={hasPreviousWeekEntries}
          pickingSlot={pickingSlot}
          setPickingSlot={setPickingSlot}
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

      {/* Save error toast */}
      {saveError && !form.editingMeal && (
        <div
          style={{
            position: 'fixed',
            bottom: 100,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#ef4444',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            zIndex: 250,
            boxShadow: '0 4px 20px rgba(239,68,68,0.3)',
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
