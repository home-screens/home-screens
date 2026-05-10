'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import Button from '@/components/ui/Button';
import LabeledField from '@/components/ui/LabeledField';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { editorFetch } from '@/lib/editor-fetch';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import MealPlannerModal from '@/components/editor/meal-planner-modal';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import { DEFAULT_ACCENT_COLOR, TYPOGRAPHY_SIZES, DEFAULT_MEAL_SETTINGS } from '@/lib/meal-constants';
import { displayCache } from '@/lib/display-cache';
import { useTranslate } from '@/i18n';
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

export function FullscreenMealPlannerConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);

  const VIEWS = [
    { value: 'week', label: t('configSections.fullscreen-meal-planner.viewWeek') },
    { value: 'today', label: t('configSections.fullscreen-meal-planner.viewToday') },
    { value: 'menu-board', label: t('configSections.fullscreen-meal-planner.viewMenuBoard') },
    { value: 'next-meal', label: t('configSections.fullscreen-meal-planner.viewNextMeal') },
  ] as const;

  const DENSITY_OPTIONS = [
    { value: 'cozy', label: t('configSections.fullscreen-meal-planner.densityCozy') },
    { value: 'snug', label: t('configSections.fullscreen-meal-planner.densitySnug') },
  ] as const;

  const [showModal, setShowModal] = useState(false);
  const [mealData, setMealData] = useState<MealsPayload>({
    savedMeals: [],
    plan: [],
    settings: { ...DEFAULT_MEAL_SETTINGS },
  });

  const fetchMealData = useCallback(() => {
    editorFetch('/api/meals/data')
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
      const res = await editorFetch('/api/meals/data', {
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
      <LabeledField label={t('configSections.fullscreen-meal-planner.theme')}>
        <select
          value={c.theme ?? ''}
          onChange={(e) => set({ theme: e.target.value || undefined })}
          className={INPUT_CLASS}
        >
          <option value="">{t('configSections.fullscreen-meal-planner.themeDefault')}</option>
          {FULLSCREEN_THEMES.map((theme) => (
            <option key={theme.id} value={theme.id}>{theme.name} ({theme.group})</option>
          ))}
        </select>
      </LabeledField>

      {/* View */}
      <LabeledSelect
        label={t('configSections.fullscreen-meal-planner.view')}
        value={c.view ?? 'week'}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />

      {/* Density */}
      <LabeledSelect
        label={t('configSections.fullscreen-meal-planner.density')}
        value={c.density ?? 'cozy'}
        onChange={(v) => set({ density: v })}
        options={DENSITY_OPTIONS}
      />

      {/* Typography Size */}
      <LabeledSelect
        label={t('configSections.fullscreen-meal-planner.typographySize')}
        value={c.typographySize ?? 'medium'}
        onChange={(v) => set({ typographySize: v })}
        options={TYPOGRAPHY_SIZES}
      />

      {/* Display Toggles */}
      <Toggle label={t('configSections.fullscreen-meal-planner.showEmoji')} checked={c.showEmoji !== false} onChange={(v) => set({ showEmoji: v })} />
      <Toggle label={t('configSections.fullscreen-meal-planner.showPrepTime')} checked={c.showPrepTime !== false} onChange={(v) => set({ showPrepTime: v })} />
      <Toggle label={t('configSections.fullscreen-meal-planner.showTags')} checked={c.showTags !== false} onChange={(v) => set({ showTags: v })} />
      <Toggle label={t('configSections.fullscreen-meal-planner.showDifficulty')} checked={!!c.showDifficulty} onChange={(v) => set({ showDifficulty: v })} />

      {/* Accent Color */}
      <ColorPicker
        label={t('configSections.fullscreen-meal-planner.accentColor')}
        value={c.accentColor ?? DEFAULT_ACCENT_COLOR}
        onChange={(v) => set({ accentColor: v })}
      />

      {/* Open Modal */}
      <div className="pt-1 border-t border-hs-border-strong space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-hs-text-faint">
          <span>{t('configSections.fullscreen-meal-planner.savedMealsCount', { count: mealData.savedMeals.length })}</span>
          <span>&middot;</span>
          <span>{t('configSections.fullscreen-meal-planner.plannedCount', { count: mealData.plan.length })}</span>
        </div>
        <Button
          variant="primary"
          className="w-full text-xs"
          onClick={() => setShowModal(true)}
        >
          {t('configSections.fullscreen-meal-planner.editMealPlanner')}
        </Button>
      </div>

      {/* Mobile hint */}
      <p className="text-[11px] text-hs-text-faint leading-relaxed">
        {t('configSections.fullscreen-meal-planner.mobileHintPrefix')}{' '}
        <a href="/editor/settings?tab=meals" className="text-hs-accent hover:text-hs-accent-hover underline">{t('configSections.fullscreen-meal-planner.mobileHintSettingsLink')}</a>{' '}
        {t('configSections.fullscreen-meal-planner.mobileHintSuffix')} <span className="text-hs-text-muted">/remote</span> {t('configSections.fullscreen-meal-planner.mobileHintEnd')}
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
