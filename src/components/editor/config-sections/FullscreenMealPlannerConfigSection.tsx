'use client';

import { useState, useEffect, useCallback } from 'react';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import Button from '@/components/ui/Button';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import MealPlannerModal from '@/components/editor/meal-planner-modal';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import { displayCache } from '@/lib/display-cache';
import type {
  ModuleInstance,
  FullscreenMealPlannerConfig,
  MealSlotType,
  SavedMeal,
  PlannedMeal,
} from '@/types/config';

type Config = Partial<FullscreenMealPlannerConfig>;

const VIEWS = [
  { value: 'week', label: 'Week' },
  { value: 'today', label: 'Today' },
  { value: 'menu-board', label: 'Menu Board' },
  { value: 'next-meal', label: 'Next Meal' },
] as const;

const ALL_SLOTS: MealSlotType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function FullscreenMealPlannerConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);
  const [showModal, setShowModal] = useState(false);
  const [mealData, setMealData] = useState<{ savedMeals: SavedMeal[]; plan: PlannedMeal[]; previousPlan: PlannedMeal[] }>({ savedMeals: [], plan: [], previousPlan: [] });

  const fetchMealData = useCallback(() => {
    fetch('/api/meals/data')
      .then((r) => r.json())
      .then((d) => setMealData({
        savedMeals: d.savedMeals ?? [],
        plan: d.plan ?? [],
        previousPlan: d.previousPlan ?? [],
      }))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchMealData(); }, [fetchMealData, showModal]);

  const handleModalUpdate = useCallback(async (updates: Record<string, unknown>) => {
    const optimistic = {
      savedMeals: (updates.savedMeals as SavedMeal[]) ?? mealData.savedMeals,
      plan: (updates.plan as PlannedMeal[]) ?? mealData.plan,
      previousPlan: (updates.previousPlan as PlannedMeal[]) ?? mealData.previousPlan,
    };
    // Update local state immediately so the modal reflects changes without waiting for the server
    setMealData(optimistic);
    try {
      const res = await fetch('/api/meals/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(optimistic),
      });
      if (res.ok) {
        const data = await res.json();
        setMealData({ savedMeals: data.savedMeals, plan: data.plan, previousPlan: data.previousPlan ?? [] });
      }
      // Notify the canvas preview to refetch via displayCache invalidation
      displayCache.invalidate('/api/meals/data');
    } catch {}
  }, [mealData]);

  const activeSlots = c.slots ?? ['breakfast', 'lunch', 'dinner'];

  return (
    <>
      {/* Theme Override */}
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-neutral-400">Theme</span>
        <select
          value={c.theme ?? ''}
          onChange={(e) => set({ theme: e.target.value || undefined })}
          className={INPUT_CLASS}
        >
          <option value="">Default (from Settings)</option>
          {FULLSCREEN_THEMES.map((t) => (
            <option key={t.id} value={t.id}>{t.name} ({t.group})</option>
          ))}
        </select>
      </label>

      {/* View */}
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-neutral-400">View</span>
        <select
          value={c.view ?? 'week'}
          onChange={(e) => set({ view: e.target.value as FullscreenMealPlannerConfig['view'] })}
          className={INPUT_CLASS}
        >
          {VIEWS.map((v) => (
            <option key={v.value} value={v.value}>{v.label}</option>
          ))}
        </select>
      </label>

      {/* Density */}
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-neutral-400">Density</span>
        <select
          value={c.density ?? 'cozy'}
          onChange={(e) => set({ density: e.target.value as 'cozy' | 'snug' })}
          className={INPUT_CLASS}
        >
          <option value="cozy">Cozy</option>
          <option value="snug">Snug</option>
        </select>
      </label>

      {/* Typography Size */}
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-neutral-400">Typography Size</span>
        <select
          value={c.typographySize ?? 'medium'}
          onChange={(e) => set({ typographySize: e.target.value as 'small' | 'medium' | 'large' | 'extra-large' })}
          className={INPUT_CLASS}
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
          <option value="extra-large">Extra Large</option>
        </select>
      </label>

      {/* Week Start */}
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-neutral-400">Week Starts On</span>
        <select
          value={c.weekStartDay ?? 'monday'}
          onChange={(e) => set({ weekStartDay: e.target.value as 'sunday' | 'monday' })}
          className={INPUT_CLASS}
        >
          <option value="sunday">Sunday</option>
          <option value="monday">Monday</option>
        </select>
      </label>

      {/* Meal Slots */}
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-neutral-400">Meal Slots</span>
        <div className="rounded-md bg-neutral-800 border border-neutral-600 divide-y divide-neutral-700">
          {ALL_SLOTS.map((slot) => (
            <label key={slot} className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-neutral-750">
              <input
                type="checkbox"
                checked={activeSlots.includes(slot)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...activeSlots, slot]
                    : activeSlots.filter((s) => s !== slot);
                  set({ slots: next });
                }}
                className="rounded bg-neutral-800 border-neutral-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
              />
              <span className="text-sm text-neutral-300 capitalize">{slot}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Display Toggles */}
      <Toggle label="Show Emoji" checked={c.showEmoji !== false} onChange={(v) => set({ showEmoji: v })} />
      <Toggle label="Show Prep Time" checked={c.showPrepTime !== false} onChange={(v) => set({ showPrepTime: v })} />
      <Toggle label="Show Tags" checked={c.showTags !== false} onChange={(v) => set({ showTags: v })} />
      <Toggle label="Show Difficulty" checked={!!c.showDifficulty} onChange={(v) => set({ showDifficulty: v })} />

      {/* Accent Color */}
      <ColorPicker
        label="Accent Color"
        value={c.accentColor ?? '#f59e0b'}
        onChange={(v) => set({ accentColor: v })}
      />

      {/* Open Modal */}
      <div className="pt-1 border-t border-neutral-700 space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span>{mealData.savedMeals.length} saved meals</span>
          <span>&middot;</span>
          <span>{mealData.plan.length} planned</span>
        </div>
        <Button
          variant="primary"
          className="w-full text-xs"
          onClick={() => setShowModal(true)}
        >
          Edit Meal Planner
        </Button>
      </div>

      {/* Mobile hint */}
      <p className="text-[11px] text-neutral-600 leading-relaxed">
        Plan meals and manage your grocery list from your phone via the Meals tab at{' '}
        <span className="text-neutral-400">{typeof window !== 'undefined' ? `${window.location.origin}/remote` : '/remote'}</span>
      </p>

      {/* Modal */}
      {showModal && (
        <MealPlannerModal
          savedMeals={mealData.savedMeals}
          plan={mealData.plan}
          previousPlan={mealData.previousPlan}
          slots={activeSlots}
          weekStartDay={c.weekStartDay ?? 'monday'}
          accentColor={c.accentColor ?? '#f59e0b'}
          onUpdate={handleModalUpdate}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
