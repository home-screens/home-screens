'use client';

import type { SavedMeal } from '@/types/config';
import type { MealFormState } from '../hooks/useMealForm';
import { INPUT_STYLE, CARD_STYLE } from './meals-shared';
import { LIBRARY_FILTERS, DEFAULT_MEAL_EMOJI, formatTagLabel } from '@/lib/meal-constants';
import { useTranslate } from '@/i18n';
import MealFormOverlay from './MealFormOverlay';

interface MealsLibraryViewProps {
  savedMeals: SavedMeal[];
  filteredMeals: SavedMeal[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filterTag: string;
  setFilterTag: (tag: string) => void;
  form: MealFormState;
  openNewMealForm: () => void;
  openEditMealForm: (meal: SavedMeal) => void;
  saveMealForm: () => Promise<void>;
  deleteMeal: () => void;
  toggleFavorite: (mealId: string) => Promise<void>;
  saving: boolean;
  saveError: string | null;
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
}: MealsLibraryViewProps) {
  const t = useTranslate('remote');
  // Difficulty labels live in `core.meal.*` so /remote doesn't have to
  // lazy-fetch the 113KB editor.json just to render three words. Core
  // is already loaded by the remote layout.
  const tCore = useTranslate('core');
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
                border: isActive ? '1px solid #f59e0b' : '1px solid var(--hs-border)',
                cursor: 'pointer',
                background: isActive ? 'rgba(245,158,11,0.15)' : 'var(--hs-bg-panel)',
                color: isActive ? '#f59e0b' : 'var(--hs-text-faint)',
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
          <button
            key={meal.id}
            onClick={() => openEditMealForm(meal)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              ...CARD_STYLE,
              marginBottom: 8,
              cursor: 'pointer',
              textAlign: 'left' as const,
              color: 'inherit',
              fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: 32, flexShrink: 0 }}>{meal.emoji ?? DEFAULT_MEAL_EMOJI}</span>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--hs-text-body)', marginBottom: 4 }}>
                {meal.name}
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--hs-text-faint)' }}>
                {meal.prepTime && <span>{t('mealsTab.library.prepTimeMin', { minutes: meal.prepTime })}</span>}
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

            <span
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(meal.id);
              }}
              role="button"
              tabIndex={0}
              aria-label={meal.isFavorite
                ? t('mealsTab.library.favoriteRemoveAriaLabel')
                : t('mealsTab.library.favoriteAddAriaLabel')}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); toggleFavorite(meal.id); } }}
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
              }}
            >
              {meal.isFavorite ? '♥' : '♡'}
            </span>
          </button>
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
          background: '#f59e0b',
          color: '#000',
          fontSize: 28,
          fontWeight: 300,
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(245,158,11,0.3)',
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
