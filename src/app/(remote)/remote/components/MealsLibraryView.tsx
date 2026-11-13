'use client';

import { FamilyMealRatingButton, FamilyMealSummary } from '@/components/meals/FamilyMealRating';

import type { SavedMeal } from '@/types/config';
import type { MealFormState } from '../hooks/useMealForm';
import type { WallNotices } from '../hooks/useShowRecipeOnWall';
import { INPUT_STYLE, CARD_STYLE, formatShownMinutes } from './meals-shared';
import { LIBRARY_FILTERS, DEFAULT_MEAL_EMOJI, formatTagLabel, type LibraryFilter } from '@/lib/meal-constants';
import { mealShownMinutes } from '@/lib/meal-dish-rules';
import { mealHasRecipe } from '@/lib/meal-recipe';
import { useTranslate } from '@/i18n';
import MealFormOverlay from './MealFormOverlay';
import RecipeWallButton from './RecipeWallButton';
import Glyph from '@/components/ui/Glyph';
import { REMOTE_ACCENT, selectedPillStyle } from './chore-form-styles';
import { withAlpha } from '@/lib/hex-color';

interface MealsLibraryViewProps {
  savedMeals: SavedMeal[];
  filteredMeals: SavedMeal[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filterTag: LibraryFilter;
  setFilterTag: (filter: LibraryFilter) => void;
  form: MealFormState;
  openNewMealForm: () => void;
  openEditMealForm: (meal: SavedMeal) => void;
  saveMealForm: () => Promise<void>;
  deleteMeal: () => void;
  toggleFavorite: (mealId: string) => Promise<void>;
  saving: boolean;
  saveError: string | null;
  /** Where "Show on the wall" says how it went. */
  wallNotices: WallNotices;
}

export default function MealsLibraryView({
  savedMeals,
  filteredMeals,
  searchQuery,
  setSearchQuery,
  filterTag,
  setFilterTag,
  form,
  openNewMealForm,
  openEditMealForm,
  saveMealForm,
  deleteMeal,
  toggleFavorite,
  saving,
  saveError,
  wallNotices,
}: MealsLibraryViewProps) {
  const t = useTranslate('remote');
  // Difficulty labels live in `core.meal.*` so /remote doesn't have to
  // lazy-fetch the 113KB editor.json just to render three words. Core
  // is already loaded by the remote layout.
  const tCore = useTranslate('core');
  // A meal's cooking time as the phone writes it everywhere else ("2h 20m").
  const cookingTime = (meal: SavedMeal) => {
    const shown = mealShownMinutes(meal);
    return shown ? <span>{formatShownMinutes(shown, t)}</span> : null;
  };
  return (
    <div style={{ paddingBottom: 80 }}>
      <input
        type="text"
        placeholder={t('mealsTab.library.searchPlaceholder')}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{
          ...INPUT_STYLE,
          marginBottom: 12,
        }}
      />

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' as const, paddingBottom: 12 }}>
        {LIBRARY_FILTERS.map((tag) => {
          const isActive = filterTag === tag;
          const label = t(`mealsTab.library.filters.${tag}`);
          return (
            <button
              key={tag}
              onClick={() => setFilterTag(tag)}
              aria-label={t('mealsTab.library.filterByAriaLabel', { label })}
              aria-pressed={isActive}
              style={{
                padding: '6px 14px',
                minHeight: 36,
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 999,
                ...selectedPillStyle(isActive),
                cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap',
                fontFamily: 'inherit',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* The wall button is an icon only: say what it and the card do, once
          some meal on the list has one. */}
      {filteredMeals.some(mealHasRecipe) && (
        <p style={{ fontSize: 12, lineHeight: '17px', color: 'var(--hs-text-faint)', margin: '-2px 0 10px' }}>
          {t('mealsTab.library.hint')}
        </p>
      )}

      {filteredMeals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 16px' }}>
          <p style={{ fontSize: 15, color: 'var(--hs-text-faint)', marginBottom: 4 }}>
            {savedMeals.length === 0
              ? t('mealsTab.library.empty.titleNoMeals')
              : t('mealsTab.library.empty.titleNoMatches')}
          </p>
          <p style={{ fontSize: 13, color: 'var(--hs-text-faint)' }}>
            {savedMeals.length === 0
              ? t('mealsTab.library.empty.hintNoMeals')
              : t('mealsTab.library.empty.hintNoMatches')}
          </p>
        </div>
      ) : (
        filteredMeals.map((meal) => (
          <div
            key={meal.id}
            data-testid="library-card"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              ...CARD_STYLE,
              marginBottom: 8,
            }}
          >
            {/* The card's left part opens the meal, out to the card's own edge;
                the wall button and the heart are buttons of their own beside it. */}
            <button
              type="button"
              onClick={() => openEditMealForm(meal)}
              style={{
                flex: 1,
                minWidth: 0,
                alignSelf: 'stretch',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                margin: '-14px 0 -14px -14px',
                padding: '14px 0 14px 14px',
                border: 'none',
                borderRadius: '12px 0 0 12px',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left' as const,
                color: 'inherit',
                fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: 32, flexShrink: 0 }}><Glyph value={meal.emoji ?? DEFAULT_MEAL_EMOJI} fallback={DEFAULT_MEAL_EMOJI} /></span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--hs-text-body)', marginBottom: 4 }}>
                  {meal.name}
                </div>
                <FamilyMealSummary meal={meal} style={{ display: 'block', fontSize: 12 }} />
                <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--hs-text-faint)' }}>
                  {/* A side, dessert or drink says so; a main dish needs no label. */}
                  {meal.category && meal.category !== 'main' && (
                    <span style={{ fontWeight: 600, color: 'var(--hs-text-muted)' }}>{tCore(`meal.kind.${meal.category}`)}</span>
                  )}
                  {cookingTime(meal)}
                  {meal.difficulty && <span>{tCore(`meal.difficulty.${meal.difficulty}`)}</span>}
                </div>
                {meal.tags && meal.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                    {meal.tags.map((tag) => (
                      <span
                        key={tag}
                        style={{
                          fontSize: 10,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'var(--hs-bg-card)',
                          color: 'var(--hs-text-muted)',
                        }}
                      >
                        {formatTagLabel(tag)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>

            <FamilyMealRatingButton meal={meal} style={{ fontSize: 12 }} />
            {mealHasRecipe(meal) && <RecipeWallButton meal={meal} notices={wallNotices} />}

            <button
              type="button"
              onClick={() => toggleFavorite(meal.id)}
              aria-label={meal.isFavorite
                ? t('mealsTab.library.favoriteRemoveAriaLabel')
                : t('mealsTab.library.favoriteAddAriaLabel')}
              style={{
                fontSize: 20,
                flexShrink: 0,
                color: meal.isFavorite ? 'var(--hs-danger)' : 'var(--hs-border-strong)',
                cursor: 'pointer',
                padding: 4,
                minWidth: 44,
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'transparent',
                fontFamily: 'inherit',
              }}
            >
              {meal.isFavorite ? '♥' : '♡'}
            </button>
          </div>
        ))
      )}

      <button
        onClick={openNewMealForm}
        aria-label={t('mealsTab.library.fabAriaLabel')}
        style={{
          position: 'fixed',
          bottom: 80,
          right: 20,
          width: 52,
          height: 52,
          borderRadius: 16,
          background: REMOTE_ACCENT,
          color: '#000',
          fontSize: 28,
          fontWeight: 300,
          border: 'none',
          cursor: 'pointer',
          boxShadow: `0 4px 20px ${withAlpha(REMOTE_ACCENT, 0.3)}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          fontFamily: 'inherit',
        }}
      >
        +
      </button>

      {form.editingMeal !== null && (
        <MealFormOverlay
          form={form}
          onSave={saveMealForm}
          onDelete={deleteMeal}
          saving={saving}
          saveError={saveError}
        />
      )}
    </div>
  );
}
