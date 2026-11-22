'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslate } from '@/i18n';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledSelect from '@/components/ui/LabeledSelect';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useMealPlannerData } from '@/hooks/useMealPlannerData';
import MealPlanLauncher from './MealPlanLauncher';
import { GroceryAddFields } from './GroceryAddFields';
import { mealViewOptions } from '@/lib/meal-view-options';
import { DEFAULT_ACCENT_COLOR } from '@/lib/meal-constants';
import { settingsPath } from '@/lib/settings-route';
import PhoneSurfaceLinks from '@/components/editor/PhoneSurfaceLinks';
import type {
  ModuleInstance,
  MealPlannerView,
  RecipeTapAction,
} from '@/types/config';

type Config = {
  view?: MealPlannerView;
  showEmoji?: boolean;
  showPrepTime?: boolean;
  showTags?: boolean;
  showFamilyRatings?: boolean;
  accentColor?: string;
  tapRecipeAction?: RecipeTapAction;
  showTitle?: boolean;
  interactive?: boolean;
  wallAdd?: boolean;
};

export function MealPlannerConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);
  const view = c.view ?? 'week';
  // Only the switches this view draws; a hidden one keeps its saved value.
  const reads = mealViewOptions('meal-planner', view);
  const VIEWS: { value: MealPlannerView; label: string }[] = [
    { value: 'week', label: t('configSections.meal-planner.viewWeek') },
    { value: 'today', label: t('configSections.meal-planner.viewToday') },
    { value: 'next-meal', label: t('configSections.meal-planner.viewNextMeal') },
    { value: 'compact', label: t('configSections.meal-planner.viewCompact') },
    { value: 'list', label: t('configSections.meal-planner.viewList') },
    { value: 'grocery', label: t('configSections.meal-planner.viewGrocery') },
    { value: 'recipes', label: t('configSections.meal-planner.viewRecipes') },
  ];
  const [showModal, setShowModal] = useState(false);
  const meals = useMealPlannerData<Config>({ mod, set, showModal });

  return (
    <>
      {/* View Mode */}
      <ViewSelect
        value={view}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />

      {/* Display Toggles */}
      {reads.pictures && (
        <Toggle
          label={t('configSections.meal-planner.showEmoji')}
          checked={c.showEmoji ?? true}
          onChange={(v) => set({ showEmoji: v })}
        />
      )}
      {reads.cookingTime && (
        <Toggle
          label={t('configSections.meal-planner.showPrepTime')}
          checked={c.showPrepTime ?? true}
          onChange={(v) => set({ showPrepTime: v })}
        />
      )}
      {reads.tags && (
        <Toggle
          label={t('configSections.meal-planner.showTags')}
          checked={c.showTags ?? true}
          onChange={(v) => set({ showTags: v })}
        />
      )}

      {reads.ratings && (
        <Toggle label={t('configSections.meal-planner.showFamilyRatings')} checked={c.showFamilyRatings !== false} onChange={(v) => set({ showFamilyRatings: v })} />
      )}

      {/* Tap-to-open recipe */}
      {reads.tapAction && (
        <>
          <LabeledSelect
            label={t('configSections.meal-planner.tapRecipeAction')}
            value={c.tapRecipeAction ?? 'off'}
            onChange={(v) => set({ tapRecipeAction: v })}
            options={[
              { value: 'off', label: t('configSections.meal-planner.tapRecipeActionOff') },
              { value: 'qr', label: t('configSections.meal-planner.tapRecipeActionQr') },
              { value: 'card', label: t('configSections.meal-planner.tapRecipeActionCard') },
              { value: 'iframe', label: t('configSections.meal-planner.tapRecipeActionIframe') },
            ]}
          />
          {c.tapRecipeAction === 'card' && (
            <p className="text-[11px] text-hs-text-faint leading-relaxed">
              {t('configSections.meal-planner.tapRecipeActionCardHint')}
            </p>
          )}
          {c.tapRecipeAction === 'iframe' && (
            <p className="text-[11px] text-hs-text-faint leading-relaxed">
              {t('configSections.meal-planner.tapRecipeActionIframeHint')}
            </p>
          )}
          {(c.tapRecipeAction === 'qr' || c.tapRecipeAction === 'iframe') && (
            <p className="text-[11px] text-hs-text-faint leading-relaxed">
              {t('configSections.meal-planner.tapRecipeActionNoLinkHint')}
            </p>
          )}
        </>
      )}

      {/* Every view follows it: ticking the grocery list, opening recipes, rating dinner and scrolling long lists on the wall */}
      <Toggle
        label={t('configSections.meal-planner.interactive')}
        checked={c.interactive !== false}
        onChange={(v) => set({ interactive: v })}
      />
      <p className="text-[11px] text-hs-text-faint leading-relaxed">
        {t('configSections.meal-planner.interactiveHint')}
      </p>
      {/* The grocery view's Add row needs taps (groceryCardAdds). */}
      {view === 'grocery' && c.interactive !== false && (
        <GroceryAddFields wallAdd={!!c.wallAdd} onWallAdd={(v) => set({ wallAdd: v })} />
      )}

      {/* Accent Color */}
      <ColorPicker
        label={t('configSections.meal-planner.accentColor')}
        value={c.accentColor ?? DEFAULT_ACCENT_COLOR}
        onChange={(v) => set({ accentColor: v })}
      />

      {/* Note: planning settings (which slots, week start, default times, time format)
          are shared across all meal modules. Edit them from either Settings → Meals
          (in the editor) or the /remote settings drawer. */}
      <p className="text-[11px] text-hs-text-faint leading-relaxed">
        {t('configSections.meal-planner.sharedSettingsPrefix')}{' '}
        <Link href={settingsPath({ kind: 'defaults', page: 'meals' })} className="text-hs-accent hover:text-hs-accent-hover underline">{t('configSections.meal-planner.sharedSettingsLink')}</Link>{' '}
        {t('configSections.meal-planner.sharedSettingsSuffix')}
      </p>
      <PhoneSurfaceLinks context="meals" />

      <MealPlanLauncher meals={meals} accentColor={c.accentColor ?? DEFAULT_ACCENT_COLOR} countKeyPrefix="meal-planner" open={showModal} onOpenChange={setShowModal} />
    </>
  );
}
