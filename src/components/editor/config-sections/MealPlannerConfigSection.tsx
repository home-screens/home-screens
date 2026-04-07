'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import Button from '@/components/ui/Button';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import MealPlannerModal from '@/components/editor/meal-planner-modal';
import { DEFAULT_ACCENT_COLOR, DEFAULT_MEAL_SETTINGS } from '@/lib/meal-constants';
import { displayCache } from '@/lib/display-cache';
import type {
  ModuleInstance,
  MealPlannerView,
  MealSettings,
  SavedMeal,
  PlannedMeal,
} from '@/types/config';

type Config = {
  view?: MealPlannerView;
  showEmoji?: boolean;
  showPrepTime?: boolean;
  showTags?: boolean;
  accentColor?: string;
};

interface MealsPayload {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  settings: MealSettings;
}

const VIEWS: { value: MealPlannerView; label: string }[] = [
  { value: 'week', label: 'Week Grid' },
  { value: 'today', label: "Today's Meals" },
  { value: 'next-meal', label: 'Next Meal (Hero)' },
  { value: 'compact', label: 'Compact (Today + Tomorrow)' },
  { value: 'list', label: 'Full Week List' },
];

export function MealPlannerConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
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

  // Ref for stable closure in handleModalUpdate
  const mealDataRef = useRef(mealData);
  mealDataRef.current = mealData;

  // One-time migration: strip stale fields from the in-memory module config.
  //
  // The server-side migration (in `parseAndMigrate` / `migrateLegacyMealSettings`)
  // already harvests any embedded `savedMeals` / `plan` from data/config.json
  // into the shared meals.json atomically on first read. This effect just
  // removes the now-orphan fields from the local Zustand store so the next
  // editor save doesn't persist them again. No network round-trip needed,
  // which eliminates the race where two mounted meal-planner modules
  // simultaneously GET-merge-PUT and clobber each other's embedded data.
  useEffect(() => {
    const raw = mod.config as Record<string, unknown>;
    const hasStaleFields = raw?.slots !== undefined || raw?.weekStartDay !== undefined
      || raw?.savedMeals !== undefined || raw?.plan !== undefined || raw?.previousPlan !== undefined;
    if (!hasStaleFields) return;
    set({ savedMeals: undefined, plan: undefined, previousPlan: undefined, slots: undefined, weekStartDay: undefined } as unknown as Config);
    // Nudge the canvas preview so it re-fetches the (now migrated) meals.json
    // in case the server just backfilled embedded meals from this module.
    displayCache.invalidate('/api/meals/data');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      displayCache.invalidate('/api/meals/data');
    } catch {}
  }, []);

  return (
    <>
      {/* View Mode */}
      <ViewSelect
        value={c.view ?? 'week'}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />

      {/* Display Toggles */}
      <Toggle
        label="Show Emoji"
        checked={c.showEmoji ?? true}
        onChange={(v) => set({ showEmoji: v })}
      />
      <Toggle
        label="Show Prep Time"
        checked={c.showPrepTime ?? true}
        onChange={(v) => set({ showPrepTime: v })}
      />
      <Toggle
        label="Show Tags"
        checked={c.showTags ?? true}
        onChange={(v) => set({ showTags: v })}
      />

      {/* Accent Color */}
      <ColorPicker
        label="Accent Color"
        value={c.accentColor ?? DEFAULT_ACCENT_COLOR}
        onChange={(v) => set({ accentColor: v })}
      />

      {/* Note: planning settings (which slots, week start, default times, time format)
          are shared across all meal modules. Edit them from either Settings → Meals
          (in the editor) or the /remote settings drawer. */}
      <p className="text-[11px] text-neutral-600 leading-relaxed">
        Meal slots, week start, time format, and default serving times are managed from{' '}
        <a href="/editor/settings?tab=meals" className="text-blue-400 hover:text-blue-300 underline">Settings &rarr; Meals</a>{' '}
        or <span className="text-neutral-400">/remote</span> so all your meal modules stay in sync.
      </p>

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
          Edit Meal Plan
        </Button>
      </div>

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
