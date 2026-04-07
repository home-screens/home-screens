'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import Button from '@/components/ui/Button';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import MealPlannerModal from '@/components/editor/meal-planner-modal';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import { DEFAULT_ACCENT_COLOR, TYPOGRAPHY_SIZES, DEFAULT_MEAL_SETTINGS } from '@/lib/meal-constants';
import { displayCache } from '@/lib/display-cache';
import type {
  ModuleInstance,
  FullscreenMealPlannerConfig,
  MealSettings,
  SavedMeal,
  PlannedMeal,
} from '@/types/config';

type Config = Partial<FullscreenMealPlannerConfig>;

interface MealsPayload {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  settings: MealSettings;
}

const VIEWS = [
  { value: 'week', label: 'Week' },
  { value: 'today', label: 'Today' },
  { value: 'menu-board', label: 'Menu Board' },
  { value: 'next-meal', label: 'Next Meal' },
] as const;

export function FullscreenMealPlannerConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);
  const [showModal, setShowModal] = useState(false);
  const [mealData, setMealData] = useState<MealsPayload>({
    savedMeals: [],
    plan: [],
    settings: { ...DEFAULT_MEAL_SETTINGS },
  });

  const fetchMealData = useCallback(() => {
    fetch('/api/meals/data')
      .then((r) => r.json())
      .then((d) => setMealData({
        savedMeals: d.savedMeals ?? [],
        plan: d.plan ?? [],
        settings: d.settings ?? { ...DEFAULT_MEAL_SETTINGS },
      }))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchMealData(); }, [fetchMealData, showModal]);

  // One-time migration: strip stale slots/weekStartDay fields from this
  // module's in-memory config. These fields used to live on
  // FullscreenMealPlannerConfig but now come from the shared meals.json
  // `settings` block. The server migration (parseAndMigrate) atomically
  // harvests any embedded data from data/config.json on first read, so
  // this effect only needs to clean up the local Zustand store.
  useEffect(() => {
    const raw = mod.config as Record<string, unknown>;
    if (raw?.slots !== undefined || raw?.weekStartDay !== undefined) {
      set({ slots: undefined, weekStartDay: undefined } as unknown as Config);
      displayCache.invalidate('/api/meals/data');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ref for stable closure in handleModalUpdate
  const mealDataRef = useRef(mealData);
  useEffect(() => { mealDataRef.current = mealData; }, [mealData]);

  const handleModalUpdate = useCallback(async (updates: Record<string, unknown>) => {
    const current = mealDataRef.current;
    // The modal only edits meals + plan. Don't include `settings` in the PUT body —
    // the API preserves existing settings when the field is omitted, which avoids
    // clobbering changes made concurrently from /remote or Settings → Meals since
    // this panel last fetched (the cached `current.settings` could be stale).
    const optimistic: MealsPayload = {
      savedMeals: (updates.savedMeals as SavedMeal[]) ?? current.savedMeals,
      plan: (updates.plan as PlannedMeal[]) ?? current.plan,
      settings: current.settings, // local optimistic state only — not sent
    };
    // Update local state immediately so the modal reflects changes without waiting for the server
    setMealData(optimistic);
    try {
      const res = await fetch('/api/meals/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          savedMeals: optimistic.savedMeals,
          plan: optimistic.plan,
          // settings deliberately omitted — API preserves existing
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMealData({
          savedMeals: data.savedMeals,
          plan: data.plan,
          // Use the server-returned settings (which may have been updated by
          // another surface in the meantime) so the local cache stays correct.
          settings: data.settings ?? optimistic.settings,
        });
      }
      // Notify the canvas preview to refetch via displayCache invalidation
      displayCache.invalidate('/api/meals/data');
    } catch {}
  }, []);

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
          onChange={(e) => set({ typographySize: e.target.value as typeof TYPOGRAPHY_SIZES[number]['value'] })}
          className={INPUT_CLASS}
        >
          {TYPOGRAPHY_SIZES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>

      {/* Display Toggles */}
      <Toggle label="Show Emoji" checked={c.showEmoji !== false} onChange={(v) => set({ showEmoji: v })} />
      <Toggle label="Show Prep Time" checked={c.showPrepTime !== false} onChange={(v) => set({ showPrepTime: v })} />
      <Toggle label="Show Tags" checked={c.showTags !== false} onChange={(v) => set({ showTags: v })} />
      <Toggle label="Show Difficulty" checked={!!c.showDifficulty} onChange={(v) => set({ showDifficulty: v })} />

      {/* Accent Color */}
      <ColorPicker
        label="Accent Color"
        value={c.accentColor ?? DEFAULT_ACCENT_COLOR}
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
        Meal slots, week start, time format, and default serving times are shared across
        all meal modules. Edit them from{' '}
        <a href="/editor/settings?tab=meals" className="text-blue-400 hover:text-blue-300 underline">Settings &rarr; Meals</a>{' '}
        or the <span className="text-neutral-400">/remote</span> settings drawer.
      </p>

      {/* Modal */}
      {showModal && (
        <MealPlannerModal
          savedMeals={mealData.savedMeals}
          plan={mealData.plan}
          settings={mealData.settings}
          accentColor={c.accentColor ?? DEFAULT_ACCENT_COLOR}
          onUpdate={handleModalUpdate}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
