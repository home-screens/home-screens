'use client';

import Link from 'next/link';
import { useState } from 'react';
import Toggle from '@/components/ui/Toggle';
import FullscreenAccentPicker from './FullscreenAccentPicker';
import LabeledSelect from '@/components/ui/LabeledSelect';
import FullscreenThemeSelect from './FullscreenThemeSelect';
import { useTypographySizeOptions } from './useTypographySizeOptions';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useMealPlannerData } from '@/hooks/useMealPlannerData';
import { mealHasRecipe } from '@/lib/meal-recipe';
import MealPlanLauncher from './MealPlanLauncher';
import { mealViewOptions } from '@/lib/meal-view-options';
import { DEFAULT_ACCENT_COLOR } from '@/lib/meal-constants';
import { resolveFullscreenAccent } from '@/lib/fullscreen-themes';
import { useFullscreenThemeTokens } from '@/hooks/useFullscreenThemeTokens';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { settingsPath } from '@/lib/settings-route';
import PhoneSurfaceLinks from '@/components/editor/PhoneSurfaceLinks';
import type {
  ModuleInstance,
  FullscreenMealPlannerConfig,
} from '@/types/config';

type Config = Partial<FullscreenMealPlannerConfig>;

export function FullscreenMealPlannerConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const formattingLocale = useFormattingLocale();
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);
  const view = c.view ?? 'week';
  // Only the switches this view draws; a hidden one keeps its saved value.
  const reads = mealViewOptions('fullscreen-meal-planner', view);
  // The accent the module paints while accentColor is empty (see the module).
  const themeAccent = resolveFullscreenAccent('', useFullscreenThemeTokens('fullscreen-meal-planner', c.theme), DEFAULT_ACCENT_COLOR);
  const accentColor = c.accentColor || themeAccent;

  const VIEWS = [
    { value: 'week', label: t('configSections.fullscreen-meal-planner.viewWeek') },
    { value: 'today', label: t('configSections.fullscreen-meal-planner.viewToday') },
    { value: 'menu-board', label: t('configSections.fullscreen-meal-planner.viewMenuBoard') },
    { value: 'next-meal', label: t('configSections.fullscreen-meal-planner.viewNextMeal') },
    { value: 'recipe', label: t('configSections.fullscreen-meal-planner.viewRecipe') },
    { value: 'grocery', label: t('configSections.fullscreen-meal-planner.viewGrocery') },
    { value: 'recipes', label: t('configSections.fullscreen-meal-planner.viewRecipeBook') },
  ] as const;

  const DENSITY_OPTIONS = [
    { value: 'cozy', label: t('configSections.fullscreen-meal-planner.densityCozy') },
    { value: 'snug', label: t('configSections.fullscreen-meal-planner.densitySnug') },
  ] as const;

  const typographySizeOptions = useTypographySizeOptions();

  const [showModal, setShowModal] = useState(false);
  const meals = useMealPlannerData<Config>({ mod, set, showModal });
  const { mealData } = meals;

  return (
    <>
      {/* View first: it decides what the screen is; the theme only dresses it. */}
      <LabeledSelect
        label={t('configSections.fullscreen-meal-planner.view')}
        value={view}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />
      {/* The book holds only meals with a recipe: say how many that is right
          under the choice, before the wall shows an empty page. */}
      {(view === 'recipes' || view === 'recipe') && mealData.source !== 'mealie' && (() => {
        // Which meals are missing, by name, and where a recipe is added: the
        // Edit Meal Plan button below is right here, the phone is the other way.
        const without = mealData.savedMeals.filter((meal): boolean => !mealHasRecipe(meal)).map((meal) => meal.name);
        const named = without.length > 2
          ? [...without.slice(0, 2), t('configSections.fullscreen-meal-planner.andMore', { count: without.length - 2 })]
          : without;
        let missing = named.join(', ');
        try { missing = new Intl.ListFormat(formattingLocale, { type: 'conjunction' }).format(named); } catch { /* older engine */ }
        return (
          <p className="text-[11px] text-hs-text-muted leading-relaxed -mt-2" data-testid="fullscreen-meal-planner-recipe-count">
            {without.length === 0
              ? t('configSections.fullscreen-meal-planner.recipeCountAll', { count: mealData.savedMeals.length })
              : t('configSections.fullscreen-meal-planner.recipeCountHint', {
                count: mealData.savedMeals.length - without.length,
                meals: mealData.savedMeals.length,
                missing,
              })}
          </p>
        );
      })()}

      {/* Theme Override */}
      <FullscreenThemeSelect
        value={c.theme}
        onChange={(theme) => set({ theme })}
        defaultOptionKey="configSections.fullscreen-meal-planner.themeDefault"
      />

      {/* Density */}
      <LabeledSelect
        label={t('common.density')}
        value={c.density ?? 'cozy'}
        onChange={(v) => set({ density: v })}
        options={DENSITY_OPTIONS}
      />

      {/* Typography Size */}
      <LabeledSelect
        label={t('configSections.fullscreen-meal-planner.typographySize')}
        value={c.typographySize ?? 'medium'}
        onChange={(v) => set({ typographySize: v })}
        options={typographySizeOptions}
      />

      {/* Display Toggles */}
      {reads.pictures && (
        <Toggle label={t('configSections.fullscreen-meal-planner.showEmoji')} checked={c.showEmoji !== false} onChange={(v) => set({ showEmoji: v })} />
      )}
      {reads.cookingTime && (
        <Toggle label={t('configSections.fullscreen-meal-planner.showPrepTime')} checked={c.showPrepTime !== false} onChange={(v) => set({ showPrepTime: v })} />
      )}
      {reads.tags && (
        <Toggle label={t('configSections.fullscreen-meal-planner.showTags')} checked={c.showTags !== false} onChange={(v) => set({ showTags: v })} />
      )}
      {reads.ratings && (
        <Toggle label={t('configSections.fullscreen-meal-planner.showFamilyRatings')} checked={c.showFamilyRatings !== false} onChange={(v) => set({ showFamilyRatings: v })} />
      )}
      {reads.difficulty && (
        <Toggle label={t('configSections.fullscreen-meal-planner.showDifficulty')} checked={!!c.showDifficulty} onChange={(v) => set({ showDifficulty: v })} />
      )}
      {reads.title && (
        <Toggle label={t('common.showTitle')} checked={c.showTitle !== false} onChange={(v) => set({ showTitle: v })} />
      )}

      {/* Tap-to-open recipe */}
      {reads.tapAction && (
        <>
          <LabeledSelect
            label={t('configSections.fullscreen-meal-planner.tapRecipeAction')}
            value={c.tapRecipeAction ?? 'off'}
            onChange={(v) => set({ tapRecipeAction: v })}
            options={[
              { value: 'off', label: t('configSections.fullscreen-meal-planner.tapRecipeActionOff') },
              { value: 'qr', label: t('configSections.fullscreen-meal-planner.tapRecipeActionQr') },
              { value: 'card', label: t('configSections.fullscreen-meal-planner.tapRecipeActionCard') },
              { value: 'iframe', label: t('configSections.fullscreen-meal-planner.tapRecipeActionIframe') },
            ]}
          />
          {c.tapRecipeAction === 'card' && (
            <p className="text-[11px] text-hs-text-faint leading-relaxed">
              {t('configSections.fullscreen-meal-planner.tapRecipeActionCardHint')}
            </p>
          )}
          {c.tapRecipeAction === 'iframe' && (
            <p className="text-[11px] text-hs-text-faint leading-relaxed">
              {t('configSections.fullscreen-meal-planner.tapRecipeActionIframeHint')}
            </p>
          )}
          {(c.tapRecipeAction === 'qr' || c.tapRecipeAction === 'iframe') && (
            <p className="text-[11px] text-hs-text-faint leading-relaxed">
              {t('configSections.fullscreen-meal-planner.tapRecipeActionNoLinkHint')}
            </p>
          )}
        </>
      )}

      {/* Every view follows it: ticking the grocery list, opening and stepping through recipes, rating dinner, searching the recipe book and scrolling on the wall */}
      <Toggle
        label={t('configSections.fullscreen-meal-planner.interactive')}
        checked={c.interactive !== false}
        onChange={(v) => set({ interactive: v })}
      />
      <p className="text-[11px] text-hs-text-faint leading-relaxed">
        {t('configSections.fullscreen-meal-planner.interactiveHint')}
      </p>

      {/* Accent Color */}
      <FullscreenAccentPicker
        label={t('configSections.fullscreen-meal-planner.accentColor')}
        value={c.accentColor}
        themeAccent={themeAccent}
        onChange={(v) => set({ accentColor: v })}
      />

      {/* Shared meal settings, then the phone, then the plan: the same order
          and words as the small planner's panel. */}
      <p className="text-[11px] text-hs-text-faint leading-relaxed">
        {t('configSections.meal-planner.sharedSettingsPrefix')}{' '}
        <Link href={settingsPath({ kind: 'defaults', page: 'meals' })} className="text-hs-accent hover:text-hs-accent-hover underline">{t('configSections.meal-planner.sharedSettingsLink')}</Link>{' '}
        {t('configSections.meal-planner.sharedSettingsSuffix')}
      </p>
      <PhoneSurfaceLinks context="meals" />

      <MealPlanLauncher meals={meals} accentColor={accentColor} countKeyPrefix="fullscreen-meal-planner" open={showModal} onOpenChange={setShowModal} />
    </>
  );
}
