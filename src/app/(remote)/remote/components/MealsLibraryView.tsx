'use client';

import type { SavedMeal } from '@/types/config';
import type { MealFormState } from '../hooks/useMealForm';
import { INPUT_STYLE, CARD_STYLE } from './meals-shared';
import { LIBRARY_FILTERS, formatTagLabel, DEFAULT_MEAL_EMOJI } from '@/lib/meal-constants';
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
  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Search input */}
      <input
        type="text"
        placeholder="Search meals..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{
          ...INPUT_STYLE,
          marginBottom: 12,
        }}
      />

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' as const, paddingBottom: 12 }}>
        {LIBRARY_FILTERS.map((tag) => {
          const isActive = filterTag === tag;
          return (
            <button
              key={tag}
              onClick={() => setFilterTag(tag)}
              aria-label={`Filter by ${formatTagLabel(tag)}`}
              aria-pressed={isActive}
              style={{
                padding: '6px 14px',
                minHeight: 36,
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 999,
                border: isActive ? '1px solid #f59e0b' : '1px solid #262626',
                cursor: 'pointer',
                background: isActive ? 'rgba(245,158,11,0.15)' : '#171717',
                color: isActive ? '#f59e0b' : '#525252',
                flexShrink: 0,
                whiteSpace: 'nowrap',
                fontFamily: 'inherit',
              }}
            >
              {formatTagLabel(tag)}
            </button>
          );
        })}
      </div>

      {/* Meal list */}
      {filteredMeals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 16px' }}>
          <p style={{ fontSize: 15, color: '#737373', marginBottom: 4 }}>
            {savedMeals.length === 0 ? 'No meals yet' : 'No matches'}
          </p>
          <p style={{ fontSize: 13, color: '#525252' }}>
            {savedMeals.length === 0 ? 'Tap the + button to add your first meal.' : 'Try a different search or filter.'}
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
            {/* Emoji */}
            <span style={{ fontSize: 32, flexShrink: 0 }}>{meal.emoji ?? DEFAULT_MEAL_EMOJI}</span>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#e5e5e5', marginBottom: 4 }}>
                {meal.name}
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: 12, color: '#525252' }}>
                {meal.prepTime && <span>{meal.prepTime}m prep</span>}
                {meal.difficulty && <span>{meal.difficulty}</span>}
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
                        background: '#262626',
                        color: '#a3a3a3',
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Favorite */}
            <span
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(meal.id);
              }}
              role="button"
              tabIndex={0}
              aria-label={meal.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); toggleFavorite(meal.id); } }}
              style={{
                fontSize: 20,
                flexShrink: 0,
                color: meal.isFavorite ? '#ef4444' : '#333',
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

      {/* FAB */}
      <button
        onClick={openNewMealForm}
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

      {/* ── Meal form overlay ── */}
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
