'use client';

import type { SavedMeal, MealIngredient, GroceryCategory } from '@/types/config';
import { TAG_OPTIONS, inputStyle, cardStyle } from './meals-shared';
import { FOOD_EMOJIS } from '@/components/modules/meal-planner/types';
import {
  GROCERY_CATEGORIES,
  GROCERY_CATEGORY_ORDER,
} from '@/lib/grocery-utils';

interface MealsLibraryViewProps {
  savedMeals: SavedMeal[];
  filteredMeals: SavedMeal[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filterTag: string;
  setFilterTag: (tag: string) => void;
  editingMeal: SavedMeal | 'new' | null;
  setEditingMeal: (meal: SavedMeal | 'new' | null) => void;
  formName: string;
  setFormName: (v: string) => void;
  formEmoji: string;
  setFormEmoji: (v: string) => void;
  formPrepTime: number | '';
  setFormPrepTime: (v: number | '') => void;
  formCookTime: number | '';
  setFormCookTime: (v: number | '') => void;
  formServings: number | '';
  setFormServings: (v: number | '') => void;
  formDifficulty: 'easy' | 'medium' | 'hard';
  setFormDifficulty: (v: 'easy' | 'medium' | 'hard') => void;
  formTags: string[];
  setFormTags: React.Dispatch<React.SetStateAction<string[]>>;
  formIngredients: MealIngredient[];
  setFormIngredients: React.Dispatch<React.SetStateAction<MealIngredient[]>>;
  formRecipeUrl: string;
  setFormRecipeUrl: (v: string) => void;
  formNotes: string;
  setFormNotes: (v: string) => void;
  formRating: number;
  setFormRating: (v: number) => void;
  formFavorite: boolean;
  setFormFavorite: (v: boolean) => void;
  nameInputRef: React.RefObject<HTMLInputElement | null>;
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
  editingMeal,
  setEditingMeal,
  formName,
  setFormName,
  formEmoji,
  setFormEmoji,
  formPrepTime,
  setFormPrepTime,
  formCookTime,
  setFormCookTime,
  formServings,
  setFormServings,
  formDifficulty,
  setFormDifficulty,
  formTags,
  setFormTags,
  formIngredients,
  setFormIngredients,
  formRecipeUrl,
  setFormRecipeUrl,
  formNotes,
  setFormNotes,
  formRating,
  setFormRating,
  formFavorite,
  setFormFavorite,
  nameInputRef,
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
          ...inputStyle,
          marginBottom: 12,
        }}
      />

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' as const, paddingBottom: 12 }}>
        {['All', 'Favorites', 'Quick', 'Healthy', 'Comfort', 'Kid-Friendly'].map((tag) => {
          const isActive = filterTag === tag;
          return (
            <button
              key={tag}
              onClick={() => setFilterTag(tag)}
              aria-label={`Filter by ${tag}`}
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
              {tag}
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
              ...cardStyle,
              marginBottom: 8,
              cursor: 'pointer',
              textAlign: 'left' as const,
              color: 'inherit',
              fontFamily: 'inherit',
            }}
          >
            {/* Emoji */}
            <span style={{ fontSize: 32, flexShrink: 0 }}>{meal.emoji ?? '🍽️'}</span>

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
      {editingMeal !== null && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            top: 60,
            zIndex: 200,
            background: '#0a0a0a',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '16px 16px 0 0',
            animation: 'slideUp 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
          }}
        >
          {/* Form header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '14px 16px',
              borderBottom: '1px solid #262626',
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => setEditingMeal(null)}
              style={{
                padding: '4px 0',
                minHeight: 44,
                fontSize: 14,
                fontWeight: 600,
                border: 'none',
                background: 'transparent',
                color: '#f59e0b',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
              aria-label="Go back"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              Back
            </button>
            <span style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#fafafa' }}>
              {editingMeal === 'new' ? 'Add Meal' : 'Edit Meal'}
            </span>
            <div style={{ width: 60 }} />
          </div>

          {/* Scrollable form body */}
          <div style={{ flex: 1, overflow: 'auto', padding: 16, scrollbarWidth: 'none' as const }}>
            {/* Name */}
            <div style={{ marginBottom: 18 }}>
              <label htmlFor="meal-name" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>
                Meal Name
              </label>
              <input
                id="meal-name"
                ref={nameInputRef}
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Chicken Stir Fry"
                style={inputStyle}
              />
            </div>

            {/* Emoji picker */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>
                Emoji
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6 }}>
                {FOOD_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => setFormEmoji(emoji)}
                    aria-label={`Select ${emoji}`}
                    aria-pressed={formEmoji === emoji}
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      borderRadius: 8,
                      border: formEmoji === emoji ? '2px solid #f59e0b' : '2px solid transparent',
                      background: formEmoji === emoji ? 'rgba(245,158,11,0.12)' : '#171717',
                      cursor: 'pointer',
                      fontSize: 22,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Prep time + Cook time (side by side) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
              <div>
                <label htmlFor="meal-prep" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>
                  Prep Time
                </label>
                <input
                  id="meal-prep"
                  type="number"
                  value={formPrepTime}
                  onChange={(e) => setFormPrepTime(e.target.value ? Number(e.target.value) : '')}
                  placeholder="min"
                  style={inputStyle}
                />
              </div>
              <div>
                <label htmlFor="meal-cook" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>
                  Cook Time
                </label>
                <input
                  id="meal-cook"
                  type="number"
                  value={formCookTime}
                  onChange={(e) => setFormCookTime(e.target.value ? Number(e.target.value) : '')}
                  placeholder="min"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Servings + Difficulty (side by side) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
              <div>
                <label htmlFor="meal-servings" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>
                  Servings
                </label>
                <input
                  id="meal-servings"
                  type="number"
                  value={formServings}
                  onChange={(e) => setFormServings(e.target.value ? Number(e.target.value) : '')}
                  placeholder="4"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>
                  Difficulty
                </label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['easy', 'medium', 'hard'] as const).map((d) => {
                    const diffColors: Record<typeof d, { color: string; bg: string; border: string }> = {
                      easy:   { color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: '#10b981' },
                      medium: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: '#f59e0b' },
                      hard:   { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: '#ef4444' },
                    };
                    const isSelected = formDifficulty === d;
                    return (
                      <button
                        key={d}
                        onClick={() => setFormDifficulty(d)}
                        style={{
                          flex: 1,
                          padding: '10px 4px',
                          minHeight: 44,
                          fontSize: 12,
                          fontWeight: 600,
                          borderRadius: 8,
                          border: isSelected ? `1px solid ${diffColors[d].border}` : '1px solid #262626',
                          background: isSelected ? diffColors[d].bg : '#171717',
                          color: isSelected ? diffColors[d].color : '#525252',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {d === 'easy' ? 'Easy' : d === 'medium' ? 'Med' : 'Hard'}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Tags */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>
                Tags
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {TAG_OPTIONS.map((tag) => {
                  const isActive = formTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => {
                        setFormTags((prev) =>
                          isActive ? prev.filter((t) => t !== tag) : [...prev, tag],
                        );
                      }}
                      style={{
                        padding: '6px 14px',
                        minHeight: 36,
                        fontSize: 12,
                        fontWeight: 600,
                        borderRadius: 999,
                        border: isActive ? '1px solid #f59e0b' : '1px solid #262626',
                        background: isActive ? 'rgba(245,158,11,0.15)' : '#171717',
                        color: isActive ? '#f59e0b' : '#525252',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Ingredients */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>
                Ingredients
              </label>
              {formIngredients.map((ing, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input
                    type="text"
                    placeholder="Name"
                    value={ing.name}
                    onChange={(e) => {
                      const next = [...formIngredients];
                      next[idx] = { ...next[idx], name: e.target.value };
                      setFormIngredients(next);
                    }}
                    style={{ ...inputStyle, flex: 2 }}
                  />
                  <input
                    type="text"
                    placeholder="Amount"
                    value={ing.amount ?? ''}
                    onChange={(e) => {
                      const next = [...formIngredients];
                      next[idx] = { ...next[idx], amount: e.target.value };
                      setFormIngredients(next);
                    }}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <select
                    value={ing.category ?? 'other'}
                    onChange={(e) => {
                      const next = [...formIngredients];
                      next[idx] = { ...next[idx], category: e.target.value as GroceryCategory };
                      setFormIngredients(next);
                    }}
                    style={{
                      ...inputStyle,
                      flex: 1,
                      appearance: 'none' as const,
                      paddingRight: 8,
                    }}
                  >
                    {GROCERY_CATEGORY_ORDER.map((cat) => (
                      <option key={cat} value={cat}>
                        {GROCERY_CATEGORIES[cat]}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      setFormIngredients((prev) => prev.filter((_, i) => i !== idx));
                    }}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 8,
                      border: '1px solid #262626',
                      background: 'transparent',
                      color: '#ef4444',
                      fontSize: 18,
                      cursor: 'pointer',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'inherit',
                    }}
                  >
                    &#215;
                  </button>
                </div>
              ))}
              <button
                onClick={() => setFormIngredients((prev) => [...prev, { name: '', amount: '', category: 'other' }])}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  minHeight: 44,
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 10,
                  border: '1px dashed #262626',
                  background: 'transparent',
                  color: '#525252',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                + Add ingredient
              </button>
            </div>

            {/* Recipe URL */}
            <div style={{ marginBottom: 18 }}>
              <label htmlFor="meal-url" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>
                Recipe URL
              </label>
              <input
                id="meal-url"
                type="url"
                value={formRecipeUrl}
                onChange={(e) => setFormRecipeUrl(e.target.value)}
                placeholder="https://..."
                style={inputStyle}
              />
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 18 }}>
              <label htmlFor="meal-notes" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>
                Notes
              </label>
              <textarea
                id="meal-notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Any notes about this meal..."
                rows={3}
                style={{
                  ...inputStyle,
                  resize: 'none' as const,
                  minHeight: 80,
                }}
              />
            </div>

            {/* Rating */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 }}>
                Rating
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setFormRating(formRating === star ? 0 : star)}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 8,
                      border: 'none',
                      background: star <= formRating ? 'rgba(245,158,11,0.2)' : '#171717',
                      color: star <= formRating ? '#f59e0b' : '#333',
                      fontSize: 22,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    &#9733;
                  </button>
                ))}
              </div>
            </div>

            {/* Favorite */}
            <button
              onClick={() => setFormFavorite(!formFavorite)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                minHeight: 48,
                borderRadius: 12,
                border: formFavorite ? '1px solid rgba(239,68,68,0.3)' : '1px solid #262626',
                background: formFavorite ? 'rgba(239,68,68,0.08)' : '#171717',
                cursor: 'pointer',
                marginBottom: 24,
                fontFamily: 'inherit',
                color: 'inherit',
              }}
            >
              <span style={{ fontSize: 22, color: formFavorite ? '#ef4444' : '#333' }}>
                {formFavorite ? '\u2665' : '\u2661'}
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, color: formFavorite ? '#ef4444' : '#525252' }}>
                {formFavorite ? 'Favorited' : 'Add to Favorites'}
              </span>
            </button>

            {/* Bottom spacing so content doesn't hide behind save bar */}
            <div style={{ height: 20 }} />
          </div>

          {/* Pinned save bar */}
          <div style={{ padding: '12px 16px 28px', borderTop: '1px solid #262626', flexShrink: 0 }}>
            {saveError && (
              <div style={{ fontSize: 13, color: '#ef4444', marginBottom: 8, textAlign: 'center' }}>
                {saveError}
              </div>
            )}
            <button
              onClick={saveMealForm}
              disabled={!formName.trim() || saving}
              style={{
                width: '100%',
                padding: '14px 24px',
                minHeight: 50,
                fontSize: 15,
                fontWeight: 700,
                borderRadius: 12,
                border: 'none',
                cursor: formName.trim() && !saving ? 'pointer' : 'default',
                background: formName.trim() && !saving ? '#f59e0b' : '#333',
                color: formName.trim() && !saving ? '#000' : '#666',
                fontFamily: 'inherit',
              }}
            >
              {saving ? 'Saving...' : editingMeal === 'new' ? 'Save Meal' : 'Save Changes'}
            </button>
            {editingMeal !== 'new' && (
              <button
                onClick={deleteMeal}
                style={{
                  width: '100%',
                  padding: '12px',
                  minHeight: 44,
                  marginTop: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 10,
                  border: 'none',
                  background: 'transparent',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Delete Meal
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
