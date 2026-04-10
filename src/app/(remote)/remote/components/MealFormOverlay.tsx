'use client';

import type { MealIngredient, GroceryCategory } from '@/types/config';
import type { MealFormState } from '../hooks/useMealForm';
import { INPUT_STYLE, LABEL_STYLE } from './meals-shared';
import { MEAL_TAGS, FOOD_EMOJIS, formatTagLabel, normalizeTag, DIFFICULTY_COLORS } from '@/lib/meal-constants';
import {
  GROCERY_CATEGORIES,
  GROCERY_CATEGORY_ORDER,
} from '@/lib/grocery-utils';
import FormOverlay from './FormOverlay';

interface MealFormOverlayProps {
  form: MealFormState;
  onSave: () => Promise<void>;
  onDelete: () => void;
  saving: boolean;
  saveError: string | null;
}

export default function MealFormOverlay({
  form,
  onSave,
  onDelete,
  saving,
  saveError,
}: MealFormOverlayProps) {
  const {
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
  } = form;

  const footer = (
    <div
      style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--hs-border)',
      }}
    >
      {saveError && (
        <div style={{ fontSize: 13, color: 'var(--hs-danger)', marginBottom: 8, textAlign: 'center' }}>
          {saveError}
        </div>
      )}
      <button
        onClick={onSave}
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
          background: formName.trim() && !saving ? '#f59e0b' : 'var(--hs-text-faint)',
          color: formName.trim() && !saving ? '#000' : 'var(--hs-text-muted)',
          opacity: formName.trim() && !saving ? 1 : 0.5,
          transition: 'all 0.15s',
        }}
      >
        {saving ? 'Saving...' : editingMeal === 'new' ? 'Save Meal' : 'Save Changes'}
      </button>
      {editingMeal !== 'new' && (
        <button
          onClick={onDelete}
          style={{
            width: '100%',
            padding: '12px',
            minHeight: 44,
            marginTop: 8,
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 10,
            border: 'none',
            background: 'color-mix(in srgb, var(--hs-danger) 12%, transparent)',
            color: 'var(--hs-danger)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          Delete Meal
        </button>
      )}
    </div>
  );

  return (
    <FormOverlay
      title={editingMeal === 'new' ? 'Add Meal' : 'Edit Meal'}
      onBack={() => setEditingMeal(null)}
      footer={footer}
    >
      {/* Name */}
      <div style={{ marginBottom: 24 }}>
        <div style={LABEL_STYLE}>Meal Name</div>
        <input
          ref={nameInputRef}
          type="text"
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          placeholder="e.g. Chicken Stir Fry"
          style={INPUT_STYLE}
          autoFocus
        />
      </div>

      {/* Emoji picker */}
      <div style={{ marginBottom: 24 }}>
        <div style={LABEL_STYLE}>Emoji</div>
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
                background: formEmoji === emoji ? 'rgba(245,158,11,0.12)' : 'var(--hs-bg-panel)',
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

      {/* Prep time + Cook time */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
        <div>
          <div style={LABEL_STYLE}>Prep Time</div>
          <input
            type="number"
            value={formPrepTime}
            onChange={(e) => setFormPrepTime(e.target.value ? Number(e.target.value) : '')}
            placeholder="min"
            style={INPUT_STYLE}
          />
        </div>
        <div>
          <div style={LABEL_STYLE}>Cook Time</div>
          <input
            type="number"
            value={formCookTime}
            onChange={(e) => setFormCookTime(e.target.value ? Number(e.target.value) : '')}
            placeholder="min"
            style={INPUT_STYLE}
          />
        </div>
      </div>

      {/* Servings + Difficulty */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
        <div>
          <div style={LABEL_STYLE}>Servings</div>
          <input
            type="number"
            value={formServings}
            onChange={(e) => setFormServings(e.target.value ? Number(e.target.value) : '')}
            placeholder="4"
            style={INPUT_STYLE}
          />
        </div>
        <div>
          <div style={LABEL_STYLE}>Difficulty</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['easy', 'medium', 'hard'] as const).map((d) => {
              const hex = DIFFICULTY_COLORS[d];
              const isSelected = formDifficulty === d;
              return (
                <button
                  key={d}
                  onClick={() => setFormDifficulty(d)}
                  style={{
                    flex: 1,
                    padding: '12px 4px',
                    minHeight: 48,
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 12,
                    border: isSelected ? `1px solid ${hex}` : '1px solid var(--hs-border)',
                    background: isSelected ? `${hex}14` : 'var(--hs-bg-panel)',
                    color: isSelected ? hex : 'var(--hs-text-faint)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
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
      <div style={{ marginBottom: 24 }}>
        <div style={LABEL_STYLE}>Tags</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {MEAL_TAGS.map((tag) => {
            const isActive = formTags.some((t) => normalizeTag(t) === tag);
            return (
              <button
                key={tag}
                onClick={() => {
                  setFormTags((prev) =>
                    isActive ? prev.filter((t) => normalizeTag(t) !== tag) : [...prev, tag],
                  );
                }}
                style={{
                  padding: '6px 14px',
                  minHeight: 36,
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 999,
                  border: isActive ? '1px solid #f59e0b' : '1px solid var(--hs-border)',
                  background: isActive ? 'rgba(245,158,11,0.15)' : 'var(--hs-bg-panel)',
                  color: isActive ? '#f59e0b' : 'var(--hs-text-faint)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {formatTagLabel(tag)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Ingredients */}
      <div style={{ marginBottom: 24 }}>
        <div style={LABEL_STYLE}>Ingredients</div>
        {formIngredients.map((ing: MealIngredient, idx: number) => (
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
              style={{ ...INPUT_STYLE, flex: 2 }}
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
              style={{ ...INPUT_STYLE, flex: 1 }}
            />
            <select
              value={ing.category ?? 'other'}
              onChange={(e) => {
                const next = [...formIngredients];
                next[idx] = { ...next[idx], category: e.target.value as GroceryCategory };
                setFormIngredients(next);
              }}
              style={{
                ...INPUT_STYLE,
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
                border: '1px solid var(--hs-border)',
                background: 'transparent',
                color: 'var(--hs-danger)',
                fontSize: 18,
                cursor: 'pointer',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
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
            padding: '12px',
            minHeight: 48,
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 12,
            border: '2px dashed var(--hs-border)',
            background: 'transparent',
            color: 'var(--hs-text-faint)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          + Add ingredient
        </button>
      </div>

      {/* Recipe URL */}
      <div style={{ marginBottom: 24 }}>
        <div style={LABEL_STYLE}>Recipe URL</div>
        <input
          type="url"
          value={formRecipeUrl}
          onChange={(e) => setFormRecipeUrl(e.target.value)}
          placeholder="https://..."
          style={INPUT_STYLE}
        />
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 24 }}>
        <div style={LABEL_STYLE}>Notes</div>
        <textarea
          value={formNotes}
          onChange={(e) => setFormNotes(e.target.value)}
          placeholder="Any notes about this meal..."
          rows={3}
          style={{
            ...INPUT_STYLE,
            resize: 'none' as const,
            minHeight: 80,
          }}
        />
      </div>

      {/* Rating */}
      <div style={{ marginBottom: 24 }}>
        <div style={LABEL_STYLE}>Rating</div>
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
                background: star <= formRating ? 'rgba(245,158,11,0.2)' : 'var(--hs-bg-panel)',
                color: star <= formRating ? '#f59e0b' : 'var(--hs-border-strong)',
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
          border: formFavorite ? '1px solid color-mix(in srgb, var(--hs-danger) 30%, transparent)' : '1px solid var(--hs-border)',
          background: formFavorite ? 'color-mix(in srgb, var(--hs-danger) 8%, transparent)' : 'var(--hs-bg-panel)',
          cursor: 'pointer',
          color: 'inherit',
          transition: 'all 0.15s',
        }}
      >
        <span style={{ fontSize: 22, color: formFavorite ? 'var(--hs-danger)' : 'var(--hs-border-strong)' }}>
          {formFavorite ? '\u2665' : '\u2661'}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: formFavorite ? 'var(--hs-danger)' : 'var(--hs-text-faint)' }}>
          {formFavorite ? 'Favorited' : 'Add to Favorites'}
        </span>
      </button>
    </FormOverlay>
  );
}
